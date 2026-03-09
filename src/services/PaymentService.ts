import { AppDataSource } from "../config/data-source";
import { In } from "typeorm";
import { Payment, PaymentStatus, PaymentType, PaymentMethod } from "../entities/Payment";
import { Transaction, TransactionType } from "../entities/Transaction";
import payhereService, { PayHereCheckoutParams } from "./PayHereService";
import { User } from "../entities/User";
import { CommissionService } from "./CommissionService";
import { Enrollment } from "../entities/Enrollment";
import { Booking, BookingStatus } from "../entities/Booking";
import { Course } from "../entities/Course";

class PaymentService {
    private paymentRepo = AppDataSource.getRepository(Payment);
    private transactionRepo = AppDataSource.getRepository(Transaction);
    private enrollmentRepo = AppDataSource.getRepository(Enrollment);
    private bookingRepo = AppDataSource.getRepository(Booking);
    private courseRepo = AppDataSource.getRepository(Course);

    /**
     * Initializes a PayHere payment session.
     * Returns checkout params for the frontend to POST to PayHere's hosted page.
     */
    async initializePayment(params: {
        userId: string;
        amount: number;
        currency: string;
        type: PaymentType;
        referenceId: string;
        recipientId?: string;
        itemDescription?: string;
        // Customer info for PayHere
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
    }): Promise<{
        checkoutParams: PayHereCheckoutParams | null;
        checkoutUrl: string | null;
        paymentId: string;
        amount: number;
        isFree: boolean;
    }> {
        const {
            userId,
            amount,
            currency,
            type,
            referenceId,
            recipientId,
            itemDescription = "LMS Payment",
            firstName = "Student",
            lastName = "User",
            email = "student@lms.com",
            phone,
        } = params;

        // Platform fee mapping using CommissionService
        const { platformFee } = CommissionService.calculate(amount);

        let payment = this.paymentRepo.create({
            userId,
            amount,
            platformFee,
            currency,
            paymentType: type,
            referenceId,
            recipientId,
            paymentMethod: PaymentMethod.PAYHERE,
            paymentStatus: PaymentStatus.PENDING,
        });

        // Save payment entity to get a valid UUID — this UUID becomes the PayHere order_id
        payment = await this.paymentRepo.save(payment);

        try {
            // Free items bypass PayHere
            if (amount <= 0) {
                payment.paymentStatus = PaymentStatus.COMPLETED;
                payment.paymentDate = new Date();
                await this.paymentRepo.save(payment);

                await this.createTransactions(payment.id, userId, recipientId, amount, platformFee);

                return {
                    checkoutParams: null,
                    checkoutUrl: null,
                    paymentId: payment.id,
                    amount: 0,
                    isFree: true,
                };
            }

            // Build PayHere checkout parameters
            // The payment DB UUID is used as the order_id so we can look it up on notify
            const checkoutParams = payhereService.buildCheckoutParams({
                orderId: payment.id,
                amount,
                currency,
                itemDescription,
                firstName,
                lastName,
                email,
                phone,
            });

            // Store the gateway order reference (same as payment.id, but explicit)
            payment.gatewayOrderId = payment.id;
            await this.paymentRepo.save(payment);

            return {
                checkoutParams,
                checkoutUrl: payhereService.getCheckoutUrl(),
                paymentId: payment.id,
                amount,
                isFree: false,
            };
        } catch (error) {
            payment.paymentStatus = PaymentStatus.FAILED;
            payment.failureReason = "Failed to initialize payment gateway.";
            await this.paymentRepo.save(payment);
            throw error;
        }
    }

