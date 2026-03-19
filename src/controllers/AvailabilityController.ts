import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { In } from "typeorm";
import { AvailabilitySlot, SlotStatus } from "../entities/AvailabilitySlot";
import { Booking, BookingStatus } from "../entities/Booking";
import { TeacherAssistant } from "../entities/TeacherAssistant";
import { User } from "../entities/User";
import { NotificationService } from "../services/NotificationService";
import { refundService } from "../services/RefundService";

export class AvailabilityController {
  /**
   * Helper to check if a user is authorized to manage a teacher's schedule.
   * Authorized users: The teacher themselves, or an assigned assistant with the correct permission.
   */
  private static checkAuthorization = async (
    userId: string,
    teacherId: string,
    permission: "slots" | "bookings" = "slots"
  ): Promise<boolean> => {
    if (userId === teacherId) return true;

    const assistantRepo = AppDataSource.getRepository(TeacherAssistant);
    const assistant = await assistantRepo.findOne({
      where: { teacherId, assistantId: userId },
    });

    if (!assistant) return false;

    return permission === "slots" ? assistant.canManageSlots : assistant.canManageBookings;
  };

  // Create a new availability slot (Teacher or Assistant)
  static createSlot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { startTime, endTime, isRecurring, dayOfWeek, recurrenceEndDate, price, notes, maxBookings, targetTeacherId } = req.body;
      const currentUserId = req.session.userId!;

      // Determine who we are creating this slot for
      const teacherId = targetTeacherId || currentUserId;

