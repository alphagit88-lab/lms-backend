import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import paymentService from "../services/PaymentService";
import payhereService, { PAYHERE_STATUS } from "../services/PayHereService";
import { refundService } from "../services/RefundService";
import { Payment, PaymentStatus, PaymentType } from "../entities/Payment";
import { TransactionType } from "../entities/Transaction";
import { NotificationService } from "../services/NotificationService";
import { User } from "../entities/User";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { FileStorageService } from "../services/FileStorageService";

const fileStorageService = new FileStorageService();


export class PaymentController {

    /**
     * Manually confirm a pending payment (Admin only — for dev/localhost use)
     * POST /api/payments/:paymentId/confirm
     */
    async manualConfirm(req: Request, res: Response) {
        try {
            const paymentId = req.params.paymentId as string;
            const role = req.session.userRole!;
            const userId = req.session.userId!;

            const paymentRepo = AppDataSource.getRepository(Payment);
            const payment = await paymentRepo.findOne({ where: { id: paymentId } });

            if (!payment) {
                return res.status(404).json({ error: "Payment not found." });
            }

            if (payment.paymentStatus === PaymentStatus.COMPLETED) {
                return res.status(400).json({ error: "Payment already completed." });
            }

            // Security check: Instructors can only confirm payments where they are the recipient
            // Or if it's a course enrollment for their course.
            if (role === "instructor") {
                let authorized = false;
                if (payment.recipientId === userId) {
                    authorized = true;
                } else if (payment.paymentType === "course_enrollment" && payment.referenceId) {
                    const { Course } = await import("../entities/Course");
                    const course = await AppDataSource.getRepository(Course).findOne({ where: { id: payment.referenceId } });
                    if (course && course.instructorId === userId) authorized = true;
                } else if (payment.paymentType === "bulk_course_enrollment" && payment.metadata && Array.isArray(payment.metadata.courseIds)) {
                    const { Course } = await import("../entities/Course");
                    const { In } = await import("typeorm");
                    const courses = await AppDataSource.getRepository(Course).find({ 
                        where: { id: In(payment.metadata.courseIds) },
                        select: ["instructorId"]
                    });
                    if (courses.some(c => c.instructorId === userId)) authorized = true;
                } else if (payment.paymentType === "booking_session" && payment.referenceId) {
                    const { Booking } = await import("../entities/Booking");
                    const booking = await AppDataSource.getRepository(Booking).findOne({ where: { id: payment.referenceId } });
                    if (booking && booking.teacherId === userId) authorized = true;
                }
                if (!authorized) {
                    return res.status(403).json({ error: "You are not authorized to confirm this payment." });
                }
            }

            // Trigger the same fulfillment logic used by the PayHere notify endpoint
            const result = await paymentService.confirmPaymentSuccess(paymentId);

            // Send success notification to the student (and instructor/admin)
            const payer = await AppDataSource.getRepository(User).findOne({ where: { id: payment.userId } });
            if (payer) {
                void NotificationService.notifyPaymentSuccess(payment, payer);
                void NotificationService.notifyPaymentEvent(payment, payer, "success");
            }

            return res.json({
                message: "Payment confirmed and fulfillment completed successfully.",
                payment: result,
            });
        } catch (error: any) {
            console.error("Manual confirm error:", error);
            return res.status(500).json({ error: error.message || "Failed to confirm payment." });
        }
    }