    /**
     * Once a payment is cleared by PayHere via the notify callback, permanently confirm it.
     * The `paymentId` here is our DB payment UUID, which is also the PayHere order_id.
     */
    async confirmPaymentSuccess(paymentId: string): Promise<Payment | null> {
        const payment = await this.paymentRepo.findOne({
            where: { id: paymentId },
        });

        if (!payment) {
            console.warn(`PayHere Notify: payment ${paymentId} not found in DB`);
            return null;
        }

        if (payment.paymentStatus === PaymentStatus.COMPLETED) {
            // Already processed (idempotency safety check)
            return payment;
        }

        payment.paymentStatus = PaymentStatus.COMPLETED;
        payment.paymentDate = new Date();
        await this.paymentRepo.save(payment);

        await this.createTransactions(
            payment.id,
            payment.userId,
            payment.recipientId,
            payment.amount,
            payment.platformFee
        );

        // -- FULFILLMENT LOGIC --
        try {
            if (payment.paymentType === PaymentType.COURSE_ENROLLMENT) {
                // Check if already enrolled
                const existing = await this.enrollmentRepo.findOne({
                    where: { studentId: payment.userId, courseId: payment.referenceId }
                });

                if (!existing) {
                    const enrollment = this.enrollmentRepo.create({
                        studentId: payment.userId,
                        courseId: payment.referenceId,
                        status: "active",
                        progressPercentage: 0,
                    });
                    await this.enrollmentRepo.save(enrollment);

                    // Increment course enrollment count
                    await this.courseRepo.increment({ id: payment.referenceId }, "enrollmentCount", 1);
                }
            } else if (payment.paymentType === PaymentType.BULK_COURSE_ENROLLMENT) {
                // Bulk enrollment: courseIds stored in metadata
                const courseIds: string[] = payment.metadata?.courseIds ?? [];
                for (const courseId of courseIds) {
                    try {
                        const existing = await this.enrollmentRepo.findOne({
                            where: { studentId: payment.userId, courseId }
                        });
                        if (!existing) {
                            const enrollment = this.enrollmentRepo.create({
                                studentId: payment.userId,
                                courseId,
                                status: "active",
                                progressPercentage: 0,
                            });
                            await this.enrollmentRepo.save(enrollment);
                            await this.courseRepo.increment({ id: courseId }, "enrollmentCount", 1);
                        }
                    } catch (err) {
                        console.error(`Bulk enrollment failed for courseId ${courseId}:`, err);
                    }
                }
            } else if (payment.paymentType === PaymentType.BOOKING_SESSION) {
                // Confirm the booking
                const booking = await this.bookingRepo.findOne({
                    where: { id: payment.referenceId }
                });

                if (booking && (booking.status === BookingStatus.PENDING_PAYMENT || booking.status === BookingStatus.PENDING)) {
                    // Epic 2.7: Payment success -> CONFIRMED
                    booking.status = BookingStatus.CONFIRMED;
                    booking.paymentId = payment.id;
                    booking.paymentExpiresAt = undefined;
                    await this.bookingRepo.save(booking);
                }
            }
        } catch (fulfillmentError) {
            console.error(`Fulfillment failed for payment ${payment.id}:`, fulfillmentError);
            // Non-fatal, payment succeeded. Admins can manually fix or a cron can retry later.
        }

        return payment;
    }

    /**
     * Handle failed payment from PayHere notification.
     * `paymentId` is our DB UUID (= PayHere order_id).
     */
    async confirmPaymentFailure(paymentId: string, errorMsg?: string): Promise<Payment | null> {
        const payment = await this.paymentRepo.findOne({
            where: { id: paymentId },
        });

        if (!payment) return null;

        payment.paymentStatus = PaymentStatus.FAILED;
        payment.failureReason = errorMsg || "Declined by processor.";
        await this.paymentRepo.save(payment);

        // Cancel corresponding booking if it's strictly in PENDING_PAYMENT
        if (payment.paymentType === PaymentType.BOOKING_SESSION && payment.referenceId) {
            try {
                const booking = await this.bookingRepo.findOne({
                    where: { id: payment.referenceId },
                    relations: ["slot"]
                });

                if (booking && booking.status === BookingStatus.PENDING_PAYMENT) {
                    booking.status = BookingStatus.CANCELLED;
                    booking.cancellationReason = "Auto-cancelled due to payment failure.";
                    booking.cancelledAt = new Date();
                    await this.bookingRepo.save(booking);

                    // Revert slot availability
                    if (booking.slot) {
                        const slot = booking.slot;
                        const { AvailabilitySlot, SlotStatus } = require("../entities/AvailabilitySlot");
                        const slotRepo = AppDataSource.getRepository(AvailabilitySlot);

                        slot.currentBookings = Math.max(0, slot.currentBookings - 1);
                        if (slot.currentBookings < slot.maxBookings) {
                            slot.status = SlotStatus.AVAILABLE;
                        }
                        await slotRepo.save(slot);
                    }
                }
            } catch (err) {
                console.error(`Failed to cancel booking ${payment.referenceId} after payment failure:`, err);
            }
        }

        return payment;
    }

