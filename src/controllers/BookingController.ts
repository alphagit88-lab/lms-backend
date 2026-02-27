import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Booking, BookingStatus } from "../entities/Booking";
import { BookingPackage, PackageStatus } from "../entities/BookingPackage";
import { AvailabilitySlot, SlotStatus } from "../entities/AvailabilitySlot";
import { StudentParent, LinkStatus } from "../entities/StudentParent";
import { TeacherProfile } from "../entities/TeacherProfile";
import { Payment, PaymentStatus } from "../entities/Payment";
import { User } from "../entities/User";
import { Session, SessionType, SessionStatus } from "../entities/Session";
import { QueryRunner } from "typeorm";
import ZoomService from "../services/ZoomService";
import { parsePagination, createPaginationMeta } from "../utils/pagination";
import { Logger } from "../utils/logger";

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
   * Helper to create a Zoom meeting and Session record for a confirmed booking
   */
  private static createZoomMeetingForBooking = async (
    booking: Booking,
    teacherName: string,
    queryRunner?: QueryRunner
  ): Promise<void> => {
    try {
      const duration = Math.round(
        (booking.sessionEndTime.getTime() - booking.sessionStartTime.getTime()) / (1000 * 60)
      );

      const zoomResponse = await ZoomService.createMeeting({
        topic: `${teacherName} - ${booking.notes || 'Tutoring Session'}`,
        startTime: booking.sessionStartTime,
        duration: duration,
      });

      // Update booking with Zoom details
      booking.meetingLink = zoomResponse.joinUrl;
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
          meetingId: zoomResponse.meetingId,
          meetingPassword: zoomResponse.password,
        });
        await sessionRepo.save(session);
      }

      Logger.info(`Created Zoom meeting and session for booking ${booking.id}`);
    } catch (error) {
      Logger.error(`Failed to create Zoom meeting for booking ${booking.id}`, error);
      // We don't throw here to ensure the booking confirmation itself isn't rolled back
      // if Zoom API is down, but we record the failure.
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
      // Story 2.7: Set PENDING_PAYMENT with a 10-minute expiry for paid slots
      const isPaid = slot.price && Number(slot.price) > 0;
      const finalStatus = shouldAutoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
      const initialStatus = isPaid ? BookingStatus.PENDING_PAYMENT : finalStatus;

      const paymentExpiresAt = isPaid ? new Date(Date.now() + 10 * 60 * 1000) : undefined;

      const booking = queryRunner.manager.create(Booking, {
        slotId,
        studentId: actualStudentId,
        teacherId: slot.teacherId,
        bookedById,
        sessionStartTime: slot.startTime,
        sessionEndTime: slot.endTime,
        notes,
        amount: slot.price,
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

  // Get teacher's bookings
  static getTeacherBookings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.session.userId!;
      const { status, date } = req.query;

      const bookingRepository = AppDataSource.getRepository(Booking);
      let query = bookingRepository.createQueryBuilder("booking")
        .leftJoinAndSelect("booking.slot", "slot")
        .leftJoinAndSelect("booking.student", "student")
        .where("booking.teacherId = :teacherId", { teacherId });

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

  // Confirm booking (Teacher only)
  static confirmBooking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const teacherId = req.session.userId!;
      const { meetingLink } = req.body;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({
        where: { id, teacherId },
        relations: ["teacher"]
      });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (booking.status !== BookingStatus.PENDING) {
        return res.status(400).json({ error: "Only pending bookings can be confirmed" });
      }

      booking.status = BookingStatus.CONFIRMED;
      if (meetingLink) {
        booking.meetingLink = meetingLink;
        await bookingRepository.save(booking);
      } else {
        // Automatically create Zoom meeting if no link provided
        const teacherName = booking.teacher ? `${booking.teacher.firstName} ${booking.teacher.lastName}` : "Teacher";
        await BookingController.createZoomMeetingForBooking(booking, teacherName);
      }

      return res.json({ message: "Booking confirmed successfully", booking });
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
      const cancelledByTeacher = userId === booking.teacherId;

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

  // Mark booking as completed (Teacher only)
  static completeBooking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const teacherId = req.session.userId!;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({ where: { id, teacherId } });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      booking.status = BookingStatus.COMPLETED;
      await bookingRepository.save(booking);

      return res.json({ message: "Booking marked as completed", booking });
    } catch (error: any) {
      console.error("Error completing booking:", error);
      return res.status(500).json({ error: "Failed to complete booking" });
    }
  };

  // Mark booking as no-show (Teacher only)
  static markNoShow = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const teacherId = req.session.userId!;

      const bookingRepository = AppDataSource.getRepository(Booking);
      const booking = await bookingRepository.findOne({ where: { id, teacherId } });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      booking.status = BookingStatus.NO_SHOW;
      await bookingRepository.save(booking);

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

      // Verify all slots belong to the same teacher
      const teacherIds = new Set(slots.map((s) => s.teacherId));
      if (teacherIds.size > 1) {
        await queryRunner.rollbackTransaction();
        return res.status(400).json({ error: "All slots in a package must belong to the same teacher" });
      }

      const teacherId = slots[0].teacherId;

      // Check auto-confirm
      const teacherProfile = await queryRunner.manager.findOne(TeacherProfile, {
        where: { teacherId },
      });
      const shouldAutoConfirm = teacherProfile?.autoConfirmBookings === true;

      // Calculate pricing
      const totalPrice = slots.reduce((sum, slot) => sum + (slot.price ? Number(slot.price) : 0), 0);
      // Package discount: 5% for 3-4 sessions, 10% for 5+
      const discountPercentage = slots.length >= 5 ? 10 : slots.length >= 3 ? 5 : 0;
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
          teacherId,
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
        where: { packageId },
        relations: ["slot"],
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
}