    /**
     * Manually cancel a pending payment (Admin/Instructor)
     * POST /api/payments/:paymentId/cancel
     */
    async manualCancel(req: Request, res: Response) {
        try {
            const paymentId = req.params.paymentId as string;
            const role = req.session.userRole!;
            const userId = req.session.userId!;

            const paymentRepo = AppDataSource.getRepository(Payment);
            const payment = await paymentRepo.findOne({ where: { id: paymentId } });

            if (!payment) {
                return res.status(404).json({ error: "Payment not found." });
            }

            if (payment.paymentStatus === PaymentStatus.COMPLETED) {
                return res.status(400).json({ error: "Payment already completed and cannot be cancelled." });
            }
            if (payment.paymentStatus === PaymentStatus.FAILED) {
                return res.status(400).json({ error: "Payment is already cancelled." });
            }
            if (payment.paymentStatus === PaymentStatus.REFUNDED) {
                return res.status(400).json({ error: "Payment is refunded." });
            }

            // Security check: Instructors can only cancel payments where they are the recipient
            // Or if it's a course enrollment for their course.
            if (role === "instructor") {
                let authorized = false;
                if (payment.recipientId === userId) {
                    authorized = true;
                } else if (payment.paymentType === "course_enrollment" && payment.referenceId) {
                    const { Course } = await import("../entities/Course");
                    const course = await AppDataSource.getRepository(Course).findOne({ where: { id: payment.referenceId } });
                    if (course && course.instructorId === userId) authorized = true;
                } else if (payment.paymentType === "bulk_course_enrollment" && payment.metadata && Array.isArray(payment.metadata.courseIds)) {
                    const { Course } = await import("../entities/Course");
                    const { In } = await import("typeorm");
                    const courses = await AppDataSource.getRepository(Course).find({ 
                        where: { id: In(payment.metadata.courseIds) },
                        select: ["instructorId"]
                    });
                    if (courses.some(c => c.instructorId === userId)) authorized = true;
                } else if (payment.paymentType === "booking_session" && payment.referenceId) {
                    const { Booking } = await import("../entities/Booking");
                    const booking = await AppDataSource.getRepository(Booking).findOne({ where: { id: payment.referenceId } });
                    if (booking && booking.teacherId === userId) authorized = true;
                }
                if (!authorized) {
                    return res.status(403).json({ error: "You are not authorized to cancel this payment." });
                }
            }

            // Trigger failure logic
            const result = await paymentService.confirmPaymentFailure(paymentId, "Manually cancelled by instructor/admin.");
            
            // Send rejection notification
            const payer = await AppDataSource.getRepository(User).findOne({ where: { id: payment.userId } });
            if (payer) {
                const { NotificationType } = require("../entities/Notification");
                void NotificationService.createInApp(
                    payer.id,
                    NotificationType.PAYMENT_FAILED,
                    "Payment Cancelled",
                    `Your payment intent for ${payment.currency} ${Number(payment.amount).toFixed(2)} was cancelled.`,
                    payment.id,
                    "/payments"
                );
            }

            return res.json({
                message: "Payment cancelled successfully.",
                payment: result,
            });
        } catch (error: any) {
            console.error("Manual cancel error:", error);
            return res.status(500).json({ error: error.message || "Failed to cancel payment." });
        }
    }

    /**
     * Initialize a PayHere payment.
     * Returns checkout params + checkout URL for the frontend to redirect to PayHere.
     * POST /api/payments/create-intent
     */
    async createIntent(req: Request, res: Response) {
        try {
            if (req.session.userRole === "admin") {
                return res.status(403).json({ error: "Admins cannot make payments." });
            }
            const {
                type,
                referenceId,
                amount,
                currency = "LKR",
                recipientId,
                itemDescription,
                firstName,
                lastName,
                email,
                phone,
            } = req.body;

            if (!type || !referenceId || amount === undefined || amount === null) {
                return res.status(400).json({ error: "Missing required fields: type, referenceId, amount" });
            }

            const result = await paymentService.initializePayment({
                userId: req.session.userId!,
                amount: Number(amount),
                currency,
                type: type as PaymentType,
                referenceId,
                recipientId,
                itemDescription,
                firstName,
                lastName,
                email,
                phone,
            });

            // Free items: no redirect needed
            if (result.isFree) {
                return res.status(200).json({
                    isFree: true,
                    paymentId: result.paymentId,
                    checkoutParams: null,
                    checkoutUrl: null,
                    amount: 0,
                });
            }

            // Paid items: return PayHere checkout params for frontend redirect
            return res.status(200).json({
                isFree: false,
                paymentId: result.paymentId,
                checkoutParams: result.checkoutParams,
                checkoutUrl: result.checkoutUrl,
                amount: result.amount,
            });
        } catch (error: any) {
            console.error("Initialize Payment Error:", error);
            return res.status(500).json({ error: error.message || "Failed to initialize payment." });
        }
    }

    /**     * Initialize a single combined PayHere payment for multiple courses.
     * POST /api/payments/create-bulk-intent
     * Body: { courseIds: string[], currency?, firstName?, lastName?, email?, phone? }
     */
    async createBulkIntent(req: Request, res: Response) {
        try {
            if (req.session.userRole === "admin") {
                return res.status(403).json({ error: "Admins cannot make payments." });
            }
            const { courseIds, currency = "LKR", firstName, lastName, email, phone } = req.body;

            if (!Array.isArray(courseIds) || courseIds.length === 0) {
                return res.status(400).json({ error: "courseIds must be a non-empty array." });
            }

            const result = await paymentService.initializeBulkPayment({
                userId: req.session.userId!,
                courseIds,
                currency,
                firstName,
                lastName,
                email,
                phone,
            });

            return res.status(200).json({
                isFree: result.isFree,
                paymentId: result.paymentId,
                checkoutParams: result.checkoutParams,
                checkoutUrl: result.checkoutUrl,
                amount: result.amount,
                courses: result.courses,
            });
        } catch (error: any) {
            console.error("Bulk Intent Error:", error);
            return res.status(500).json({ error: error.message || "Failed to initialize bulk payment." });
        }
    }

