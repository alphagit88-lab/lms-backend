import * as crypto from "crypto";

/**
 * PayHere Payment Gateway Service
 * Docs: https://support.payhere.lk/api-&-mobile-sdk/payhere-checkout
 *
 * Flow:
 *  1. Backend generates checkout params + hash
 *  2. Frontend POSTs these params to PayHere's hosted checkout page (redirect)
 *  3. PayHere notifies our server at `notify_url` after payment
 *  4. Backend verifies the notification hash and confirms the payment
 */

export type PayHereCheckoutParams = {
    merchant_id: string;
    return_url: string;
    cancel_url: string;
    notify_url: string;
    order_id: string;
    items: string;
    currency: string;
    amount: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    hash: string;
};

export type PayHereNotifyPayload = {
    merchant_id: string;
    order_id: string;
    payment_id: string;
    payhere_amount: string;
    payhere_currency: string;
    status_code: string; // "2"=success, "0"=pending, "-1"=cancelled, "-2"=failed, "-3"=chargedback
    md5sig: string;
    method: string;
    status_message: string;
    customer_token?: string;
};

/** PayHere status codes */
export const PAYHERE_STATUS = {
    SUCCESS: "2",
    PENDING: "0",
    CANCELLED: "-1",
    FAILED: "-2",
    CHARGEDBACK: "-3",
} as const;

class PayHereService {
    private merchantId: string;
    private merchantSecret: string;
    private checkoutUrl: string;

    constructor() {
        this.merchantId = process.env.PAYHERE_MERCHANT_ID || "";
        this.merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || "";

        // Use sandbox for non-production environments
        const isSandbox = process.env.PAYHERE_SANDBOX !== "false";
        this.checkoutUrl = isSandbox
            ? "https://sandbox.payhere.lk/pay/checkout"
            : "https://www.payhere.lk/pay/checkout";

        if (!this.merchantId || !this.merchantSecret) {
            console.warn(
                "[PayHere] PAYHERE_MERCHANT_ID or PAYHERE_MERCHANT_SECRET is not set. " +
                "Payments will fail. Set these variables in your .env file."
            );
        }
    }

    /**
     * Returns the PayHere checkout page URL (sandbox or live)
     */
    getCheckoutUrl(): string {
        return this.checkoutUrl;
    }

    /**
     * Formats amount to 2 decimal places as required by PayHere
     */
    private formatAmount(amount: number): string {
        return amount.toFixed(2);
    }

    /**
     * Generates the MD5 hash of the merchant secret (upper-cased)
     */
    private hashSecret(): string {
        return crypto
            .createHash("md5")
            .update(this.merchantSecret)
            .digest("hex")
            .toUpperCase();
    }

    /**
     * Generates the request hash for checkout
     * Formula: MD5(merchant_id + order_id + amount + currency + MD5(secret).upper).upper
     */
    generateRequestHash(orderId: string, amount: number, currency: string): string {
        const hashedSecret = this.hashSecret();
        const formattedAmount = this.formatAmount(amount);
        const raw = `${this.merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;
        return crypto.createHash("md5").update(raw).digest("hex").toUpperCase();
    }

    /**
     * Verifies the MD5 signature sent by PayHere on the notify callback
     * Formula: MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + MD5(secret).upper).upper
     */
    verifyNotification(payload: PayHereNotifyPayload): boolean {
        const {
            merchant_id,
            order_id,
            payhere_amount,
            payhere_currency,
            status_code,
            md5sig,
        } = payload;

        const hashedSecret = this.hashSecret();
        const raw = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`;
        const expectedSig = crypto
            .createHash("md5")
            .update(raw)
            .digest("hex")
            .toUpperCase();

        return expectedSig === md5sig;
    }

    /**
     * Builds the complete checkout params object to be sent to the frontend.
     * The frontend will POST this to the PayHere checkout URL.
     */
    buildCheckoutParams(params: {
        orderId: string;
        amount: number;
        currency: string;
        itemDescription: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        address?: string;
        city?: string;
        country?: string;
    }): PayHereCheckoutParams {
        const {
            orderId,
            amount,
            currency,
            itemDescription,
            firstName,
            lastName,
            email,
            phone = "0000000000",
            address = "N/A",
            city = "Colombo",
            country = "Sri Lanka",
        } = params;

        const appUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const apiUrl = process.env.API_URL || "http://localhost:5000";
        const formattedAmount = this.formatAmount(amount);
        const hash = this.generateRequestHash(orderId, amount, currency);

        return {
            merchant_id: this.merchantId,
            return_url: `${appUrl}/payments/success?order_id=${orderId}`,
            cancel_url: `${appUrl}/payments/cancel?order_id=${orderId}`,
            notify_url: `${apiUrl}/api/payments/payhere-notify`,
            order_id: orderId,
            items: itemDescription,
            currency,
            amount: formattedAmount,
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            address,
            city,
            country,
            hash,
        };
    }
}

export default new PayHereService();
