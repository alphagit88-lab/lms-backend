import cron from "node-cron";
import { AppDataSource } from "../config/data-source";
import { Session, SessionStatus } from "../entities/Session";
import { Notification, NotificationType } from "../entities/Notification";
import { Booking } from "../entities/Booking";
import { User } from "../entities/User";
import { NotificationService } from "../services/NotificationService";
import { Between } from "typeorm";

/**
 * ReminderJob
 * Runs every 5 minutes.
 * - 1-hour window (55–65 min before): sends email + in-app reminder
 * - 15-min window (10–20 min before): sends SMS + in-app reminder
 * Guards against duplicate notifications by checking existing records.
 */
export const startReminderJob = () => {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const sessionRepo = AppDataSource.getRepository(Session);
      const notifRepo = AppDataSource.getRepository(Notification);
      const now = new Date();

      const windows = [
        { minutesBefore: 60, low: 55, high: 65 },
        { minutesBefore: 15, low: 10, high: 20 },
      ];

      for (const win of windows) {
        const windowStart = new Date(now.getTime() + win.low * 60 * 1000);
        const windowEnd = new Date(now.getTime() + win.high * 60 * 1000);

        const sessions = await sessionRepo.find({
          where: {
            status: SessionStatus.SCHEDULED,
            startTime: Between(windowStart, windowEnd),
          },
        });

        for (const session of sessions) {
          // Duplicate-guard: skip if we already sent this reminder
          const existing = await notifRepo.findOne({
            where: {
              notificationType: NotificationType.BOOKING_REMINDER,
              referenceId: session.id,
              // Differentiate 1-hour vs 15-min using title prefix stored in message
            },
          });

          // Use title to distinguish the two reminder tiers
          const reminderTitle = `Session in ${win.minutesBefore} minutes`;
          const alreadySent = await notifRepo.findOne({
            where: {
              notificationType: NotificationType.BOOKING_REMINDER,
              referenceId: session.id,
              title: reminderTitle,
            },
          });
          if (alreadySent) continue;

          // Find booking to get student
          if (!session.bookingId) continue;
          const booking = await AppDataSource.getRepository(Booking).findOne({
            where: { id: session.bookingId },
          });
          if (!booking) continue;

          const student = await AppDataSource.getRepository(User).findOne({
            where: { id: booking.studentId },
          });
          if (!student) continue;

          // Get teacher name
          const teacher = await AppDataSource.getRepository(User).findOne({
            where: { id: booking.teacherId },
          });
          const teacherName = teacher
            ? `${teacher.firstName} ${teacher.lastName}`
            : "your teacher";

          await NotificationService.notifySessionReminder(
            session.id,
            student.id,
            student,
            teacherName,
            session.startTime,
            win.minutesBefore,
            session.meetingLink
          );
        }
      }
    } catch (err) {
      console.error("[ReminderJob] Error:", err);
    }
  });

  console.log("[Jobs] Registered ReminderJob cron (every 5 mins).");
};