    /**     * PayHere Notify Endpoint (server-to-server callback from PayHere)
     * POST /api/payments/payhere-notify
     *
     * PayHere POSTs this as application/x-www-form-urlencoded after every payment event.
     * No auth required — integrity verified via MD5 signature.
     */
    async payhereNotify(req: Request, res: Response) {
        try {
            const payload = req.body;
            const { merchant_id, order_id, payment_id, payhere_amount, payhere_currency, status_code, md5sig, status_message, method } = payload;

            // Basic field validation
            if (!merchant_id || !order_id || !status_code || !md5sig) {
                console.warn("[PayHere Notify] Missing required fields:", payload);
                return res.status(400).send("Missing required fields");
            }

            // Verify MD5 signature — ensures request is genuinely from PayHere
            const isValid = payhereService.verifyNotification(payload);
            if (!isValid) {
                console.error("[PayHere Notify] Invalid MD5 signature for order:", order_id);
                return res.status(400).send("Invalid signature");
            }

            console.log(`[PayHere Notify] order=${order_id} payment_id=${payment_id} status=${status_code} (${status_message}) method=${method}`);

            switch (status_code) {
                case PAYHERE_STATUS.SUCCESS:
                    await paymentService.confirmPaymentSuccess(order_id);
                    console.log(`[PayHere] Payment SUCCESS for order ${order_id}`);
                    // Fire payment success notification (fire-and-forget)
                    {
                        const paymentRepo = AppDataSource.getRepository(Payment);
                        const payment = await paymentRepo.findOne({ where: { id: order_id } });
                        if (payment) {
                            const payer = await AppDataSource.getRepository(User).findOne({ where: { id: payment.userId } });
                            if (payer) {
                                void NotificationService.notifyPaymentSuccess(payment, payer);
                                void NotificationService.notifyPaymentEvent(payment, payer, "success");
                            }
                        }
                    }
                    break;

                case PAYHERE_STATUS.PENDING:
                    console.log(`[PayHere] Payment PENDING for order ${order_id}`);
                    break;

                case PAYHERE_STATUS.CANCELLED:
                    await paymentService.confirmPaymentFailure(order_id, "Cancelled by customer.");
                    console.log(`[PayHere] Payment CANCELLED for order ${order_id}`);
                    break;

                case PAYHERE_STATUS.FAILED:
                    await paymentService.confirmPaymentFailure(order_id, status_message || "Payment failed.");
                    console.log(`[PayHere] Payment FAILED for order ${order_id}`);
                    break;

                case PAYHERE_STATUS.CHARGEDBACK:
                    await paymentService.confirmPaymentFailure(order_id, "Chargedback.");
                    console.log(`[PayHere] Payment CHARGEDBACK for order ${order_id}`);
                    break;

                default:
                    console.warn(`[PayHere] Unknown status_code ${status_code} for order ${order_id}`);
            }

            // Must respond 200 or PayHere will retry
            return res.status(200).send("OK");

        } catch (err: any) {
            console.error("[PayHere Notify] Error:", err);
            // Still 200 to prevent retry storms; errors logged for manual review
            return res.status(200).send("OK");
        }
    }

    async getMyPayments(req: Request, res: Response) {
        try {
            const payments = await paymentService.getMyPayments(req.session.userId!);
            return res.json({ payments, total: payments.length });
        } catch (error: any) {
            return res.status(500).json({ error: "Failed to fetch payments." });
        }
    }

    async getPayments(req: Request, res: Response) {
        try {
            const { page = "1", limit = "20", status, method } = req.query;
            const role = req.session.userRole!;
            const userId = req.session.userId!;

            const result = await paymentService.getFilteredPayments({
                role,
                requestingUserId: userId,
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                status: status as string,
                method: method as any,
            });

            return res.json(result);
        } catch (error: any) {
            console.error("Get payments error:", error);
            return res.status(500).json({ error: "Failed to fetch payments." });
        }
    }

    async getTransactions(req: Request, res: Response) {
        try {
            const { type } = req.query;
            const transactions = await paymentService.getTransactions(
                req.session.userId!,
                type as TransactionType
            );
            return res.json({ transactions });
        } catch (error: any) {
            return res.status(500).json({ error: "Failed to fetch transactions." });
        }
    }

