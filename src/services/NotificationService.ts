import { AppDataSource } from "../config/data-source";
import {
  Notification,
  NotificationChannel,
  NotificationType,
} from "../entities/Notification";
import { User } from "../entities/User";
import { Booking } from "../entities/Booking";
import { Payment } from "../entities/Payment";
import { EmailService } from "./EmailService";
import { SMSService } from "./SMSService";

export class NotificationService {
  // ─── Core: persist a single in-app notification ───────────────────────────

  static async createInApp(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    referenceId?: string,
    actionUrl?: string
  ): Promise<Notification> {
    const repo = AppDataSource.getRepository(Notification);
    const n = repo.create({
      userId,
      channel: NotificationChannel.IN_APP,
      notificationType: type,
      title,
      message,
      referenceId,
      actionUrl,
      sentAt: new Date(),
      isRead: false,
      deliveryStatus: "sent",
    });
    return repo.save(n);
  }

  // ─── Booking Confirmed ─────────────────────────────────────────────────────

  static async notifyBookingConfirmed(
    booking: Booking,
    student: User,
    teacher: User
  ): Promise<void> {
    const sessionDate = booking.sessionStartTime.toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const sessionTime = booking.sessionStartTime.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const title = "Booking Confirmed";
    const message = `Your session with ${teacher.firstName} ${teacher.lastName} on ${sessionDate} at ${sessionTime} is confirmed.`;

    // In-app
    await NotificationService.createInApp(
      student.id,
      NotificationType.BOOKING_CONFIRMED,
      title,
      message,
      booking.id,
      `/bookings/${booking.id}`
    );

    // Email (fire-and-forget — error logged inside EmailService)
    void EmailService.sendBookingConfirmation({
      to: student.email,
      studentName: `${student.firstName} ${student.lastName}`,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      sessionDate,
      sessionTime,
      meetingLink: booking.meetingLink,
      bookingId: booking.id,
    });

    // SMS
    void SMSService.sendBookingConfirmation(
      student.phone || "",
      student.firstName,
      `${teacher.firstName} ${teacher.lastName}`,
      sessionDate
    );
  }

  // ─── Booking Cancelled ─────────────────────────────────────────────────────

  static async notifyBookingCancelled(
    booking: Booking,
    student: User,
    teacher: User,
    cancelledBy: User
  ): Promise<void> {
    const sessionDate = booking.sessionStartTime.toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const sessionTime = booking.sessionStartTime.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const reason = booking.cancellationReason;
    const refundPercentage = booking.refundPercentage;

    // Notify student
    const studentMsg = `Your session with ${teacher.firstName} ${teacher.lastName} on ${sessionDate} has been cancelled.${refundPercentage ? ` Refund: ${refundPercentage}%.` : ""}`;
    await NotificationService.createInApp(
      student.id,
      NotificationType.BOOKING_CANCELLED,
      "Session Cancelled",
      studentMsg,
      booking.id
    );
    void EmailService.sendBookingCancellation({
      to: student.email,
      recipientName: `${student.firstName} ${student.lastName}`,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      studentName: `${student.firstName} ${student.lastName}`,
      sessionDate,
      sessionTime,
      reason,
      refundPercentage,
    });

    // Notify teacher if student/parent cancelled
    if (cancelledBy.id !== teacher.id) {
      const teacherMsg = `${student.firstName} ${student.lastName} cancelled their session on ${sessionDate}.`;
      await NotificationService.createInApp(
        teacher.id,
        NotificationType.BOOKING_CANCELLED,
        "Session Cancelled by Student",
        teacherMsg,
        booking.id
      );
      void EmailService.sendBookingCancellation({
        to: teacher.email,
        recipientName: `${teacher.firstName} ${teacher.lastName}`,
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
        studentName: `${student.firstName} ${student.lastName}`,
        sessionDate,
        sessionTime,
        reason,
      });
    }
  }

  // ─── Payment Success ───────────────────────────────────────────────────────

  static async notifyPaymentSuccess(payment: Payment, payer: User): Promise<void> {
    const amount = Number(payment.amount);
    const currency = payment.currency || "LKR";
    const paidAt = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await NotificationService.createInApp(
      payer.id,
      NotificationType.PAYMENT_SUCCESS,
      "Payment Successful",
      `Your payment of ${currency} ${amount.toFixed(2)} was received successfully.`,
      payment.id,
      "/payments"
    );

    void EmailService.sendPaymentReceipt({
      to: payer.email,
      recipientName: `${payer.firstName} ${payer.lastName}`,
      amount,
      currency,
      paymentId: payment.id,
      description: payment.paymentType,
      paidAt,
    });
  }

  // ─── Grade Published ───────────────────────────────────────────────────────

  static async notifyGradePublished(
    examTitle: string,
    examId: string,
    studentId: string,
    student: User,
    marksAwarded: number,
    totalMarks: number
  ): Promise<void> {
    const pct = Math.round((marksAwarded / totalMarks) * 100);

    await NotificationService.createInApp(
      studentId,
      NotificationType.GRADE_POSTED,
      "Exam Results Published",
      `Your results for "${examTitle}" are available. Score: ${marksAwarded}/${totalMarks} (${pct}%).`,
      examId,
      `/exams/${examId}/result`
    );

    void EmailService.sendGradePublished({
      to: student.email,
      studentName: `${student.firstName} ${student.lastName}`,
      examTitle,
      marksAwarded,
      totalMarks,
      examId,
    });
  }

  // ─── Session Reminder ──────────────────────────────────────────────────────

  static async notifySessionReminder(
    sessionId: string,
    studentId: string,
    student: User,
    teacherName: string,
    sessionStartTime: Date,
    minutesBefore: number,
    meetingLink?: string
  ): Promise<void> {
    const sessionDate = sessionStartTime.toLocaleDateString("en-GB", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const sessionTime = sessionStartTime.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // In-app
    await NotificationService.createInApp(
      studentId,
      NotificationType.BOOKING_REMINDER,
      `Session in ${minutesBefore} minutes`,
      `Your session with ${teacherName} starts at ${sessionTime} on ${sessionDate}.`,
      sessionId,
      meetingLink
    );

    // Email for 1-hour reminder (less urgent)
    if (minutesBefore >= 55) {
      void EmailService.sendSessionReminder({
        to: student.email,
        recipientName: `${student.firstName} ${student.lastName}`,
        teacherName,
        sessionDate,
        sessionTime,
        minutesBefore,
        meetingLink,
      });
    }

    // SMS for 15-min reminder (urgent)
    if (minutesBefore <= 20) {
      void SMSService.sendSessionReminder(
        student.phone || "",
        student.firstName,
        minutesBefore,
        sessionTime
      );
    }
  }
}
