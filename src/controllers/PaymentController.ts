import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import paymentService from "../services/PaymentService";
import stripeService from "../services/StripeService";
import { Payment, PaymentStatus, PaymentType } from "../entities/Payment";
import { TransactionType } from "../entities/Transaction";

export class PaymentController {

    /**
     * Manually confirm a pending payment (Admin only - for dev/localhost use)
     * POST /api/payments/:paymentId/confirm
     * This bypasses Stripe webhook and triggers the same fulfillment logic.
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

            // Use stripePaymentIntentId if available, otherwise simulate directly
            if (payment.stripePaymentIntentId) {
                const result = await paymentService.confirmPaymentSuccess(payment.stripePaymentIntentId);
                return res.json({
                    message: "Payment confirmed and enrollment created successfully.",
                    payment: result
                });
            } else {
                // Directly update payment status and run fulfillment
                payment.paymentStatus = PaymentStatus.COMPLETED;
                payment.paymentDate = new Date();
                await paymentRepo.save(payment);

                // Trigger fulfillment manually by calling confirmPaymentSuccess internals
                // Since there's no stripePaymentIntentId, we need to handle it directly
                const { Enrollment } = await import("../entities/Enrollment");
                const { Course } = await import("../entities/Course");

                if (payment.paymentType === PaymentType.COURSE_ENROLLMENT) {
                    const enrollmentRepo = AppDataSource.getRepository(Enrollment);
                    const courseRepo = AppDataSource.getRepository(Course);

                    const existing = await enrollmentRepo.findOne({
                        where: { studentId: payment.userId, courseId: payment.referenceId }
                    });

                    if (!existing) {
                        const enrollment = enrollmentRepo.create({
                            studentId: payment.userId,
                            courseId: payment.referenceId,
                            status: "active",
                            progressPercentage: 0,
                        });
                        await enrollmentRepo.save(enrollment);
                        await courseRepo.increment({ id: payment.referenceId }, "enrollmentCount", 1);
                    }
                }

                return res.json({
                    message: "Payment confirmed and enrollment created successfully.",
                    payment
                });
            }
        } catch (error: any) {
            console.error("Manual confirm error:", error);
            return res.status(500).json({ error: error.message || "Failed to confirm payment." });
        }
    }

    /**
     * Initializes a payment. Frontend hits this before rendering Stripe Element.
     */
    async createIntent(req: Request, res: Response) {
        try {
            const {
                type,
                referenceId,
                amount,
                currency = "LKR",
                recipientId
            } = req.body;

            if (!type || !referenceId || !amount) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            const { clientSecret, paymentId } = await paymentService.initializePayment({
                userId: req.session.userId!,
                amount,
                currency,
                type: type as PaymentType,
                referenceId,
                recipientId,
            });

            return res.status(200).json({
                clientSecret,
                paymentId,
            });
        } catch (error: any) {
            console.error("Initialize Payment Error:", error);
            res.status(500).json({ error: error.message || "Failed to initialize payment." });
        }
    }

    /**
     * Stripe Webhook Endpoints
     * Very critical: Must receive raw body buffer (Express JSON parser disabled)
     */
    async webhook(req: Request, res: Response) {
        const signature = req.headers["stripe-signature"] as string;

        if (!signature) {
            return res.status(400).send("No stripe signature found.");
        }

        try {
            // Body is raw
            const event = stripeService.constructWebhookEvent(req.body, signature);

            // Handle the event
            switch (event.type) {
                case "payment_intent.succeeded":
                    const paymentIntent = event.data.object as any;
                    await paymentService.confirmPaymentSuccess(paymentIntent.id);
                    console.log(`Payment confirmed: ${paymentIntent.id}`);
                    break;

                case "payment_intent.payment_failed":
                    const failedIntent = event.data.object as any;
                    await paymentService.confirmPaymentFailure(
                        failedIntent.id,
                        failedIntent.last_payment_error?.message
                    );
                    console.log(`Payment failed: ${failedIntent.id}`);
                    break;

                case "charge.refunded":
                    // Log refund event later
                    break;

                default:
                    console.log(`Unhandled event type ${event.type}`);
            }

            // Return a 200 response to acknowledge receipt of the event
            return res.status(200).json({ received: true });

        } catch (err: any) {
            console.error("Webhook event handling error:", err);
            return res.status(400).send(`Webhook Error: ${err.message}`);
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