    async getTeacherEarnings(req: Request, res: Response) {
        try {
            if (req.session.userRole !== "instructor") {
                return res.status(403).json({ error: "Only instructors can view earnings" });
            }
            const earnings = await paymentService.getTeacherEarnings(req.session.userId!);
            return res.json(earnings);
        } catch (error: any) {
            return res.status(500).json({ error: "Failed to fetch earnings." });
        }
    }

    // ── MANUAL / BANK-TRANSFER PAYMENTS ──────────────────────────────────────

    /** POST /api/payments/bank-transfer/create-intent */
    async createBankTransferIntent(req: Request, res: Response) {
        try {
            if (req.session.userRole === "admin") {
                return res.status(403).json({ error: "Admins cannot make payments." });
            }

            const { type, referenceId, amount, currency = "LKR", recipientId } = req.body;
            const userId = req.session.userId!;

            // Specialized methods for bookings/packages to ensure correct amount & teacher
            if (type === PaymentType.BOOKING_SESSION) {
                const result = await paymentService.initializeBookingManualPayment(referenceId, userId);
                return res.status(201).json(result);
            }

            if (type === PaymentType.BOOKING_PACKAGE) {
                const result = await paymentService.initializePackageManualPayment(referenceId, userId);
                return res.status(201).json(result);
            }

            // Generic fallback for courses/others
            if (!type || !referenceId || amount === undefined || amount === null) {
                return res.status(400).json({ error: "Missing required fields: type, referenceId, amount" });
            }

            const result = await paymentService.initializeBankTransferPayment({
                userId,
                amount: Number(amount),
                currency,
                type: type as PaymentType,
                referenceId,
                recipientId,
            });
            return res.status(201).json(result);
        } catch (error: any) {
            return res.status(500).json({ error: error.message || "Failed to initialize bank transfer." });
        }
    }

    /** POST /api/payments/bank-transfer/create-bulk-intent */
    async createBulkBankTransferIntent(req: Request, res: Response) {
        try {
            if (req.session.userRole === "admin") {
                return res.status(403).json({ error: "Admins cannot make payments." });
            }
            const { courseIds, currency = "LKR" } = req.body;
            if (!Array.isArray(courseIds) || courseIds.length === 0) {
                return res.status(400).json({ error: "courseIds must be a non-empty array." });
            }
            const result = await paymentService.initializeBulkBankTransfer({
                userId: req.session.userId!,
                courseIds,
                currency,
            });
            return res.status(201).json(result);
        } catch (error: any) {
            return res.status(500).json({ error: error.message || "Failed to initialize bulk bank transfer." });
        }
    }

