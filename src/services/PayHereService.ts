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
    /**
     * Use getters for environment variables to ensure they are read AFTER dotenv.config()
     * and trimmed of any accidental whitespace (very common deployment issue).
     */
    private get merchantId(): string {
        return (process.env.PAYHERE_MERCHANT_ID || "").trim();
    }

    private get merchantSecret(): string {
        return (process.env.PAYHERE_MERCHANT_SECRET || "").trim();
    }

    private get checkoutUrl(): string {
        const isSandbox = process.env.PAYHERE_SANDBOX !== "false";
        return isSandbox
            ? "https://sandbox.payhere.lk/pay/checkout"
            : "https://www.payhere.lk/pay/checkout";
    }

    private validateConfig() {
        if (!this.merchantId || !this.merchantSecret) {
            throw new Error(
                "PayHere configuration is missing. Please ensure PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET " +
                "are set correctly in your environment variables (e.g. Vercel dashboard)."
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
        return Number(amount).toFixed(2);
    }

    /**
     * Generates the MD5 hash of the merchant secret (upper-cased)
     */
    private hashSecret(): string {
        this.validateConfig();
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

        // Determine base URLs based on environment
        let appUrl = process.env.FRONTEND_URL;
        let apiUrl = process.env.API_URL;

        // If on Vercel and URLs are missing, try to construct them from VERCEL_URL
        if (process.env.VERCEL) {
            // VERCEL_URL is the domain of the current deployment (e.g. project.vercel.app)
            const vercelUrl = `https://${process.env.VERCEL_URL}`;
            if (!appUrl) appUrl = vercelUrl; // Fallback for frontend (assuming monorepo or same domain)
            if (!apiUrl) apiUrl = vercelUrl; // Fallback for backend
        }

        // Final local fallbacks
        if (!appUrl) appUrl = "http://localhost:3000";
        if (!apiUrl) apiUrl = "http://localhost:5000";

        // Ensure no trailing slashes for clean concatenation
        appUrl = appUrl.replace(/\/$/, "");
        apiUrl = apiUrl.replace(/\/$/, "");

        const formattedAmount = this.formatAmount(amount);
        const hash = this.generateRequestHash(orderId, amount, currency);

        const checkoutParams = {
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

        console.log("PayHere Checkout Params Generated:", {
            ...checkoutParams,
            merchant_id: checkoutParams.merchant_id ? "***" : "MISSING", // redact sensitive info
            hash: "REDACTED"
        });

        return checkoutParams;
    }
}

export default new PayHereService();
