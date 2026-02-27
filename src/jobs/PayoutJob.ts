import cron from "node-cron";
import { AppDataSource } from "../config/data-source";
import { Payment, PaymentStatus } from "../entities/Payment";
import { Payout, PayoutStatus } from "../entities/Payout";

export const startPayoutJob = () => {
    // Run every Sunday at 00:00
    cron.schedule("0 0 * * 0", async () => {
        console.log("[PayoutJob] Starting weekly payout calculation...");

        try {
            const paymentRepo = AppDataSource.getRepository(Payment);
            const payoutRepo = AppDataSource.getRepository(Payout);

            // Find all completed payments that have a recipient and haven't been paid out
            const unprocessedPayments = await paymentRepo.find({
                where: {
                    paymentStatus: PaymentStatus.COMPLETED,
                    // No built-in way to query IsNull in simple object without TypeORM module, so we'll filter manually or builder
                }
            });

            // Filter out payments that already have a payoutId or don't have a recipient
            const paymentsToProcess = unprocessedPayments.filter(p => !p.payoutId && p.recipientId);

            if (paymentsToProcess.length === 0) {
                console.log("[PayoutJob] No pending payments to process.");
                return;
            }

            // Group payments by teacher
            const teacherPayments = new Map<string, Payment[]>();
            for (const payment of paymentsToProcess) {
                if (!payment.recipientId) continue;
                if (!teacherPayments.has(payment.recipientId)) {
                    teacherPayments.set(payment.recipientId, []);
                }
                teacherPayments.get(payment.recipientId)!.push(payment);
            }

            const now = new Date();
            const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

            // For each teacher, create a payout
            for (const [teacherId, payments] of teacherPayments.entries()) {
                let totalAmount = 0;
                for (const p of payments) {
                    totalAmount += (Number(p.amount) - Number(p.platformFee));
                }

                if (totalAmount <= 0) continue;

                const payout = payoutRepo.create({
                    teacherId,
                    amount: totalAmount,
                    periodStart: lastWeek,
                    periodEnd: now,
                    status: PayoutStatus.PENDING,
                });

                await AppDataSource.transaction(async (transactionManager) => {
                    const savedPayout = await transactionManager.save(payout);

                    for (const p of payments) {
                        p.payoutId = savedPayout.id;
                        await transactionManager.save(p);
                    }
                });

                console.log(`[PayoutJob] Created payout of LKR ${totalAmount} for teacher ${teacherId}`);
            }

            console.log("[PayoutJob] Weekly payout calculation completed.");
        } catch (error) {
            console.error("[PayoutJob] Error running weekly payout job:", error);
        }
    });

    console.log("[Jobs] Registered Payout cron job (runs every Sunday at midnight).");
};
