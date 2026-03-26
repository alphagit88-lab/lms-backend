import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Booking, BookingStatus } from "../entities/Booking";
import { BookingPackage, PackageStatus } from "../entities/BookingPackage";
import { AvailabilitySlot, SlotStatus } from "../entities/AvailabilitySlot";
import { StudentParent, LinkStatus } from "../entities/StudentParent";
import { TeacherProfile } from "../entities/TeacherProfile";
import { Payment, PaymentStatus, PaymentType } from "../entities/Payment";
import { User } from "../entities/User";
import { Session, SessionType, SessionStatus } from "../entities/Session";
import { QueryRunner } from "typeorm";
import ZoomService from "../services/ZoomService";
import { parsePagination, createPaginationMeta } from "../utils/pagination";
import { Logger } from "../utils/logger";
import { NotificationService } from "../services/NotificationService";
import { isZoomFreePlan, ZOOM_MAX_FREE_DURATION_MINUTES } from "../config/zoomConfig";
import { TeacherAssistant } from "../entities/TeacherAssistant";

/**
 * Cancellation refund policy:
 *  - Teacher cancels → 100% refund always
 *  - 24+ hours before session → 100% refund
 *  - 6–24 hours before → 50% refund
 *  - <6 hours before → 0% refund
 */
function calculateRefundPercentage(
  sessionStartTime: Date,
  cancelledAt: Date,
  cancelledByTeacher: boolean
): number {
  if (cancelledByTeacher) return 100;

  const hoursUntilSession =
    (sessionStartTime.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);

  if (hoursUntilSession >= 24) return 100;
  if (hoursUntilSession >= 6) return 50;
  return 0;
}

export class BookingController {
  /**
   * Helper to check if a user is authorized to manage a teacher's bookings.
   */
  private static checkAuthorization = async (
    userId: string,
    teacherId: string,
    permission: "slots" | "bookings" = "bookings"
  ): Promise<boolean> => {
    if (userId === teacherId) return true;

    const assistantRepo = AppDataSource.getRepository(TeacherAssistant);
    const assistant = await assistantRepo.findOne({
      where: { teacherId, assistantId: userId },
    });

    if (!assistant) return false;

    return permission === "slots" ? assistant.canManageSlots : assistant.canManageBookings;
  };

  /**
   * Helper to create a Zoom meeting and Session record for a confirmed booking
   */
  public static createZoomMeetingForBooking = async (
    booking: Booking,
    teacherName: string,
    queryRunner?: QueryRunner
  ): Promise<boolean> => {
    try {
      const duration = Math.round(
        (booking.sessionEndTime.getTime() - booking.sessionStartTime.getTime()) / (1000 * 60)
      );

      if (isZoomFreePlan() && duration > ZOOM_MAX_FREE_DURATION_MINUTES) {
        Logger.warn(
          `Zoom free-plan duration exceeded for booking ${booking.id}. ` +
          `Scheduled duration ${duration} minutes is greater than ${ZOOM_MAX_FREE_DURATION_MINUTES} minutes. ` +
          `Zoom will still create the meeting but may enforce its own time limits.`
        );
      }

      const zoomResponse = await ZoomService.createMeeting({
        topic: `${teacherName} - ${booking.notes || 'Tutoring Session'}`,
        startTime: booking.sessionStartTime,
        duration: duration,
      });

      // Update booking with Zoom details
      booking.meetingLink = zoomResponse.joinUrl;
      booking.meetingStartLink = zoomResponse.startUrl;
      booking.meetingId = zoomResponse.meetingId;
      booking.meetingPassword = zoomResponse.password;

      if (queryRunner) {
        await queryRunner.manager.save(Booking, booking);
      } else {
        await AppDataSource.getRepository(Booking).save(booking);
      }

      // Create Session record
      if (queryRunner) {
        const session = queryRunner.manager.create(Session, {
          bookingId: booking.id,
          title: `${teacherName} - ${booking.notes || 'Tutoring Session'}`,
          startTime: booking.sessionStartTime,
          endTime: booking.sessionEndTime,
          sessionType: SessionType.LIVE,
          status: SessionStatus.SCHEDULED,
          meetingLink: zoomResponse.joinUrl,
          meetingStartLink: zoomResponse.startUrl,
          meetingId: zoomResponse.meetingId,
          meetingPassword: zoomResponse.password,
        });
        await queryRunner.manager.save(Session, session);
      } else {
        const sessionRepo = AppDataSource.getRepository(Session);
        const session = sessionRepo.create({
          bookingId: booking.id,
          title: `${teacherName} - ${booking.notes || 'Tutoring Session'}`,
          startTime: booking.sessionStartTime,
          endTime: booking.sessionEndTime,
          sessionType: SessionType.LIVE,
          status: SessionStatus.SCHEDULED,
          meetingLink: zoomResponse.joinUrl,
          meetingStartLink: zoomResponse.startUrl,
          meetingId: zoomResponse.meetingId,
          meetingPassword: zoomResponse.password,
        });
        await sessionRepo.save(session);
      }

      Logger.info(`Created Zoom meeting and session for booking ${booking.id}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to create Zoom meeting for booking ${booking.id}`, error);
      // We don't throw here to ensure the booking confirmation itself isn't rolled back
      // if Zoom API is down, but we record the failure.
      return false;
    }
  };