      // Authorization Check
      if (!(await AvailabilityController.checkAuthorization(currentUserId, teacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to manage availability for this teacher" });
      }

      // Validation
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "Start time and end time are required" });
      }

      const start = new Date(startTime);
      const end = new Date(endTime);

      if (start >= end) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for overlapping slots
      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const overlapping = await slotRepository.createQueryBuilder("slot")
        .where("slot.teacher_id = :teacherId", { teacherId })
        .andWhere("slot.start_time < :end", { end })
        .andWhere("slot.end_time > :start", { start })
        .andWhere("slot.status != :blocked", { blocked: SlotStatus.BLOCKED })
        .getOne();

      if (overlapping) {
        return res.status(409).json({ error: "Time slot overlaps with existing availability" });
      }

      const slot = slotRepository.create({
        teacherId,
        startTime: start,
        endTime: end,
        isRecurring: isRecurring || false,
        dayOfWeek,
        recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
        price,
        notes,
        maxBookings: maxBookings || 1,
      });

      await slotRepository.save(slot);

      return res.status(201).json({ message: "Availability slot created successfully", slot });
    } catch (error: any) {
      console.error("Error creating availability slot:", error);
      return res.status(500).json({ error: "Failed to create availability slot" });
    }
  };

  // Get teacher's own slots (or slots managed as an assistant)
  static getMySlots = async (req: Request, res: Response): Promise<Response> => {
    try {
      const currentUserId = req.session.userId!;
      const { teacherId, startDate, endDate, status } = req.query;

      // If viewing someone else's slots, must be an assistant
      const targetTeacherId = (teacherId as string) || currentUserId;

      if (!(await AvailabilityController.checkAuthorization(currentUserId, targetTeacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to view availability for this teacher" });
      }

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      let query = slotRepository.createQueryBuilder("slot")
        .leftJoinAndSelect("slot.bookings", "booking")
        .where("slot.teacher_id = :targetTeacherId", { targetTeacherId });

      if (startDate) {
        query = query.andWhere("slot.start_time >= :startDate", { startDate });
      }

      if (endDate) {
        query = query.andWhere("slot.end_time <= :endDate", { endDate });
      }

      if (status) {
        query = query.andWhere("slot.status = :status", { status });
      }

      const slots = await query.orderBy("slot.start_time", "ASC").getMany();

      return res.json({ slots });
    } catch (error: any) {
      console.error("Error fetching availability slots:", error);
      return res.status(500).json({ error: "Failed to fetch availability slots" });
    }
  };

  // Get teacher's available slots (Public - for students)
  static getTeacherSlots = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { teacherId } = req.params;
      const { startDate, endDate } = req.query;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      let query = slotRepository.createQueryBuilder("slot")
        .where("slot.teacher_id = :teacherId", { teacherId })
        .andWhere("slot.status = :status", { status: SlotStatus.AVAILABLE });

      if (startDate) {
        query = query.andWhere("slot.start_time >= :startDate", { startDate });
      }

      if (endDate) {
        query = query.andWhere("slot.end_time <= :endDate", { endDate });
      }

      // When no date range is provided, default to upcoming/ongoing slots only
      if (!startDate && !endDate) {
        query = query.andWhere("slot.end_time >= :now", { now: new Date() });
      }

      const slots = await query.orderBy("slot.start_time", "ASC").getMany();

      return res.json({ slots });
    } catch (error: any) {
      console.error("Error fetching teacher slots:", error);
      return res.status(500).json({ error: "Failed to fetch teacher slots" });
    }
  };

  // Update availability slot
  static updateSlot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const currentUserId = req.session.userId!;
      const { startTime, endTime, price, maxBookings, notes, status, isRecurring, recurrenceEndDate } = req.body;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
      }

      // Authorization Check
      if (!(await AvailabilityController.checkAuthorization(currentUserId, slot.teacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to manage availability for this teacher" });
      }

      // Check if slot has bookings before updating
      const bookingRepository = AppDataSource.getRepository(Booking);
      const bookingCount = await bookingRepository.count({ where: { slotId: id } });

      const isPastSlot = slot.endTime < new Date();

      if (bookingCount > 0 && (startTime || endTime) && !isPastSlot) {
        return res.status(400).json({ error: "Cannot modify time of slot with existing bookings" });
      }

      if (startTime) slot.startTime = new Date(startTime);
      if (endTime) slot.endTime = new Date(endTime);
      if (price !== undefined) slot.price = price;
      if (maxBookings !== undefined) {
          const newMax = parseInt(maxBookings as string);
          if (newMax < bookingCount) {
              return res.status(400).json({ error: `Cannot reduce student capacity below current bookings (${bookingCount})` });
          }
          slot.maxBookings = newMax;
      }
      if (notes !== undefined) slot.notes = notes;
      if (status) slot.status = status;

      // Handle making a single slot recurring via Edit
      if (isRecurring === true && recurrenceEndDate) {
        const endDateParsed = new Date(recurrenceEndDate);
        if (!isNaN(endDateParsed.getTime())) {
          endDateParsed.setHours(23, 59, 59, 999);
          
          slot.isRecurring = true;
          slot.recurrenceEndDate = endDateParsed;
          
          // Determine day of week from current slot time
          const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayOfWeekAttr = weekdays[slot.startTime.getDay()];
          slot.dayOfWeek = dayOfWeekAttr;

          // Generate FUTURE slots based on this pattern
          // We start from 7 days after the updated slot's time
          const nextWeekStart = new Date(slot.startTime);
          nextWeekStart.setDate(nextWeekStart.getDate() + 7);
          nextWeekStart.setHours(0, 0, 0, 0);

          const timeFormat = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

          await AvailabilityController.generateRecurringSlotsInternal({
            teacherId: slot.teacherId,
            dayOfWeek: dayOfWeekAttr,
            startTime: timeFormat(slot.startTime),
            endTime: timeFormat(slot.endTime),
            startFromDate: nextWeekStart,
            endDateParsed: endDateParsed,
            price: slot.price,
            maxBookings: slot.maxBookings,
            notes: slot.notes
          });
        }
      }

      await slotRepository.save(slot);

      return res.json({ message: "Availability slot updated successfully", slot });
    } catch (error: any) {
      console.error("Error updating availability slot:", error);
      return res.status(500).json({ error: "Failed to update availability slot" });
    }
  };

  // Delete availability slot
  static deleteSlot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const currentUserId = req.session.userId!;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
      }

      // Authorization Check
      if (!(await AvailabilityController.checkAuthorization(currentUserId, slot.teacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to manage availability for this teacher" });
      }

      const bookingRepository = AppDataSource.getRepository(Booking);

      // Cancel all bookings (confirmed and pending) before deletion
      const allBookings = await bookingRepository.find({
        where: { slotId: id },
        relations: ["student", "teacher"]
      });
      
      if (allBookings.length > 0) {
        const userRepo = AppDataSource.getRepository(User);
        const canceller = await userRepo.findOne({ where: { id: currentUserId } });

        for (const booking of allBookings) {
          const originalStatus = booking.status;
          booking.status = BookingStatus.CANCELLED;
          booking.cancelledAt = new Date();
          booking.cancelledById = currentUserId;
          booking.cancellationReason = "Availability slot deleted by instructor/assistant.";
          
          // Trigger refund if the booking was paid (CONFIRMED or PENDING with paymentId)
          if (booking.paymentId && (originalStatus === BookingStatus.CONFIRMED || originalStatus === BookingStatus.PENDING)) {
            try {
              await refundService.processRefund({
                paymentId: booking.paymentId,
                requestedByUserId: currentUserId,
                requestedByRole: req.session.userRole!,
                reason: "Slot deleted by instructor.",
                refundPercentage: 100 // Teacher-initiated cancellation always 100%
              });
            } catch (refundError) {
              console.error(`Failed to process refund for booking ${booking.id}:`, refundError);
            }
          }

          // Notify student
          if (booking.student && booking.teacher && canceller) {
            void NotificationService.notifyBookingCancelled(booking, booking.student, booking.teacher, canceller);
          }
        }
        await bookingRepository.save(allBookings);
      }

      await slotRepository.remove(slot);

      return res.json({
        message: "Availability slot deleted successfully",
        cancelledBookings: allBookings.length,
      });
    } catch (error: any) {
      console.error("Error deleting availability slot:", error);
      return res.status(500).json({ error: "Failed to delete availability slot" });
    }
  };

  // Block a specific slot
  static blockSlot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const currentUserId = req.session.userId!;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
      }

      // Authorization Check
      if (!(await AvailabilityController.checkAuthorization(currentUserId, slot.teacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to manage availability for this teacher" });
      }

      if (slot.status === SlotStatus.BLOCKED) {
        return res.status(400).json({ error: "Slot is already blocked" });
      }

      const bookingRepository = AppDataSource.getRepository(Booking);

      // Cancel and refund all bookings (confirmed and pending) when blocking
      const allBookings = await bookingRepository.find({
        where: { slotId: id },
        relations: ["student", "teacher"]
      });
      
      let affectedCount = 0;
      if (allBookings.length > 0) {
        const userRepo = AppDataSource.getRepository(User);
        const canceller = await userRepo.findOne({ where: { id: currentUserId } });

        for (const booking of allBookings) {
          if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.COMPLETED) continue;
          
          affectedCount++;
          const originalStatus = booking.status;
          booking.status = BookingStatus.CANCELLED;
          booking.cancelledAt = new Date();
          booking.cancelledById = currentUserId;
          booking.cancellationReason = "Availability slot blocked by instructor/assistant.";
          
          // Trigger refund if paid
          if (booking.paymentId && (originalStatus === BookingStatus.CONFIRMED || originalStatus === BookingStatus.PENDING)) {
            try {
              await refundService.processRefund({
                paymentId: booking.paymentId,
                requestedByUserId: currentUserId,
                requestedByRole: req.session.userRole!,
                reason: "Slot blocked by instructor.",
                refundPercentage: 100
              });
            } catch (refundError) {
              console.error(`Failed to process refund for booking ${booking.id}:`, refundError);
            }
          }

          // Notify student
          if (booking.student && booking.teacher && canceller) {
            void NotificationService.notifyBookingCancelled(booking, booking.student, booking.teacher, canceller);
          }
        }
        await bookingRepository.save(allBookings);
      }

      slot.status = SlotStatus.BLOCKED;
      await slotRepository.save(slot);

      return res.json({
        message: affectedCount > 0
          ? `Slot blocked. ${affectedCount} booking(s) cancelled and refunded.`
          : "Slot blocked successfully",
        slot,
        affectedBookings: affectedCount,
      });
    } catch (error: any) {
      console.error("Error blocking slot:", error);
      return res.status(500).json({ error: "Failed to block slot" });
    }
  };

  // Unblock a blocked slot
  static unblockSlot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const currentUserId = req.session.userId!;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
      }

      // Authorization Check
      if (!(await AvailabilityController.checkAuthorization(currentUserId, slot.teacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to manage availability for this teacher" });
      }

      if (slot.status !== SlotStatus.BLOCKED) {
        return res.status(400).json({ error: "Only blocked slots can be unblocked" });
      }

      // If slot is in the past, don't allow unblocking
      if (slot.endTime < new Date()) {
        return res.status(400).json({ error: "Cannot unblock a slot in the past" });
      }

      slot.status = SlotStatus.AVAILABLE;
      await slotRepository.save(slot);

      return res.json({ message: "Slot unblocked successfully", slot });
    } catch (error: any) {
      console.error("Error unblocking slot:", error);
      return res.status(500).json({ error: "Failed to unblock slot" });
    }
  };

  // Cancel (delete) all future unbooked recurring slots for a given pattern
  static cancelFutureRecurring = async (req: Request, res: Response): Promise<Response> => {
    try {
      const currentUserId = req.session.userId!;
      const { teacherId, dayOfWeek, startTime, endTime } = req.body;

      const targetTeacherId = teacherId || currentUserId;

      // Authorization Check
      if (!(await AvailabilityController.checkAuthorization(currentUserId, targetTeacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to manage availability for this teacher" });
      }

      if (!dayOfWeek) {
        return res.status(400).json({ error: "dayOfWeek is required" });
      }

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const bookingRepository = AppDataSource.getRepository(Booking);

      // Find all future recurring slots matching the pattern
      const now = new Date();
      let query = slotRepository.createQueryBuilder("slot")
        .where("slot.teacher_id = :targetTeacherId", { targetTeacherId })
        .andWhere("slot.is_recurring = true")
        .andWhere("LOWER(slot.day_of_week) = :dayOfWeek", { dayOfWeek: dayOfWeek.toLowerCase() })
        .andWhere("slot.start_time > :now", { now });

      // Optionally narrow by time-of-day pattern
      if (startTime) {
        query = query.andWhere("CAST(slot.start_time AS time) = :startTime", { startTime });
      }

      const candidateSlots = await query.orderBy("slot.start_time", "ASC").getMany();

      if (candidateSlots.length === 0) {
        return res.status(404).json({ error: "No matching future recurring slots found" });
      }

      // Separate into deletable (no confirmed bookings) and protected
      const deletable: AvailabilitySlot[] = [];
      const protected_: { id: string; date: string; bookings: number }[] = [];

      for (const slot of candidateSlots) {
        const confirmedCount = await bookingRepository.count({
          where: { slotId: slot.id, status: BookingStatus.CONFIRMED },
        });

        if (confirmedCount > 0) {
          protected_.push({
            id: slot.id,
            date: slot.startTime.toISOString().split('T')[0],
            bookings: confirmedCount,
          });
        } else {
          deletable.push(slot);
        }
      }

      if (deletable.length === 0) {
        return res.status(400).json({
          error: "All matching slots have confirmed bookings and cannot be deleted",
          protectedSlots: protected_,
        });
      }

      if (deletable.length > 0) {
        const deletableIds = deletable.map(s => s.id);
        const allBookings = await bookingRepository.find({
          where: { slotId: In(deletableIds) },
          relations: ["student", "teacher"]
        });

        if (allBookings.length > 0) {
          const userRepo = AppDataSource.getRepository(User);
          const canceller = await userRepo.findOne({ where: { id: currentUserId } });

          for (const booking of allBookings) {
            const originalStatus = booking.status;
            booking.status = BookingStatus.CANCELLED;
            booking.cancelledAt = new Date();
            booking.cancelledById = currentUserId;
            booking.cancellationReason = "Future recurring slots cancelled by instructor/assistant.";

            // Trigger refund if paid
            if (booking.paymentId && (originalStatus === BookingStatus.CONFIRMED || originalStatus === BookingStatus.PENDING)) {
              try {
                await refundService.processRefund({
                  paymentId: booking.paymentId,
                  requestedByUserId: currentUserId,
                  requestedByRole: req.session.userRole!,
                  reason: "Recurring slot cancelled by instructor.",
                  refundPercentage: 100
                });
              } catch (refundError) {
                console.error(`Failed to process refund for booking ${booking.id}:`, refundError);
              }
            }

            // Notify student
            if (booking.student && booking.teacher && canceller) {
              void NotificationService.notifyBookingCancelled(booking, booking.student, booking.teacher, canceller);
            }
          }
          await bookingRepository.save(allBookings);
        }

        await slotRepository.remove(deletable);
      }

      return res.json({
        message: `${deletable.length} recurring slot(s) cancelled`,
        deletedCount: deletable.length,
        protectedSlots: protected_,
      });
    } catch (error: any) {
      console.error("Error cancelling future recurring slots:", error);
      return res.status(500).json({ error: "Failed to cancel recurring slots" });
    }
  };

  // Private helper to generate recurring slots
  private static generateRecurringSlotsInternal = async (params: {
    teacherId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    startFromDate: Date;
    endDateParsed: Date;
    price?: number;
    maxBookings?: number;
    notes?: string;
  }): Promise<{ createdSlots: AvailabilitySlot[]; skippedDates: string[] }> => {
    const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    // Find the first occurrence of the given day on/after startFromDate
    const dayIndex = validDays.indexOf(params.dayOfWeek.toLowerCase());
    const jsDayIndex = dayIndex === 6 ? 0 : dayIndex + 1;

    let currentDate = new Date(params.startFromDate);
    const currentJsDay = currentDate.getDay();
    let daysUntilTarget = jsDayIndex - currentJsDay;
    if (daysUntilTarget < 0) daysUntilTarget += 7;
    
    // Safety check for same-day start
    if (daysUntilTarget === 0) {
      const now = new Date();
      const [startH, startM] = params.startTime.split(':').map(Number);
      const isToday = params.startFromDate.toDateString() === now.toDateString();
      if (isToday && (now.getHours() > startH || (now.getHours() === startH && now.getMinutes() >= startM))) {
        daysUntilTarget = 7;
      }
    }
    
    currentDate.setDate(currentDate.getDate() + daysUntilTarget);

    const createdSlots: AvailabilitySlot[] = [];
    const skippedDates: string[] = [];

    while (currentDate <= params.endDateParsed) {
      const [startH, startM] = params.startTime.split(':').map(Number);
      const [endH, endM] = params.endTime.split(':').map(Number);

      const slotStart = new Date(currentDate);
      slotStart.setHours(startH, startM, 0, 0);

      const slotEnd = new Date(currentDate);
      slotEnd.setHours(endH, endM, 0, 0);

      // Check for overlap
      const overlapping = await slotRepository.createQueryBuilder("slot")
        .where("slot.teacher_id = :teacherId", { teacherId: params.teacherId })
        .andWhere("slot.start_time < :end", { end: slotEnd })
        .andWhere("slot.end_time > :start", { start: slotStart })
        .andWhere("slot.status != :blocked", { blocked: SlotStatus.BLOCKED })
        .getOne();

      if (overlapping) {
        skippedDates.push(currentDate.toISOString().split('T')[0]);
      } else {
        const newSlot = slotRepository.create({
          teacherId: params.teacherId,
          startTime: slotStart,
          endTime: slotEnd,
          isRecurring: true,
          dayOfWeek: params.dayOfWeek.toLowerCase(),
          recurrenceEndDate: params.endDateParsed,
          price: params.price,
          maxBookings: params.maxBookings || 1,
          notes: params.notes,
          status: SlotStatus.AVAILABLE,
        });
        createdSlots.push(newSlot);
      }
      currentDate.setDate(currentDate.getDate() + 7);
    }

    if (createdSlots.length > 0) {
      await slotRepository.save(createdSlots);
    }

    return { createdSlots, skippedDates };
  };

  // Create recurring availability slots (Teacher or Assistant)
  static createRecurringSlots = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { dayOfWeek, startTime, endTime, startDate, recurrenceEndDate, price, maxBookings, notes, targetTeacherId } = req.body;
      const currentUserId = req.session.userId!;
      const teacherId = targetTeacherId || currentUserId;

      // Authorization Check
      if (!(await AvailabilityController.checkAuthorization(currentUserId, teacherId, "slots"))) {
        return res.status(403).json({ error: "You are not authorized to manage availability for this teacher" });
      }

      // ── Validation ──────────────────────────────────────────────
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (!dayOfWeek || !validDays.includes(dayOfWeek.toLowerCase())) {
        return res.status(400).json({ error: `dayOfWeek is required and must be one of: ${validDays.join(', ')}` });
      }
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "startTime (HH:mm) and endTime (HH:mm) are required" });
      }
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res.status(400).json({ error: "startTime and endTime must be in HH:mm format" });
      }
      if (startTime >= endTime) {
        return res.status(400).json({ error: "endTime must be after startTime" });
      }
      if (!recurrenceEndDate) {
        return res.status(400).json({ error: "recurrenceEndDate is required" });
      }
      const endDateParsed = new Date(recurrenceEndDate);
      if (isNaN(endDateParsed.getTime())) {
        return res.status(400).json({ error: "recurrenceEndDate must be a valid date (YYYY-MM-DD)" });
      }
      endDateParsed.setHours(23, 59, 59, 999);

      // ── Determine start date (defaults to today; can be in the past) ─
      const startFromDate = startDate ? new Date(startDate) : new Date();
      startFromDate.setHours(0, 0, 0, 0);

      if (endDateParsed < startFromDate) {
        return res.status(400).json({ error: "recurrenceEndDate must be on or after the start date" });
      }

      const result = await AvailabilityController.generateRecurringSlotsInternal({
        teacherId,
        dayOfWeek,
        startTime,
        endTime,
        startFromDate,
        endDateParsed,
        price,
        maxBookings,
        notes
      });

      if (result.createdSlots.length === 0) {
        return res.status(409).json({
          error: "No slots could be created — all dates overlap with existing availability",
          skippedDates: result.skippedDates,
        });
      }

      return res.status(201).json({
        message: "Recurring slots created successfully",
        slots: result.createdSlots,
        count: result.createdSlots.length,
        skippedDates: result.skippedDates,
      });
    } catch (error: any) {
      console.error("Error creating recurring slots:", error);
      return res.status(500).json({ error: "Failed to create recurring slots" });
    }
  };

  // Get weekly availability view
  static getWeeklyAvailability = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { teacherId } = req.params;
      const { startDate } = req.query;

      const start = startDate ? new Date(startDate as string) : new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slots = await slotRepository.createQueryBuilder("slot")
        .leftJoinAndSelect("slot.bookings", "booking")
        .where("slot.teacher_id = :teacherId", { teacherId })
        .andWhere("slot.start_time >= :start", { start })
        .andWhere("slot.start_time < :end", { end })
        .orderBy("slot.start_time", "ASC")
        .getMany();

      return res.json({ slots, startDate: start, endDate: end });
    } catch (error: any) {
      console.error("Error fetching weekly availability:", error);
      return res.status(500).json({ error: "Failed to fetch weekly availability" });
    }
  };
}
