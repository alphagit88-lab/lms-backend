import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import paymentService from "../services/PaymentService";
import payhereService, { PAYHERE_STATUS } from "../services/PayHereService";
import { Payment, PaymentStatus, PaymentType } from "../entities/Payment";
import { TransactionType } from "../entities/Transaction";

export class PaymentController {

    /**
     * Manually confirm a pending payment (Admin only — for dev/localhost use)
     * POST /api/payments/:paymentId/confirm
     */
    async manualConfirm(req: Request, res: Response) {
        try {
            const paymentId = req.params.paymentId as string;

            const paymentRepo = AppDataSource.getRepository(Payment);
            const payment = await paymentRepo.findOne({ where: { id: paymentId } });

            if (!payment) {
                return res.status(404).json({ error: "Payment not found." });
            }

            if (payment.paymentStatus === PaymentStatus.COMPLETED) {
                return res.status(400).json({ error: "Payment already completed." });
            }

            // Trigger the same fulfillment logic used by the PayHere notify endpoint
            const result = await paymentService.confirmPaymentSuccess(paymentId);
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
     * Initialize a PayHere payment.
     * Returns checkout params + checkout URL for the frontend to redirect to PayHere.
     * POST /api/payments/create-intent
     */
    async createIntent(req: Request, res: Response) {
        try {
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

            if (!type || !referenceId || !amount) {
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

    /**
     * PayHere Notify Endpoint (server-to-server callback from PayHere)
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
}

export const paymentController = new PaymentController();