    /**
     * Creates the underlying financial ledger entries (Transactions)
     */
    private async createTransactions(
        paymentId: string,
        userId: string,
        recipientId: string | undefined, // Not used for ledger entries directly unless we want an earning tx
        totalAmountSpent: number,
        platformFeeAmount: number
    ) {
        const transactions: Transaction[] = [];

        // 1. Record the payment from the student
        const studentTx = this.transactionRepo.create({
            paymentId,
            userId,
            transactionType: TransactionType.PAYMENT,
            amount: totalAmountSpent, // Positive per spec
            description: `Payment for order ${paymentId}`,
        });
        transactions.push(studentTx);

        // 2. We skip PLATFORM_FEE transaction creation here since our platform is abstract 
        // without a specific Admin user ID in the DB, but the `Payment` record accurately tracks `platformFee`.

        await this.transactionRepo.save(transactions);
    }

    /**
     * Initializes a single combined PayHere payment for multiple courses.
     * courseIds + total amount stored so fulfillment can enroll in all of them.
     */
    async initializeBulkPayment(params: {
        userId: string;
        courseIds: string[];
        currency: string;
        itemDescription?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
    }): Promise<{
        checkoutParams: PayHereCheckoutParams | null;
        checkoutUrl: string | null;
        paymentId: string;
        amount: number;
        isFree: boolean;
        courses: { id: string; title: string; price: number }[];
    }> {
        const {
            userId,
            courseIds,
            currency,
            itemDescription,
            firstName = "Student",
            lastName = "User",
            email = "student@lms.com",
            phone,
        } = params;

        if (!courseIds || courseIds.length === 0) {
            throw new Error("No course IDs provided.");
        }

        // Load all courses and validate
        const courses = await this.courseRepo.find({ where: { id: In(courseIds) } });
        if (courses.length === 0) {
            throw new Error("No valid courses found.");
        }

        const courseDetails = courses.map((c) => ({
            id: c.id,
            title: c.title,
            price: Number(c.price) || 0,
        }));

        // Total = sum of all course prices
        const totalAmount = courseDetails.reduce((sum, c) => sum + c.price, 0);
        const { platformFee } = CommissionService.calculate(totalAmount);

        let payment = this.paymentRepo.create({
            userId,
            amount: totalAmount,
            platformFee,
            currency,
            paymentType: PaymentType.BULK_COURSE_ENROLLMENT,
            referenceId: `bulk:${userId}`,   // synthetic reference — real data in metadata
            paymentMethod: PaymentMethod.PAYHERE,
            paymentStatus: PaymentStatus.PENDING,
            metadata: { courseIds: courseDetails.map((c) => c.id) },
        });

        payment = await this.paymentRepo.save(payment);

        // Free (all courses are free)
        if (totalAmount <= 0) {
            payment.paymentStatus = PaymentStatus.COMPLETED;
            payment.paymentDate = new Date();
            await this.paymentRepo.save(payment);
            await this.createTransactions(payment.id, userId, undefined, totalAmount, platformFee);

            // Fulfil enrollments immediately
            for (const c of courseDetails) {
                const existing = await this.enrollmentRepo.findOne({
                    where: { studentId: userId, courseId: c.id }
                });
                if (!existing) {
                    const enrollment = this.enrollmentRepo.create({
                        studentId: userId,
                        courseId: c.id,
                        status: "active",
                        progressPercentage: 0,
                    });
                    await this.enrollmentRepo.save(enrollment);
                    await this.courseRepo.increment({ id: c.id }, "enrollmentCount", 1);
                }
            }

            return {
                checkoutParams: null,
                checkoutUrl: null,
                paymentId: payment.id,
                amount: 0,
                isFree: true,
                courses: courseDetails,
            };
        }

        // Paid — build PayHere checkout
        const desc = itemDescription ||
            `${courseDetails.length} Course${courseDetails.length > 1 ? "s" : ""}: ${courseDetails.map((c) => c.title).join(", ").substring(0, 100)}`;

        const checkoutParams = payhereService.buildCheckoutParams({
            orderId: payment.id,
            amount: totalAmount,
            currency,
            itemDescription: desc,
            firstName,
            lastName,
            email,
            phone,
        });

        payment.gatewayOrderId = payment.id;
        await this.paymentRepo.save(payment);

        return {
            checkoutParams,
            checkoutUrl: payhereService.getCheckoutUrl(),
            paymentId: payment.id,
            amount: totalAmount,
            isFree: false,
            courses: courseDetails,
        };
    }