    /** POST /api/payments/bank-transfer/:paymentId/upload-slip — multipart/form-data, field "slip" */
    async uploadBankSlip(req: Request, res: Response) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "No slip file uploaded." });
            }
            const paymentId = String(req.params.paymentId);
            
            const userId = req.session.userId!;
            const fileResult = await fileStorageService.saveFile(
              req.file as any,
              "document",
              userId
            );
            const slipUrl = fileResult.fileUrl;

            const payment = await paymentService.uploadBankSlip(paymentId, userId, slipUrl);
            return res.json({ message: "Bank slip uploaded. Your payment is under review.", payment });
        } catch (error: any) {

            console.error("Upload slip error:", error);
            return res.status(error.message === "Forbidden." ? 403 : 400).json({ error: error.message });
        }
    }

    /** GET /api/payments/bank-transfer/pending — admin & instructor */
    async getPendingManualPayments(req: Request, res: Response) {
        try {
            const role = req.session.userRole!;
            const payments = await paymentService.getPendingManualPayments({
                role,
                instructorId: role === "instructor" ? req.session.userId! : undefined,
            });
            return res.json({ payments });
        } catch (error: any) {
            return res.status(500).json({ error: error.message || "Failed to fetch manual payments." });
        }
    }

    /** POST /api/payments/bank-transfer/:paymentId/review — admin & instructor */
    async reviewManualPayment(req: Request, res: Response) {
        try {
            const paymentId = String(req.params.paymentId);
            const { action, note } = req.body;
            if (action !== "approve" && action !== "reject") {
                return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
            }
            const reviewAction = action as "approve" | "reject";
            const payment = await paymentService.reviewManualPayment(paymentId, reviewAction, note);
            
            // Notify student of approval/rejection
            const { NotificationService } = require("../services/NotificationService");
            const { User } = require("../entities/User");
            const { AppDataSource } = require("../config/data-source");
            const payer = await AppDataSource.getRepository(User).findOne({ where: { id: payment.userId } });
            
            if (payer) {
                const { NotificationType } = require("../entities/Notification");
                if (reviewAction === "approve") {
                    void NotificationService.notifyPaymentSuccess(payment, payer);
                } else if (reviewAction === "reject") {
                    void NotificationService.createInApp(
                        payer.id,
                        NotificationType.PAYMENT_FAILED,
                        "Bank Slip Rejected",
                        `Your bank slip for ${payment.currency} ${Number(payment.amount).toFixed(2)} was rejected: ${note || "Invalid slip"}.`,
                        payment.id,
                        "/payments"
                    );
                }
            }

            return res.json({ message: `Payment ${action}d successfully.`, payment });
        } catch (error: any) {
            return res.status(500).json({ error: error.message || "Failed to review payment." });
        }
    }

    /**
     * POST /api/payments/refund
     * Request a refund for a completed payment.
     *
     * Body (JSON):
     *   { paymentId: string, reason: string, refundPercentage?: number }
     *
     * - Students: can only refund their own booking payments; percentage auto-calculated.
     * - Admins: can refund any payment and override the percentage (0–100).
     *
     * Note: PayHere does not provide an automated refund API.
     * The actual money transfer is processed manually in the PayHere Merchant Portal.
     * This endpoint records the refund decision and notifies the student.
     */
    async processRefund(req: Request, res: Response) {
        try {
            const { paymentId, reason, refundPercentage } = req.body as {
                paymentId?: string;
                reason?: string;
                refundPercentage?: number;
            };

            if (!paymentId || typeof paymentId !== "string") {
                return res.status(400).json({ error: "paymentId is required." });
            }
            if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
                return res.status(400).json({ error: "reason is required." });
            }
            if (refundPercentage !== undefined && (typeof refundPercentage !== "number" || refundPercentage < 0 || refundPercentage > 100)) {
                return res.status(400).json({ error: "refundPercentage must be a number between 0 and 100." });
            }

            const result = await refundService.processRefund({
                paymentId,
                requestedByUserId: req.session.userId!,
                requestedByRole: req.session.userRole!,
                reason: reason.trim(),
                refundPercentage,
            });

            return res.json({
                message: result.message,
                refundAmount: result.refundAmount,
                refundPercentage: result.refundPercentage,
                payment: {
                    id: result.payment.id,
                    paymentStatus: result.payment.paymentStatus,
                    refundAmount: result.payment.refundAmount,
                    refundDate: result.payment.refundDate,
                },
            });
        } catch (error: any) {
            const msg: string = error.message || "Failed to process refund.";
            // Return 403 for access-denied errors, 422 for policy errors, 404 for not-found
            if (msg.includes("Access denied")) return res.status(403).json({ error: msg });
            if (msg.includes("not found")) return res.status(404).json({ error: msg });
            if (
                msg.includes("cannot be refunded") ||
                msg.includes("No refund is applicable") ||
                msg.includes("must be reviewed") ||
                msg.includes("must supply refundPercentage")
            ) {
                return res.status(422).json({ error: msg });
            }
            return res.status(500).json({ error: msg });
        }
    }

    /** GET /api/payments/:id/status — user status check */
    async getPaymentStatus(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
            const userId = req.session.userId!;
            const payment = await paymentService.getPaymentStatus(id, userId);
            return res.json({ 
                paymentId: payment.id,
                status: payment.paymentStatus,
                type: payment.paymentType,
                referenceId: payment.referenceId
            });
        } catch (error: any) {
            return res.status(error.message.includes("not found") ? 404 : 500).json({ error: error.message });
        }
    }

    /** POST /api/payments/:id/verify — manual check (useful for local dev or network issues) */
    async verifyPayment(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
            const userId = req.session.userId!;
            const { force = false } = req.body;

            const payment = await paymentService.getPaymentStatus(id, userId);

            if (payment.paymentStatus === PaymentStatus.COMPLETED) {
                return res.json({ success: true, message: "Payment already confirmed." });
            }

            // In Local Dev Mode, allow manual confirmation if requested
            const isLocal = String(req.headers.host).includes("localhost") || process.env.NODE_ENV === "development";
            if (isLocal && force === true) {
                console.warn(`[DEV] Manual override confirmation for payment ${id} by user ${userId}`);
                await paymentService.confirmPaymentSuccess(id);
                return res.json({ success: true, message: "Payment forced completed (DEV MODE)." });
            }

            // TODO: In production, this could call PayHere Status API if we have access
            return res.json({ success: false, message: "Payment is still pending. Please wait for the system to process the update." });
        } catch (error: any) {
            return res.status(error.message.includes("not found") ? 404 : 500).json({ error: error.message });
        }
    }
}

export const paymentController = new PaymentController();
