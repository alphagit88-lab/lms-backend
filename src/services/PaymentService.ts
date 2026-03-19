import { AppDataSource } from "../config/data-source";
import { In, Brackets } from "typeorm";
import { Payment, PaymentStatus, PaymentType, PaymentMethod } from "../entities/Payment";
import { Transaction, TransactionType } from "../entities/Transaction";
import payhereService, { PayHereCheckoutParams } from "./PayHereService";
import { User } from "../entities/User";
import { CommissionService } from "./CommissionService";
import { Enrollment } from "../entities/Enrollment";
import { Booking, BookingStatus } from "../entities/Booking";
import { Course } from "../entities/Course";
import { TeacherProfile } from "../entities/TeacherProfile";

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

        // Check for an existing PENDING payment for this same reference to avoid duplicates
        let payment = await this.paymentRepo.findOne({
            where: {
                userId,
                paymentType: type,
                referenceId,
                paymentStatus: PaymentStatus.PENDING,
                amount: amount // and same amount
            }
        });

        if (!payment) {
            payment = this.paymentRepo.create({
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
            payment = await this.paymentRepo.save(payment);
        } else {
            // Update existing pending payment metadata just in case info changed
            payment.recipientId = recipientId;
            payment.platformFee = platformFee;
            payment.currency = currency;
            await this.paymentRepo.save(payment);
        }

        try {
            // Free items bypass PayHere
            if (amount <= 0) {
                payment.paymentStatus = PaymentStatus.COMPLETED;
                payment.paymentDate = new Date();
                await this.paymentRepo.save(payment);

                await this.createTransactions(payment.id, userId, recipientId, amount, platformFee, payment.paymentMethod);

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

            const { NotificationService } = require("./NotificationService");
            const payer = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
            if (payer) void NotificationService.notifyPaymentEvent(payment, payer, "payhere_intent");

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
            payment.platformFee,
            payment.paymentMethod
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
                // Confirm the booking, respecting the teacher's auto-confirm setting
                const booking = await this.bookingRepo.findOne({
                    where: { id: payment.referenceId },
                    relations: ["teacher"]
                });

                if (booking && (booking.status === BookingStatus.PENDING_PAYMENT || booking.status === BookingStatus.PENDING)) {
                    const teacherProfile = await AppDataSource.getRepository(TeacherProfile).findOne({
                        where: { teacherId: booking.teacherId }
                    });
                    const shouldAutoConfirm = teacherProfile?.autoConfirmBookings === true;

                    booking.status = shouldAutoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
                    booking.paymentId = payment.id;
                    booking.paymentExpiresAt = undefined;
                    const savedBooking = await this.bookingRepo.save(booking);

                    // -- FULFILLMENT: Zoom & Notifications --
                    if (shouldAutoConfirm) {
                        try {
                            const { BookingController } = require("../controllers/BookingController");
                            const { NotificationService } = require("./NotificationService");
                            const teacherName = savedBooking.teacher ? `${savedBooking.teacher.firstName} ${savedBooking.teacher.lastName}` : "Teacher";
                            await BookingController.createZoomMeetingForBooking(savedBooking, teacherName);

                            const userRepo = AppDataSource.getRepository(User);
                            const [student, teacher] = await Promise.all([
                                userRepo.findOne({ where: { id: savedBooking.studentId } }),
                                userRepo.findOne({ where: { id: savedBooking.teacherId } }),
                            ]);
                            if (student && teacher) {
                                void NotificationService.notifyBookingConfirmed(savedBooking, student, teacher);
                            }
                        } catch (err) {
                            console.error("Failed to execute fulfillment for auto-confirmed paid booking:", err);
                        }
                    }
                }
            } else if (payment.paymentType === PaymentType.BOOKING_PACKAGE) {
                // Confirm all bookings associated with this package ID
                const bookings = await this.bookingRepo.find({
                    where: { packageId: payment.referenceId },
                    relations: ["teacher"]
                });

                if (bookings.length > 0) {
                    const teacherProfileRepo = AppDataSource.getRepository(TeacherProfile);
                    const teacherProfile = await teacherProfileRepo.findOne({
                        where: { teacherId: bookings[0].teacherId }
                    });
                    const shouldAutoConfirm = teacherProfile?.autoConfirmBookings === true;

                    for (const booking of bookings) {
                        // Only update if it was actually waiting for payment
                        if (booking.status === BookingStatus.PENDING_PAYMENT) {
                            booking.status = shouldAutoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
                            booking.paymentId = payment.id;
                            booking.paymentExpiresAt = undefined;
                            
                            const savedBooking = await this.bookingRepo.save(booking);

                            if (shouldAutoConfirm) {
                                try {
                                    const { BookingController } = require("../controllers/BookingController");
                                    const teacherName = savedBooking.teacher ? `${savedBooking.teacher.firstName} ${savedBooking.teacher.lastName}` : "Teacher";
                                    await BookingController.createZoomMeetingForBooking(savedBooking, teacherName);
                                } catch (err) {
                                    console.error(`Zoom fulfillment failed for booking ${booking.id} in package ${payment.referenceId}:`, err);
                                }
                            }
                        }
                    }

                    // Send notifications for each session (or we could group them, but individual is fine for clarity)
                    try {
                        const { NotificationService } = require("./NotificationService");
                        const userRepo = AppDataSource.getRepository(User);
                        const [student, teacher] = await Promise.all([
                            userRepo.findOne({ where: { id: bookings[0].studentId } }),
                            userRepo.findOne({ where: { id: bookings[0].teacherId } }),
                        ]);
                        if (student && teacher) {
                            for (const b of bookings) {
                                void NotificationService.notifyBookingConfirmed(b, student, teacher);
                            }
                        }
                    } catch (err) {
                        console.error("Package notification failed:", err);
                    }
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
        } else if (payment.paymentType === PaymentType.BOOKING_PACKAGE && payment.referenceId) {
            // Cancel all bookings in the package
            try {
                const bookings = await this.bookingRepo.find({
                    where: { packageId: payment.referenceId },
                    relations: ["slot"]
                });

                for (const booking of bookings) {
                    if (booking.status === BookingStatus.PENDING_PAYMENT) {
                        booking.status = BookingStatus.CANCELLED;
                        booking.cancellationReason = "Package payment failure.";
                        booking.cancelledAt = new Date();
                        await this.bookingRepo.save(booking);

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
                }
            } catch (err) {
                console.error(`Failed to cancel package bookings for package ${payment.referenceId} after payment failure:`, err);
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
        recipientId: string | undefined,
        totalAmountSpent: number,
        platformFeeAmount: number,
        paymentMethod?: PaymentMethod
    ) {
        const transactions: Transaction[] = [];

        // Derive the transaction type from the payment method
        let txType: TransactionType;
        if (paymentMethod === PaymentMethod.BANK_TRANSFER) {
            txType = TransactionType.MANUAL;
        } else if (paymentMethod === PaymentMethod.PAYHERE) {
            txType = TransactionType.PAYHERE;
        } else {
            txType = TransactionType.PAYMENT;
        }

        // Record the payment from the student
        const studentTx = this.transactionRepo.create({
            paymentId,
            userId,
            transactionType: txType,
            amount: totalAmountSpent,
            description: `Payment for order ${paymentId}`,
        });
        transactions.push(studentTx);

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
            await this.createTransactions(payment.id, userId, undefined, totalAmount, platformFee, payment.paymentMethod);

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

        const { NotificationService } = require("./NotificationService");
        const payer = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
        if (payer) void NotificationService.notifyPaymentEvent(payment, payer, "payhere_intent");

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

    async getPaymentStatus(id: string, userId: string) {
        const payment = await this.paymentRepo.findOne({
            where: { id, userId }
        });
        if (!payment) {
            throw new Error(`Payment ${id} not found or access denied.`);
        }
        return payment;
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
        await this.paymentRepo.save(payment);

        const { NotificationService } = require("./NotificationService");
        const payer = await AppDataSource.getRepository(User).findOne({ where: { id: payment.userId } });
        if (payer) {
            void NotificationService.notifyPaymentEvent(payment, payer, "new_slip");
        }

        return payment;
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
            // Pull courses owned by this instructor
            const courseIds = (await this.courseRepo.find({
                where: { instructorId: params.instructorId },
                select: ["id"],
            })).map((c) => c.id);

            // Pull bookings (sessions) owned by this teacher
            const bookingIds = (await AppDataSource.getRepository(Booking).find({
                where: { teacherId: params.instructorId },
                select: ["id"],
            })).map((b) => b.id);

            qb.andWhere(new Brackets(b => {
                b.where("p.recipient_id = :userId", { userId: params.instructorId }); // if it was explicitly set
                
                if (courseIds.length > 0) {
                    b.orWhere("(p.paymentType = 'course_enrollment' AND p.reference_id IN (:...courseIds))", { courseIds });
                }
                if (bookingIds.length > 0) {
                    b.orWhere("(p.paymentType = 'booking_session' AND p.reference_id IN (:...bookingIds))", { bookingIds });
                }
            }));
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

    /**
     * Unified method to list payments with role-based filtering.
     * Admins see all, Instructors see only their own.
     */
    async getFilteredPayments(params: {
        role: string;
        requestingUserId: string;
        page: number;
        limit: number;
        status?: string;
        method?: PaymentMethod;
    }) {
        const { role, requestingUserId, page, limit, status, method } = params;
        const pageNum = Math.max(1, page);
        const pageSize = Math.min(100, Math.max(1, limit));

        const qb = this.paymentRepo.createQueryBuilder("p")
            .leftJoinAndSelect("p.user", "student")
            .leftJoinAndSelect("p.recipient", "recipient")
            .orderBy("p.createdAt", "DESC");

        if (role === "instructor") {
            const courseIds = (await this.courseRepo.find({ where: { instructorId: requestingUserId }, select: ["id"] })).map(c => c.id);
            const bookingIds = (await AppDataSource.getRepository(Booking).find({ where: { teacherId: requestingUserId }, select: ["id"] })).map(b => b.id);

            qb.andWhere(new Brackets(b => {
                b.where("p.recipientId = :userId", { userId: requestingUserId });
                if (courseIds.length > 0) {
                    b.orWhere("(p.paymentType = 'course_enrollment' AND p.referenceId IN (:...courseIds))", { courseIds });
                }
                if (bookingIds.length > 0) {
                    b.orWhere("(p.paymentType = 'booking_session' AND p.referenceId IN (:...bookingIds))", { bookingIds });
                }
            }));
        }

        if (status) {
            qb.andWhere("p.paymentStatus = :status", { status });
        }

        if (method) {
            qb.andWhere("p.paymentMethod = :method", { method });
        }

        const [payments, total] = await qb
            .skip((pageNum - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();

        // Map course logic (similar to AdminController)
        const courseIds = payments
            .filter(p => p.paymentType === PaymentType.COURSE_ENROLLMENT)
            .map(p => p.referenceId)
            .filter(Boolean);

        const courses = courseIds.length > 0
            ? await this.courseRepo.find({ where: { id: In(courseIds) }, select: ["id", "title"] })
            : [];
        const courseMap = new Map(courses.map(c => [c.id, c]));

        const results = payments.map(p => ({
            id: p.id,
            studentId: p.userId,
            courseId: p.paymentType === PaymentType.COURSE_ENROLLMENT ? p.referenceId : null,
            amount: p.amount,
            currency: p.currency,
            paymentMethod: p.paymentMethod,
            paymentType: p.paymentType,
            paymentStatus: p.paymentStatus,
            status: p.paymentStatus.toUpperCase(), // Legacy field for frontend compatibility
            refundAmount: p.refundAmount ?? null,
            refundDate: p.refundDate ?? null,
            transactionId: p.transactionId ?? null,
            bankSlipUrl: p.bankSlipUrl ?? null,
            createdAt: p.createdAt,
            student: {
                firstName: p.user?.firstName ?? '',
                lastName: p.user?.lastName ?? '',
                email: p.user?.email ?? '',
            },
            instructor: p.recipient ? {
                firstName: p.recipient.firstName,
                lastName: p.recipient.lastName,
                email: p.recipient.email,
            } : null,
            course: p.paymentType === PaymentType.COURSE_ENROLLMENT
                ? (courseMap.get(p.referenceId) ?? null)
                : null,
        }));

        return {
            payments: results,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / pageSize),
        };
    }
}

export default new PaymentService();
