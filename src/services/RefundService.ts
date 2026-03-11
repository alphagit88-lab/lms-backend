import { AppDataSource } from "../config/data-source";
import { Payment, PaymentStatus, PaymentType } from "../entities/Payment";
import { Transaction, TransactionType } from "../entities/Transaction";
import { Booking } from "../entities/Booking";
import { User } from "../entities/User";
import { NotificationService } from "./NotificationService";
import { NotificationType } from "../entities/Notification";

export interface RefundResult {
  payment: Payment;
  refundAmount: number;
  refundPercentage: number;
  message: string;
}

/**
 * Refund policy for booking-based payments (mirrors BookingController policy):
 *  >= 48h before session → 100% refund
 *  >= 6h  before session → 50%  refund
 *  <  6h  before session → 0%   refund (no refund)
 */
function calcBookingRefundPercentage(sessionStartTime: Date): number {
  const now = new Date();
  const hoursUntilSession = (sessionStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilSession >= 48) return 100;
  if (hoursUntilSession >= 6) return 50;
  return 0;
}

class RefundService {
  private paymentRepo = AppDataSource.getRepository(Payment);
  private transactionRepo = AppDataSource.getRepository(Transaction);
  private bookingRepo = AppDataSource.getRepository(Booking);
  private userRepo = AppDataSource.getRepository(User);

  /**
   * Process a refund for a completed payment.
   *
   * - Students may request refunds for their own payments; admin can override percentage.
   * - For booking payments, refund percentage is calculated from cancellation policy.
   * - For course payments, admin must supply refundPercentage explicitly.
   * - PayHere does not expose an automated refund API; the actual money return
   *   is handled manually in the PayHere Merchant Portal. This method records
   *   the refund decision in the database and notifies the user.
   */
  async processRefund(params: {
    paymentId: string;
    requestedByUserId: string;
    requestedByRole: string;
    reason: string;
    /** Admin may override — 0–100. Booking payments auto-calculate if omitted. */
    refundPercentage?: number;
  }): Promise<RefundResult> {
    const { paymentId, requestedByUserId, requestedByRole, reason, refundPercentage: overridePercentage } = params;

    // 1. Load payment
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new Error("Payment not found.");
    }

    // 2. Ownership check — students can only refund their own payments
    if (requestedByRole !== "admin" && payment.userId !== requestedByUserId) {
      throw new Error("Access denied: you can only request refunds for your own payments.");
    }

    // 3. Status check — only COMPLETED payments can be refunded
    if (payment.paymentStatus !== PaymentStatus.COMPLETED) {
      throw new Error(
        `Payment cannot be refunded: current status is "${payment.paymentStatus}". Only completed payments are eligible.`
      );
    }

    // 4. Determine refund percentage
    let refundPct: number;

    if (requestedByRole === "admin" && overridePercentage !== undefined) {
      // Admin explicit override
      if (overridePercentage < 0 || overridePercentage > 100) {
        throw new Error("refundPercentage must be between 0 and 100.");
      }
      refundPct = overridePercentage;
    } else if (
      payment.paymentType === PaymentType.BOOKING_SESSION
    ) {
      // Auto-calculate from cancellation policy
      const booking = await this.bookingRepo.findOne({ where: { id: payment.referenceId } });
      if (!booking) {
        throw new Error("Associated booking not found. Cannot calculate refund.");
      }
      refundPct = calcBookingRefundPercentage(booking.sessionStartTime);
    } else if (requestedByRole === "admin") {
      // Course / content payment — admin must supply percentage
      throw new Error(
        "For course/content payments, admin must supply refundPercentage explicitly."
      );
    } else {
      // Students may not self-request refunds for course enrollments
      throw new Error(
        "Refund requests for course enrollments must be reviewed by an administrator."
      );
    }

    if (refundPct === 0) {
      throw new Error(
        "No refund is applicable based on the cancellation policy (session starts in less than 6 hours)."
      );
    }

    // 5. Calculate refund amount from *original payment amount*
    const originalAmount = Number(payment.amount);
    const refundAmount = parseFloat(((originalAmount * refundPct) / 100).toFixed(2));

    // 6. Persist refund on the Payment record
    const newStatus = refundPct === 100 ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
    payment.paymentStatus = newStatus;
    payment.refundAmount = refundAmount;
    payment.refundDate = new Date();
    payment.metadata = {
      ...(payment.metadata ?? {}),
      refundReason: reason,
      refundPercentage: refundPct,
      refundProcessedBy: requestedByUserId,
    };
    await this.paymentRepo.save(payment);

    // 7. Create a REFUND transaction record
    const txn = this.transactionRepo.create({
      paymentId: payment.id,
      userId: payment.userId,
      transactionType: TransactionType.REFUND,
      // Stored as negative to indicate money out of platform
      amount: -refundAmount,
      currency: payment.currency,
      description: `Refund (${refundPct}%): ${reason}`,
    });
    await this.transactionRepo.save(txn);

    // 8. In-app notification to the payer (fire-and-forget)
    void (async () => {
      try {
        const payer = await this.userRepo.findOne({ where: { id: payment.userId } });
        if (payer) {
          await NotificationService.createInApp(
            payer.id,
            NotificationType.PAYMENT_REFUNDED,
            "Refund Processed",
            `A refund of ${payment.currency} ${refundAmount.toFixed(2)} (${refundPct}%) has been approved for your payment. ` +
              `It will be returned via the original payment method. Reason: ${reason}`,
            payment.id,
            `/payments/${payment.id}`
          );
        }
      } catch {
        // Notification failure should not block the refund response
      }
    })();

    const message =
      refundPct === 100
        ? `Full refund of ${payment.currency} ${refundAmount.toFixed(2)} recorded successfully.`
        : `Partial refund of ${payment.currency} ${refundAmount.toFixed(2)} (${refundPct}%) recorded successfully.`;

    return { payment, refundAmount, refundPercentage: refundPct, message };
  }
}

export const refundService = new RefundService();