    async getMyPayments(userId: string) {
        return this.paymentRepo.find({
            where: { userId },
            order: { createdAt: "DESC" },
        });
    }

    async getTransactions(userId: string, type?: TransactionType) {
        const where: any = { userId };
        if (type) where.transactionType = type;

        return this.transactionRepo.find({
            where,
            order: { createdAt: "DESC" },
            relations: ["payment"],
        });
    }

    async getTeacherEarnings(teacherId: string) {
        const payments = await this.paymentRepo.find({
            where: { recipientId: teacherId, paymentStatus: PaymentStatus.COMPLETED },
            order: { createdAt: "DESC" },
        });

        // For now, simulate payout calculation based on Payment records directly
        // Story 2.5 introduces the actual Payout entity
        let totalEarnings = 0;
        let pendingPayout = 0;
        let paidOut = 0;
        let thisMonth = 0;
        let lastMonth = 0;

        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        for (const payment of payments) {
            const netAmount = Number(payment.amount) - Number(payment.platformFee);
            totalEarnings += netAmount;
            pendingPayout += netAmount; // Assumed pending until Story 2.5

            if (payment.paymentDate) {
                const date = new Date(payment.paymentDate);
                if (date >= startOfThisMonth) {
                    thisMonth += netAmount;
                } else if (date >= startOfLastMonth && date <= endOfLastMonth) {
                    lastMonth += netAmount;
                }
            }
        }

        // Return mock transactions for the teacher based on their received payments
        // until we transition to a full ledger approach
        const transactions = payments.map(p => ({
            id: p.id,
            type: "EARNING",
            amount: Number(p.amount) - Number(p.platformFee),
            date: p.paymentDate || p.createdAt,
            description: `Earnings from ${p.paymentType}`,
            payment: p
        }));

        return {
            totalEarnings,
            pendingPayout,
            paidOut,
            thisMonth,
            lastMonth,
            transactions
        };
    }

    // ── MANUAL / BANK-TRANSFER PAYMENTS ──────────────────────────────────────

    /**
     * Create a pending bank-transfer payment record for a single course.
     * No gateway is called; the student will upload a slip separately.
     */
    async initializeBankTransferPayment(params: {
        userId: string;
        amount: number;
        currency: string;
        type: PaymentType;
        referenceId: string;
        recipientId?: string;
    }): Promise<{ paymentId: string; amount: number }> {
        const { userId, amount, currency, type, referenceId, recipientId } = params;
        const { platformFee } = CommissionService.calculate(amount);

        let payment = this.paymentRepo.create({
            userId,
            amount,
            platformFee,
            currency,
            paymentType: type,
            referenceId,
            recipientId,
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            paymentStatus: PaymentStatus.PENDING,
        });
        payment = await this.paymentRepo.save(payment);
        return { paymentId: payment.id, amount };
    }

