import cron from "node-cron";
import { AppDataSource } from "../config/data-source";
import { Booking, BookingStatus } from "../entities/Booking";
import { AvailabilitySlot, SlotStatus } from "../entities/AvailabilitySlot";

export const startBookingCleanupJob = () => {
    // Run every 2 minutes
    cron.schedule("*/2 * * * *", async () => {
        // console.log("[BookingCleanupJob] Checking for expired pending bookings...");

        try {
            const bookingRepo = AppDataSource.getRepository(Booking);
            const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
            const now = new Date();

            const expiredBookings = await bookingRepo.createQueryBuilder("booking")
                .leftJoinAndSelect("booking.slot", "slot")
                .where("booking.status = :status", { status: BookingStatus.PENDING_PAYMENT })
                .andWhere("booking.paymentExpiresAt < :now", { now })
                .getMany();

            if (expiredBookings.length === 0) return;

            console.log(`[BookingCleanupJob] Found ${expiredBookings.length} expired bookings to cancel.`);

            await AppDataSource.transaction(async (transactionManager) => {
                for (const booking of expiredBookings) {
                    // Update booking
                    booking.status = BookingStatus.CANCELLED;
                    booking.cancellationReason = "Auto-cancelled due to payment expiration.";
                    booking.cancelledAt = now;
                    await transactionManager.save(Booking, booking);

                    // Revert slot availability
                    if (booking.slot) {
                        const slot = booking.slot;
                        slot.currentBookings = Math.max(0, slot.currentBookings - 1);
                        if (slot.currentBookings < slot.maxBookings) {
                            slot.status = SlotStatus.AVAILABLE;
                        }
                        await transactionManager.save(AvailabilitySlot, slot);
                    }
                }
            });

            console.log("[BookingCleanupJob] Expired bookings cancellation applied.");
        } catch (error) {
            console.error("[BookingCleanupJob] Error running cleanup job:", error);
        }
    });

    console.log("[Jobs] Registered BookingCleanup cron job (runs every 2 mins).");
};
