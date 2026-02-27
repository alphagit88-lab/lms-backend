import Stripe from "stripe";

class StripeService {
    private stripe: Stripe;

    constructor() {
        const secretKey = process.env.STRIPE_SECRET_KEY || "sk_test_mock";
        this.stripe = new Stripe(secretKey, {
            apiVersion: "2026-02-25.clover" as any,
        });
    }

    /**
     * Creates a PaymentIntent to hold the client's intent to pay
     */
    async createPaymentIntent(
        amount: number,
        currency: string = "LKR",
        metadata: Record<string, string> = {}
    ): Promise<Stripe.PaymentIntent> {
        try {
            // Stripe amounts are represented in the smallest currency unit (e.g., cents)
            const amountInSmallestUnit = Math.round(amount * 100);

            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: amountInSmallestUnit,
                currency: currency.toLowerCase(),
                metadata,
                // In the future, we could add automatic_payment_methods: { enabled: true }
            });

            return paymentIntent;
        } catch (error) {
            console.error("Error creating PaymentIntent:", error);
            throw new Error("Failed to initialize payment gateway.");
        }
    }

    /**
     * Validates and constructs the Stripe Webhook Event
     */
    constructWebhookEvent(body: Buffer | string, signature: string): Stripe.Event {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
            throw new Error("Stripe webhook secret is not configured.");
        }

        try {
            // Body must be raw buffer or string for Stripe signature verification to work!
            return this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            throw new Error(`Webhook Error: ${err.message}`);
        }
    }

    /**
     * Creates a refund for a specific PaymentIntent
     */
    async createRefund(paymentIntentId: string, amount?: number): Promise<Stripe.Refund> {
        try {
            const refundParams: Stripe.RefundCreateParams = {
                payment_intent: paymentIntentId,
            };

            if (amount) {
                refundParams.amount = Math.round(amount * 100);
            }

            return await this.stripe.refunds.create(refundParams);
        } catch (error: any) {
            console.error(`Refund failed for payment intent ${paymentIntentId}:`, error);
            throw new Error(`Failed to process refund: ${error.message}`);
        }
    }
}

export default new StripeService();