    /**
     * Create a pending bank-transfer payment record for multiple courses.
     */
    async initializeBulkBankTransfer(params: {
        userId: string;
        courseIds: string[];
        currency: string;
    }): Promise<{ paymentId: string; amount: number; courses: { id: string; title: string; price: number }[] }> {
        const { userId, courseIds, currency } = params;

        const courses = await this.courseRepo.find({ where: { id: In(courseIds) } });
        if (courses.length === 0) throw new Error("No valid courses found.");

        const courseDetails = courses.map((c) => ({
            id: c.id,
            title: c.title,
            price: Number(c.price) || 0,
        }));
        const totalAmount = courseDetails.reduce((sum, c) => sum + c.price, 0);
        const { platformFee } = CommissionService.calculate(totalAmount);

        let payment = this.paymentRepo.create({
            userId,
            amount: totalAmount,
            platformFee,
            currency,
            paymentType: PaymentType.BULK_COURSE_ENROLLMENT,
            referenceId: `bulk:${userId}`,
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            paymentStatus: PaymentStatus.PENDING,
            metadata: { courseIds: courseDetails.map((c) => c.id) },
        });
        payment = await this.paymentRepo.save(payment);
        return { paymentId: payment.id, amount: totalAmount, courses: courseDetails };
    }

    /**
     * Attach a bank slip URL to a payment and mark it UNDER_REVIEW.
     * Only the owner of the payment may upload a slip.
     */
    async uploadBankSlip(paymentId: string, userId: string, slipUrl: string): Promise<Payment> {
        const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
        if (!payment) throw new Error("Payment not found.");
        if (payment.userId !== userId) throw new Error("Forbidden.");
        if (payment.paymentMethod !== PaymentMethod.BANK_TRANSFER) {
            throw new Error("Bank slip upload is only applicable for bank transfer payments.");
        }
        if (payment.paymentStatus === PaymentStatus.COMPLETED) {
            throw new Error("Payment is already completed.");
        }
        payment.bankSlipUrl = slipUrl;
        payment.paymentStatus = PaymentStatus.UNDER_REVIEW;
        return this.paymentRepo.save(payment);
    }

    /**
     * List all bank-transfer payments pending review.
     * Instructors see only payments for their own courses (via metadata or referenceId).
     * Admins see all.
     */
    async getPendingManualPayments(params: { role: string; instructorId?: string }) {
        const qb = this.paymentRepo
            .createQueryBuilder("p")
            .leftJoinAndSelect("p.user", "student")
            .where("p.payment_method = :method", { method: PaymentMethod.BANK_TRANSFER })
            .orderBy("p.created_at", "DESC");

        if (params.role !== "admin" && params.instructorId) {
            // Only pull courses owned by this instructor
            const instructorCourses = await this.courseRepo.find({
                where: { instructorId: params.instructorId },
                select: ["id"],
            });
            const courseIds = instructorCourses.map((c) => c.id);
            if (courseIds.length === 0) return [];
            qb.andWhere("p.reference_id IN (:...courseIds)", { courseIds });
        }

        return qb.getMany();
    }

    /**
     * Admin / instructor approves or rejects a manual payment.
     */
    async reviewManualPayment(
        paymentId: string,
        action: "approve" | "reject",
        note?: string
    ): Promise<Payment> {
        const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
        if (!payment) throw new Error("Payment not found.");

        payment.manualReviewNote = note || null!;

        if (action === "approve") {
            await this.confirmPaymentSuccess(paymentId);
            const refreshed = await this.paymentRepo.findOne({ where: { id: paymentId } });
            return refreshed!;
        } else {
            payment.paymentStatus = PaymentStatus.FAILED;
            payment.failureReason = note || "Rejected by reviewer.";
            return this.paymentRepo.save(payment);
        }
    }
}

export default new PaymentService();