  // Create a booking (Student or Parent)
  static createBooking = async (req: Request, res: Response): Promise<Response> => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { slotId, studentId, notes } = req.body;
      const bookedById = req.session.userId!;
      const userRole = req.session.userRole;

      // Validation
      if (!slotId) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: "Slot ID is required" });
      }

      // If parent is booking, verify they are linked to the student
      if (userRole === "parent") {
        if (!studentId) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
          return res.status(400).json({ error: "Student ID is required for parent bookings" });
        }

        const link = await queryRunner.manager.findOne(StudentParent, {
          where: {
            parentId: bookedById,
            studentId,
            status: LinkStatus.ACCEPTED,
          },
        });

        if (!link) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
          return res.status(403).json({ error: "You are not linked to this student" });
        }
      }

      // Determine the actual student ID
      const actualStudentId = userRole === "parent" ? studentId : bookedById;

      // Get the slot with row-level lock to prevent race conditions
      const slot = await queryRunner.manager
        .createQueryBuilder(AvailabilitySlot, "slot")
        .setLock("pessimistic_write")
        .where("slot.id = :slotId", { slotId })
        .getOne();

      if (!slot) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(404).json({ error: "Availability slot not found" });
      }

      if (slot.status !== SlotStatus.AVAILABLE) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: "This slot is not available for booking" });
      }

      // Check if slot is already fully booked (with lock, this is now safe)
      if (slot.currentBookings >= slot.maxBookings) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: "This slot is fully booked" });
      }

      // Check if student already has a booking for this slot
      const existingBooking = await queryRunner.manager.findOne(Booking, {
        where: { slotId, studentId: actualStudentId },
      });

      if (existingBooking) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(409).json({ error: "You already have a booking for this slot" });
      }

      // Check for overlapping bookings with the same teacher (conflict detection)
      const overlappingBooking = await queryRunner.manager
        .createQueryBuilder(Booking, "booking")
        .where("booking.studentId = :studentId", { studentId: actualStudentId })
        .andWhere("booking.teacherId = :teacherId", { teacherId: slot.teacherId })
        .andWhere("booking.status IN (:...statuses)", {
          statuses: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        })
        .andWhere(
          "(booking.sessionStartTime < :slotEndTime AND booking.sessionEndTime > :slotStartTime)",
          {
            slotStartTime: slot.startTime,
            slotEndTime: slot.endTime,
          }
        )
        .getOne();

      if (overlappingBooking) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(409).json({
          error: "You already have a booking with this teacher at an overlapping time",
          conflictingBooking: {
            id: overlappingBooking.id,
            startTime: overlappingBooking.sessionStartTime,
            endTime: overlappingBooking.sessionEndTime,
          },
        });
      }

      // Check if teacher has auto-confirm enabled
      const teacherProfile = await queryRunner.manager.findOne(TeacherProfile, {
        where: { teacherId: slot.teacherId },
      });
      const shouldAutoConfirm = teacherProfile?.autoConfirmBookings === true;

      // Create the booking
      // Story 2.7: Set PENDING_PAYMENT with a 30-minute expiry for paid slots
      const basePrice = slot.price || 0;
      const discountPercent = slot.discountPercentage || 0;
      const bookingAmount = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
      const isPaid = Number(bookingAmount) > 0;
      const finalStatus = shouldAutoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
      const initialStatus = isPaid ? BookingStatus.PENDING_PAYMENT : finalStatus;

      const paymentExpiresAt = isPaid ? new Date(Date.now() + 30 * 60 * 1000) : undefined;

      const booking = queryRunner.manager.create(Booking, {
        slotId,
        studentId: actualStudentId,
        teacherId: slot.teacherId,
        bookedById,
        sessionStartTime: slot.startTime,
        sessionEndTime: slot.endTime,
        notes,
        amount: bookingAmount,
        status: initialStatus,
        paymentExpiresAt,
      });

      await queryRunner.manager.save(Booking, booking);

      // Update slot booking count (atomic within transaction)
      slot.currentBookings += 1;
      if (slot.currentBookings >= slot.maxBookings) {
        slot.status = SlotStatus.BOOKED;
      }
      await queryRunner.manager.save(AvailabilitySlot, slot);

      await queryRunner.commitTransaction();

      if (!isPaid && shouldAutoConfirm) {
        const teacher = await AppDataSource.getRepository(User).findOne({ where: { id: slot.teacherId } });
        const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "Teacher";
        await BookingController.createZoomMeetingForBooking(booking, teacherName);
      }

      const message = isPaid
        ? "Booking pending payment"
        : shouldAutoConfirm
          ? "Booking created and auto-confirmed"
          : "Booking created successfully";

      return res.status(201).json({ message, booking, autoConfirmed: !isPaid && shouldAutoConfirm });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Error creating booking:", error);
      return res.status(500).json({ error: "Failed to create booking" });
    } finally {
      await queryRunner.release();
    }
  };

  // Get user's bookings
  static getMyBookings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const { status, upcoming } = req.query;

      // Parse pagination parameters
      const pagination = parsePagination(req.query, 20, 100);

      const bookingRepository = AppDataSource.getRepository(Booking);
      let query = bookingRepository.createQueryBuilder("booking")
        .leftJoinAndSelect("booking.slot", "slot")
        .leftJoinAndSelect("booking.teacher", "teacher")
        .leftJoinAndSelect("booking.student", "student")
        .where("booking.studentId = :userId", { userId });

      if (status) {
        query = query.andWhere("booking.status = :status", { status });
      }

      if (upcoming === "true") {
        query = query.andWhere("booking.sessionStartTime > :now", { now: new Date() });
      }

      // Get total count for pagination
      const totalCount = await query.getCount();

      // Apply pagination
      const bookings = await query
        .orderBy("booking.sessionStartTime", "DESC")
        .skip(pagination.offset)
        .take(pagination.limit)
        .getMany();

      // Create pagination metadata
      const paginationMeta = createPaginationMeta(
        pagination.page,
        pagination.limit,
        totalCount
      );

      return res.json({
        bookings,
        pagination: paginationMeta,
      });
    } catch (error: any) {
      Logger.error("Error fetching bookings:", error, req);
      return res.status(500).json({ error: "Failed to fetch bookings" });
    }
  };

  // Get bookings for a student (Parent only)
  static getStudentBookings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const studentId = req.params.studentId as string;
      const parentId = req.session.userId!;

      // Verify parent is linked to student
      const linkRepository = AppDataSource.getRepository(StudentParent);
      const link = await linkRepository.findOne({
        where: {
          parentId,
          studentId,
          status: LinkStatus.ACCEPTED,
        },
      });

      if (!link) {
        return res.status(403).json({ error: "You are not linked to this student" });
      }

      const bookingRepository = AppDataSource.getRepository(Booking);
      const bookings = await bookingRepository.find({
        where: { studentId },
        relations: ["slot", "teacher", "student"],
        order: { sessionStartTime: "DESC" },
      });

      return res.json({ bookings });
    } catch (error: any) {
      console.error("Error fetching student bookings:", error);
      return res.status(500).json({ error: "Failed to fetch student bookings" });
    }
  };

  // Get teacher's bookings (Teacher or Assistant)
  static getTeacherBookings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const currentUserId = req.session.userId!;
      const { teacherId, status, date } = req.query;

      const targetTeacherId = (teacherId as string) || currentUserId;

      // Authorization Check
      if (!(await BookingController.checkAuthorization(currentUserId, targetTeacherId, "bookings"))) {
        return res.status(403).json({ error: "You are not authorized to view bookings for this teacher" });
      }

      const bookingRepository = AppDataSource.getRepository(Booking);
      let query = bookingRepository.createQueryBuilder("booking")
        .leftJoinAndSelect("booking.slot", "slot")
        .leftJoinAndSelect("booking.student", "student")
        .where("booking.teacherId = :targetTeacherId", { targetTeacherId: targetTeacherId });

      if (status) {
        query = query.andWhere("booking.status = :status", { status });
      }

      if (date) {
        const startOfDay = new Date(date as string);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setHours(23, 59, 59, 999);

        query = query.andWhere("booking.sessionStartTime BETWEEN :start AND :end", {
          start: startOfDay,
          end: endOfDay,
        });
      }

      const bookings = await query.orderBy("booking.sessionStartTime", "ASC").getMany();

      return res.json({ bookings });
    } catch (error: any) {
      console.error("Error fetching teacher bookings:", error);
      return res.status(500).json({ error: "Failed to fetch teacher bookings" });
    }
  };

  // Confirm booking (Teacher or Assistant)
  static confirmBooking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const currentUserId = req.session.userId!;
      const { meetingLink } = req.body;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({
        where: { id },
        relations: ["teacher"]
      });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Authorization Check
      if (!(await BookingController.checkAuthorization(currentUserId, booking.teacherId, "bookings"))) {
        return res.status(403).json({ error: "You are not authorized to confirm bookings for this teacher" });
      }

      if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.PENDING_PAYMENT) {
        return res.status(400).json({ error: "Only pending bookings can be confirmed" });
      }

      // ── Payment Gate (Fix 1 — R6 alignment) ──────────────────────────────
      // If the booking is for a paid slot and is still awaiting payment,
      // the teacher cannot confirm it manually until payment completes.
      //
      // Logic:
      //  • Free slots (amount null or 0)  → no payment required, skip check
      //  • PENDING status (not PENDING_PAYMENT) → payment already fulfilled
      //    by PayHere webhook which promotes the booking to PENDING; skip check
      //  • PENDING_PAYMENT + paid amount → payment has NOT yet been received;
      //    verify a completed Payment record exists before allowing confirmation
      const isPaidBooking = booking.amount && Number(booking.amount) > 0;
      const isAwaitingPayment = booking.status === BookingStatus.PENDING_PAYMENT;

      if (isPaidBooking && isAwaitingPayment) {
        const paymentRepository = AppDataSource.getRepository(Payment);

        // Two ways a completed payment can be linked:
        // 1. booking.paymentId is set (preferred — set by PayHere webhook handler)
        // 2. Payment.referenceId = booking.id + status = completed (fallback)
        let paymentConfirmed = false;

        if (booking.paymentId) {
          const linkedPayment = await paymentRepository.findOne({
            where: { id: booking.paymentId, paymentStatus: PaymentStatus.COMPLETED },
          });
          paymentConfirmed = !!linkedPayment;
        }

        if (!paymentConfirmed) {
          const paymentByRef = await paymentRepository.findOne({
            where: {
              referenceId: booking.id,
              paymentStatus: PaymentStatus.COMPLETED,
            },
          });
          paymentConfirmed = !!paymentByRef;

          // If found via referenceId, back-fill booking.paymentId for future lookups
          if (paymentByRef) {
            booking.paymentId = paymentByRef.id;
          }
        }

        if (!paymentConfirmed) {
          // Calculate time remaining on the payment window
          const expiresAt = booking.paymentExpiresAt;
          const timeLeftMs = expiresAt ? expiresAt.getTime() - Date.now() : null;
          const timeLeftMins = timeLeftMs && timeLeftMs > 0
            ? Math.ceil(timeLeftMs / 60000)
            : null;

          return res.status(402).json({
            error: "Cannot confirm booking: payment has not been completed by the student.",
            detail: timeLeftMins
              ? `The student has ${timeLeftMins} minute(s) remaining to complete payment.`
              : expiresAt && Date.now() > expiresAt.getTime()
                ? "The payment window has expired. The student must rebook."
                : "Payment is still pending.",
            bookingId: booking.id,
            amount: booking.amount,
            paymentStatus: "pending",
          });
        }

        // Payment verified — clear the expiry flag
        booking.paymentExpiresAt = undefined;
      }
      // ─────────────────────────────────────────────────────────────────────

      booking.status = BookingStatus.CONFIRMED;
      // Clear payment expiry (covers the case of admin overriding a pending-payment booking)
      if (booking.paymentExpiresAt) booking.paymentExpiresAt = undefined;

      let zoomCreated = true;
      if (meetingLink) {
        booking.meetingLink = meetingLink;
        await bookingRepository.save(booking);
      } else {
        // Automatically create Zoom meeting if no link provided
        const teacherName = booking.teacher ? `${booking.teacher.firstName} ${booking.teacher.lastName}` : "Teacher";
        zoomCreated = await BookingController.createZoomMeetingForBooking(booking, teacherName);
      }

      // Fire notification (fire-and-forget)
      const userRepo = AppDataSource.getRepository(User);
      const [student, teacher] = await Promise.all([
        userRepo.findOne({ where: { id: booking.studentId } }),
        userRepo.findOne({ where: { id: booking.teacherId } }),
      ]);
      if (student && teacher) {
        void NotificationService.notifyBookingConfirmed(booking, student, teacher);
      }

      return res.json({ 
        message: zoomCreated ? "Booking confirmed successfully" : "Booking confirmed, but auto-creation of Zoom meeting failed. Please add a link manually.", 
        booking,
        warning: !zoomCreated 
      });
    } catch (error: any) {
      console.error("Error confirming booking:", error);
      return res.status(500).json({ error: "Failed to confirm booking" });
    }
  };


  // Cancel booking with refund policy
  static cancelBooking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId!;
      const { reason } = req.body;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({
        where: { id },
        relations: ["slot"],
      });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check if user has permission to cancel
      if (booking.studentId !== userId && booking.teacherId !== userId && booking.bookedById !== userId) {
        return res.status(403).json({ error: "You do not have permission to cancel this booking" });
      }

      if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
        return res.status(400).json({ error: "Cannot cancel this booking" });
      }

      const now = new Date();
      
      // Determine if cancelled by teacher or assistant
      const isAssistant = userId !== booking.teacherId && userId !== booking.studentId && userId !== booking.bookedById;
      const cancelledByTeacher = userId === booking.teacherId || isAssistant;

      if (isAssistant) {
        // Double check authorization (though general permission was checked above, 
        // we confirm they are an assistant for THIS specific teacher)
        if (!(await BookingController.checkAuthorization(userId, booking.teacherId, "bookings"))) {
          return res.status(403).json({ error: "You do not have permission to cancel this booking" });
        }
      }

      // Calculate refund policy
      const refundPercentage = calculateRefundPercentage(
        booking.sessionStartTime,
        now,
        cancelledByTeacher
      );

      const bookingAmount = booking.amount ? Number(booking.amount) : 0;
      const refundAmount = Math.round((bookingAmount * refundPercentage) / 100 * 100) / 100; // round to 2 decimals

      booking.status = BookingStatus.CANCELLED;
      booking.cancellationReason = reason;
      booking.cancelledAt = now;
      booking.cancelledById = userId;
      booking.refundPercentage = refundPercentage;
      booking.refundAmount = refundAmount;

      await bookingRepository.save(booking);

      // Cancel the Session
      const sessionRepository = AppDataSource.getRepository(Session);
      const session = await sessionRepository.findOne({ where: { bookingId: booking.id } });
      if (session) {
        session.status = SessionStatus.CANCELLED;
        await sessionRepository.save(session);

        // Best-effort: delete Zoom meeting if one exists
        if (session.meetingId) {
          try {
            await ZoomService.deleteMeeting(session.meetingId);
          } catch (zoomError) {
            console.error(`Zoom meeting deletion failed for session ${session.id}:`, zoomError);
          }
        }
      }

      // If a payment exists, update its refund info
      if (booking.paymentId) {
        const paymentRepository = AppDataSource.getRepository(Payment);
        const payment = await paymentRepository.findOne({ where: { id: booking.paymentId } });
        if (payment) {
          payment.refundAmount = refundAmount;
          payment.refundDate = now;
          payment.paymentStatus =
            refundPercentage === 100
              ? PaymentStatus.REFUNDED
              : refundPercentage > 0
                ? PaymentStatus.PARTIALLY_REFUNDED
                : payment.paymentStatus; // keep original if 0% refund
          await paymentRepository.save(payment);
        }
      }

      // Update slot availability
      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = booking.slot;
      if (slot) {
        slot.currentBookings = Math.max(0, slot.currentBookings - 1);
        if (slot.currentBookings < slot.maxBookings) {
          slot.status = SlotStatus.AVAILABLE;
        }
        await slotRepository.save(slot);
      }

      // Fire cancellation notification (fire-and-forget)
      const userRepo = AppDataSource.getRepository(User);
      const [student, teacher, cancelledByUser] = await Promise.all([
        userRepo.findOne({ where: { id: booking.studentId } }),
        userRepo.findOne({ where: { id: booking.teacherId } }),
        userRepo.findOne({ where: { id: userId } }),
      ]);
      if (student && teacher && cancelledByUser) {
        void NotificationService.notifyBookingCancelled(booking, student, teacher, cancelledByUser);
      }

      return res.json({
        message: "Booking cancelled successfully",
        booking,
        refundPolicy: {
          percentage: refundPercentage,
          amount: refundAmount,
          cancelledByTeacher,
          hoursBeforeSession: Math.max(
            0,
            (booking.sessionStartTime.getTime() - now.getTime()) / (1000 * 60 * 60)
          ),
        },
      });
    } catch (error: any) {
      console.error("Error cancelling booking:", error);
      return res.status(500).json({ error: "Failed to cancel booking" });
    }
  };

  // Preview cancellation refund policy (any party to the booking)
  static getCancellationPolicy = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId!;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({ where: { id } });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check if user is a party to this booking
      if (booking.studentId !== userId && booking.teacherId !== userId && booking.bookedById !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
        return res.status(400).json({ error: "Booking is already finalized" });
      }

      const now = new Date();
      const cancelledByTeacher = userId === booking.teacherId;
      const refundPercentage = calculateRefundPercentage(
        booking.sessionStartTime,
        now,
        cancelledByTeacher
      );

      const bookingAmount = booking.amount ? Number(booking.amount) : 0;
      const refundAmount = Math.round((bookingAmount * refundPercentage) / 100 * 100) / 100;

      const hoursBeforeSession = Math.max(
        0,
        (booking.sessionStartTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      );

      return res.json({
        bookingId: booking.id,
        sessionStartTime: booking.sessionStartTime,
        amount: bookingAmount,
        refundPercentage,
        refundAmount,
        cancelledByTeacher,
        hoursBeforeSession: Math.round(hoursBeforeSession * 10) / 10,
        policyDescription:
          cancelledByTeacher
            ? "Teacher-initiated cancellation — 100% refund"
            : hoursBeforeSession >= 24
              ? "24+ hours before session — 100% refund"
              : hoursBeforeSession >= 6
                ? "6–24 hours before session — 50% refund"
                : "Less than 6 hours before session — no refund",
      });
    } catch (error: any) {
      console.error("Error fetching cancellation policy:", error);
      return res.status(500).json({ error: "Failed to fetch cancellation policy" });
    }
  };

  // Mark booking as completed (Teacher or Assistant)
  static completeBooking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const currentUserId = req.session.userId!;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({ where: { id } });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Authorization Check
      if (!(await BookingController.checkAuthorization(currentUserId, booking.teacherId, "bookings"))) {
        return res.status(403).json({ error: "You are not authorized to complete bookings for this teacher" });
      }

      booking.status = BookingStatus.COMPLETED;
      await bookingRepository.save(booking);

      // Also mark the session as completed so recording job can pick it up
      const sessionRepository = AppDataSource.getRepository(Session);
      const session = await sessionRepository.findOne({ where: { bookingId: booking.id } });
      if (session) {
        session.status = SessionStatus.COMPLETED;
        await sessionRepository.save(session);
      }

      return res.json({ message: "Booking marked as completed", booking });
    } catch (error: any) {
      console.error("Error completing booking:", error);
      return res.status(500).json({ error: "Failed to complete booking" });
    }
  };

  // Mark booking as no-show (Teacher or Assistant)
  static markNoShow = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const currentUserId = req.session.userId!;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({ where: { id } });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Authorization Check
      if (!(await BookingController.checkAuthorization(currentUserId, booking.teacherId, "bookings"))) {
        return res.status(403).json({ error: "You are not authorized to manage bookings for this teacher" });
      }

      booking.status = BookingStatus.NO_SHOW;
      await bookingRepository.save(booking);

      // Mark session as no-show
      const sessionRepository = AppDataSource.getRepository(Session);
      const session = await sessionRepository.findOne({ where: { bookingId: booking.id } });
      if (session) {
        // We cancel the session for no-shows so it doesn't try to fetch recordings
        session.status = SessionStatus.CANCELLED;
        await sessionRepository.save(session);
      }

      return res.json({ message: "Booking marked as no-show", booking });
    } catch (error: any) {
      console.error("Error marking no-show:", error);
      return res.status(500).json({ error: "Failed to mark booking as no-show" });
    }
  };

  // ── Package Booking Methods ─────────────────────────────────────────

  // Create a multi-session package booking (atomic transaction)
  static createPackageBooking = async (req: Request, res: Response): Promise<Response> => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { slotIds, studentId, title, notes } = req.body;
      const bookedById = req.session.userId!;
      const userRole = req.session.userRole;

      // Validation
      if (!slotIds || !Array.isArray(slotIds) || slotIds.length < 2) {
        return res.status(400).json({ error: "At least 2 slot IDs are required for a package booking" });
      }

      if (slotIds.length > 20) {
        return res.status(400).json({ error: "Maximum 20 slots per package" });
      }

      // If parent is booking, verify they are linked to the student
      if (userRole === "parent") {
        if (!studentId) {
          return res.status(400).json({ error: "Student ID is required for parent bookings" });
        }

        const link = await queryRunner.manager.findOne(StudentParent, {
          where: { parentId: bookedById, studentId, status: LinkStatus.ACCEPTED },
        });

        if (!link) {
          await queryRunner.rollbackTransaction();
          return res.status(403).json({ error: "You are not linked to this student" });
        }
      }

      const actualStudentId = userRole === "parent" ? studentId : bookedById;

      // Fetch and validate ALL slots
      const slots: AvailabilitySlot[] = [];
      for (const slotId of slotIds) {
        const slot = await queryRunner.manager.findOne(AvailabilitySlot, { where: { id: slotId } });

        if (!slot) {
          await queryRunner.rollbackTransaction();
          return res.status(404).json({ error: `Slot ${slotId} not found` });
        }

        if (slot.status !== SlotStatus.AVAILABLE) {
          await queryRunner.rollbackTransaction();
          return res.status(400).json({ error: `Slot on ${slot.startTime.toISOString()} is not available` });
        }

        if (slot.currentBookings >= slot.maxBookings) {
          await queryRunner.rollbackTransaction();
          return res.status(400).json({ error: `Slot on ${slot.startTime.toISOString()} is fully booked` });
        }

        // Check for existing booking
        const existing = await queryRunner.manager.findOne(Booking, {
          where: { slotId, studentId: actualStudentId },
        });
        if (existing) {
          await queryRunner.rollbackTransaction();
          return res.status(409).json({ error: `Student already has a booking for slot on ${slot.startTime.toISOString()}` });
        }

        slots.push(slot);
      }

      // Determine the main teacher (if all slots are same) or set as null for multi-instructor
      const teacherIds = Array.from(new Set(slots.map((s) => s.teacherId)));
      const teacherId = teacherIds.length === 1 ? teacherIds[0] : undefined;

      // Check auto-confirm (only if single teacher)
      let shouldAutoConfirm = false;
      if (teacherId) {
        const teacherProfile = await queryRunner.manager.findOne(TeacherProfile, {
          where: { teacherId },
        });
        shouldAutoConfirm = teacherProfile?.autoConfirmBookings === true;
      }

      // Calculate pricing
      const totalPrice = slots.reduce((sum, slot) => {
        const basePrice = slot.price || 0;
        const discountPercent = slot.discountPercentage || 0;
        const slotEffectivePrice = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
        return sum + slotEffectivePrice;
      }, 0);

      // Package discount logic
      let discountPercentage = 0;
      if (teacherId) {
        // Single teacher package - use their profile settings
        const teacherProfile = await queryRunner.manager.findOne(TeacherProfile, {
          where: { teacherId },
        });
        const d3 = teacherProfile?.packageDiscount3Plus ?? 5;
        const d5 = teacherProfile?.packageDiscount5Plus ?? 10;
        discountPercentage = slots.length >= 5 ? d5 : slots.length >= 3 ? d3 : 0;
      } else {
        // Multi-instructor package - use system defaults
        discountPercentage = slots.length >= 5 ? 10 : slots.length >= 3 ? 5 : 0;
      }
      
      const finalPrice = Math.round(totalPrice * (1 - discountPercentage / 100) * 100) / 100;

      // Create the package
      const packageEntity = queryRunner.manager.create(BookingPackage, {
        teacherId,
        studentId: actualStudentId,
        bookedById,
        title: title || `${slots.length} Sessions Package`,
        totalSessions: slots.length,
        totalPrice,
        discountPercentage,
        finalPrice,
        notes,
        status: PackageStatus.ACTIVE,
      });

      const savedPackage = await queryRunner.manager.save(BookingPackage, packageEntity);

      // Create individual bookings for each slot
      const bookings: Booking[] = [];
      const pricePerSession = Math.round((finalPrice / slots.length) * 100) / 100;

      const isPaidPackage = finalPrice > 0;
      const initialStatus = isPaidPackage ? BookingStatus.PENDING_PAYMENT : (shouldAutoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING);
      const paymentExpiresAt = isPaidPackage ? new Date(Date.now() + 10 * 60 * 1000) : undefined;

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];

        const booking = queryRunner.manager.create(Booking, {
          slotId: slot.id,
          studentId: actualStudentId,
          teacherId: slot.teacherId, // Use the teacher of this specific slot
          bookedById,
          sessionStartTime: slot.startTime,
          sessionEndTime: slot.endTime,
          notes,
          amount: pricePerSession,
          packageId: savedPackage.id,
          status: initialStatus,
          paymentExpiresAt,
        });

        const savedBooking = await queryRunner.manager.save(Booking, booking);
        bookings.push(savedBooking);

        // Update slot booking count
        slot.currentBookings += 1;
        if (slot.currentBookings >= slot.maxBookings) {
          slot.status = SlotStatus.BOOKED;
        }
        await queryRunner.manager.save(AvailabilitySlot, slot);
      }

      await queryRunner.commitTransaction();

      return res.status(201).json({
        message: "Package booking created successfully",
        package: savedPackage,
        bookings,
        discount: {
          percentage: discountPercentage,
          saved: Math.round((totalPrice - finalPrice) * 100) / 100,
        },
        autoConfirmed: shouldAutoConfirm,
      });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Error creating package booking:", error);
      return res.status(500).json({ error: "Failed to create package booking" });
    } finally {
      await queryRunner.release();
    }
  };

  // Get user's packages (Student or Teacher)
  static getMyPackages = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const userRole = req.session.userRole;
      const { status } = req.query;

      const packageRepository = AppDataSource.getRepository(BookingPackage);
      let query = packageRepository.createQueryBuilder("package")
        .leftJoinAndSelect("package.teacher", "teacher")
        .leftJoinAndSelect("package.student", "student");

      if (userRole === "instructor") {
        query = query.where("package.teacherId = :userId", { userId });
      } else {
        query = query.where("package.studentId = :userId OR package.bookedById = :userId", { userId });
      }

      if (status) {
        query = query.andWhere("package.status = :status", { status });
      }

      const packages = await query.orderBy("package.created_at", "DESC").getMany();

      return res.json({ packages });
    } catch (error: any) {
      console.error("Error fetching packages:", error);
      return res.status(500).json({ error: "Failed to fetch packages" });
    }
  };

  // Get a specific package with its bookings
  static getPackageById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const packageId = req.params.id as string;
      const userId = req.session.userId!;

      const packageRepository = AppDataSource.getRepository(BookingPackage);
      const pkg = await packageRepository.findOne({
        where: { id: packageId },
        relations: ["teacher", "student"],
      });

      if (!pkg) {
        return res.status(404).json({ error: "Package not found" });
      }

      // Check access: must be teacher, student, or bookedBy
      if (pkg.teacherId !== userId && pkg.studentId !== userId && pkg.bookedById !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Fetch associated bookings
      const bookingRepository = AppDataSource.getRepository(Booking);
      const bookings = await bookingRepository.find({
        where: { packageId: packageId },
        relations: ["slot", "teacher"],
        order: { sessionStartTime: "ASC" },
      });

      // Recalculate completed/cancelled counts from actual booking states
      const completedCount = bookings.filter((b) => b.status === BookingStatus.COMPLETED).length;
      const cancelledCount = bookings.filter((b) => b.status === BookingStatus.CANCELLED).length;

      // Auto-update package status if needed
      if (pkg.completedSessions !== completedCount || pkg.cancelledSessions !== cancelledCount) {
        pkg.completedSessions = completedCount;
        pkg.cancelledSessions = cancelledCount;

        const remainingActive = bookings.filter(
          (b) => b.status !== BookingStatus.COMPLETED && b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.NO_SHOW
        ).length;

        if (remainingActive === 0 && completedCount > 0) {
          pkg.status = PackageStatus.COMPLETED;
        }

        await packageRepository.save(pkg);
      }

      return res.json({ package: pkg, bookings });
    } catch (error: any) {
      console.error("Error fetching package:", error);
      return res.status(500).json({ error: "Failed to fetch package" });
    }
  };

  /**
   * Sync payment status for a booking (manually refresh status)
   * POST /api/bookings/:id/sync-payment
   */
  static syncBookingPayment = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const userId = req.session.userId!;
      
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = await bookingRepo.findOne({
        where: { id, studentId: userId }
      });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (booking.status !== BookingStatus.PENDING_PAYMENT) {
        return res.json({ success: true, message: "Booking is not awaiting payment", status: booking.status });
      }

      // Check for any COMPLETED payment record for this booking reference
      const paymentRepo = AppDataSource.getRepository(Payment);
      
      // Look for individual session payments OR package payments that might include this booking
      const completedPayment = await paymentRepo.findOne({
        where: [
            { referenceId: id, paymentStatus: PaymentStatus.COMPLETED, paymentType: PaymentType.BOOKING_SESSION },
            { referenceId: String(booking.packageId), paymentStatus: PaymentStatus.COMPLETED, paymentType: PaymentType.BOOKING_PACKAGE }
        ].filter(v => v.referenceId !== "null" && v.referenceId !== "undefined")
      });

      if (completedPayment) {
        // Run fulfillment logic (idempotent)
        const paymentServiceModule = require("../services/PaymentService");
        const paymentServiceInstance = paymentServiceModule.default || new paymentServiceModule.PaymentService();
        await paymentServiceInstance.confirmPaymentSuccess(completedPayment.id);
        
        const refreshedBooking = await bookingRepo.findOne({ 
            where: { id },
            relations: ["slot", "teacher"]
        });
        
        return res.json({ 
            success: true, 
            message: "Payment discovered and applied.", 
            status: refreshedBooking?.status,
            booking: refreshedBooking
        });
      }

      // If no completed payment found, maybe there's a PENDING one we can try to verify?
      // On localhost, we can provide a special message if a PENDING one exists.
      const pendingPayment = await paymentRepo.findOne({
        where: { referenceId: id, paymentStatus: PaymentStatus.PENDING, paymentType: PaymentType.BOOKING_SESSION },
        order: { createdAt: "DESC" }
      });

      if (pendingPayment) {
          const isLocal = String(req.headers.host).includes("localhost") || process.env.NODE_ENV === "development";
          if (isLocal) {
              return res.json({
                  success: false,
                  hasPending: true,
                  message: "A pending payment record exists. Please complete the checkout process or use the 'Force Sync' feature on the success page if you are in development mode.",
                  paymentId: pendingPayment.id
              });
          }
      }

      return res.json({ 
        success: false, 
        message: "No completed payment found for this booking. If you just finished paying, please wait a few seconds and try again.",
        status: booking.status
      });

    } catch (error: any) {
      console.error("Sync booking payment error:", error);
      return res.status(500).json({ error: "Failed to sync payment status." });
    }
  };

  /**
   * Remove a specific session from a package before payment
   * POST /api/bookings/packages/:id/remove-session/:bookingId
   */
  static removeSessionFromPackage = async (req: Request, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const packageId = String(req.params.id);
      const { bookingId } = req.params;
      const userId = req.session.userId!;

      const packageRepo = queryRunner.manager.getRepository(BookingPackage);
      const pkg = await packageRepo.findOne({
        where: { id: packageId },
        relations: ["bookings", "bookings.slot"]
      });

      if (!pkg) {
        return res.status(404).json({ error: "Package not found" });
      }

      // Check access
      if (pkg.studentId !== userId && pkg.bookedById !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (pkg.status !== PackageStatus.ACTIVE) {
        return res.status(400).json({ error: "Cannot modify a package that is not active" });
      }

      // Find the booking to remove
      const bookingToRemove = pkg.bookings.find(b => b.id === bookingId);
      if (!bookingToRemove) {
        return res.status(404).json({ error: "Booking not found in this package" });
      }

      if (bookingToRemove.status !== BookingStatus.PENDING_PAYMENT) {
        return res.status(400).json({ error: "Can only remove sessions that are awaiting payment" });
      }

      if (pkg.bookings.filter(b => b.status !== BookingStatus.CANCELLED).length <= 1) {
        return res.status(400).json({ error: "A package must have at least 1 session. To remove the last session, please cancel the entire booking process." });
      }

      // 1. "Cancel" the booking
      bookingToRemove.status = BookingStatus.CANCELLED;
      bookingToRemove.cancellationReason = "Removed from package during checkout";
      bookingToRemove.cancelledById = userId;
      bookingToRemove.cancelledAt = new Date();
      await queryRunner.manager.save(Booking, bookingToRemove);

      // 2. Free up the slot
      const slot = bookingToRemove.slot;
      if (slot) {
          slot.currentBookings = Math.max(0, slot.currentBookings - 1);
          if (slot.status === SlotStatus.BOOKED && slot.currentBookings < slot.maxBookings) {
              slot.status = SlotStatus.AVAILABLE;
          }
          await queryRunner.manager.save(AvailabilitySlot, slot);
      }

      // 3. Recalculate Package
      const remainingBookings = pkg.bookings.filter(b => b.id !== bookingId && b.status !== BookingStatus.CANCELLED);
      
      const originalTotalPrice = remainingBookings.reduce((sum, b) => {
          const basePrice = b.slot?.price || 0;
          const discountPercent = b.slot?.discountPercentage || 0;
          const slotEffectivePrice = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
          return sum + slotEffectivePrice;
      }, 0);

      const newCount = remainingBookings.length;
      const newDiscountPercentage = newCount >= 5 ? 10 : newCount >= 3 ? 5 : 0;
      const newFinalPrice = Math.round(originalTotalPrice * (1 - newDiscountPercentage / 100) * 100) / 100;

      pkg.totalSessions = newCount;
      pkg.totalPrice = originalTotalPrice;
      pkg.discountPercentage = newDiscountPercentage;
      pkg.finalPrice = newFinalPrice;

      // Update individual booking amounts if discount changed
      const newPricePerSession = Math.round((newFinalPrice / newCount) * 100) / 100;
      for (const b of remainingBookings) {
          b.status = BookingStatus.PENDING_PAYMENT; // Ensure it's still pending_payment
          b.amount = newPricePerSession;
          await queryRunner.manager.save(Booking, b);
      }

      await queryRunner.manager.save(BookingPackage, pkg);

      await queryRunner.commitTransaction();

      return res.json({
        message: "Session removed from package",
        package: pkg,
        remainingBookings
      });

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Remove session error:", error);
      return res.status(500).json({ error: "Failed to remove session from package" });
    } finally {
      await queryRunner.release();
    }
  };
}
