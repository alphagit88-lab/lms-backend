import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { AvailabilitySlot, SlotStatus } from "../entities/AvailabilitySlot";
import { Booking, BookingStatus } from "../entities/Booking";

export class AvailabilityController {
  // Create a new availability slot (Teacher only)
  static createSlot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { startTime, endTime, isRecurring, dayOfWeek, recurrenceEndDate, price, notes, maxBookings } = req.body;
      const teacherId = req.session.userId!;

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

  // Get teacher's own slots
  static getMySlots = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.session.userId!;
      const { startDate, endDate, status } = req.query;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      let query = slotRepository.createQueryBuilder("slot")
        .leftJoinAndSelect("slot.bookings", "booking")
        .where("slot.teacher_id = :teacherId", { teacherId });

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
        .andWhere("slot.status = :status", { status: SlotStatus.AVAILABLE })
        .andWhere("slot.start_time > :now", { now: new Date() });

      if (startDate) {
        query = query.andWhere("slot.start_time >= :startDate", { startDate });
      }

      if (endDate) {
        query = query.andWhere("slot.end_time <= :endDate", { endDate });
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
      const teacherId = req.session.userId!;
      const { startTime, endTime, price, notes, status } = req.body;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id, teacherId } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
      }

      // Check if slot has bookings before updating
      const bookingRepository = AppDataSource.getRepository(Booking);
      const bookingCount = await bookingRepository.count({ where: { slotId: id } });

      if (bookingCount > 0 && (startTime || endTime)) {
        return res.status(400).json({ error: "Cannot modify time of slot with existing bookings" });
      }

      if (startTime) slot.startTime = new Date(startTime);
      if (endTime) slot.endTime = new Date(endTime);
      if (price !== undefined) slot.price = price;
      if (notes !== undefined) slot.notes = notes;
      if (status) slot.status = status;

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
      const teacherId = req.session.userId!;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id, teacherId } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
      }

      // Check if slot has active bookings
      const bookingRepository = AppDataSource.getRepository(Booking);
      const activeBookings = await bookingRepository.count({
        where: { slotId: id, status: BookingStatus.CONFIRMED },
      });

      if (activeBookings > 0) {
        return res.status(400).json({ error: "Cannot delete slot with active bookings" });
      }

      // Cancel any pending bookings before deletion
      const pendingBookings = await bookingRepository.find({
        where: { slotId: id, status: BookingStatus.PENDING },
      });
      if (pendingBookings.length > 0) {
        for (const booking of pendingBookings) {
          booking.status = BookingStatus.CANCELLED;
        }
        await bookingRepository.save(pendingBookings);
      }

      await slotRepository.remove(slot);

      // TODO: (Epic 6) Notify affected students when slot is deleted
      // TODO: (Epic 2) Trigger refund for any paid pending bookings

      return res.json({
        message: "Availability slot deleted successfully",
        cancelledBookings: pendingBookings.length,
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
      const teacherId = req.session.userId!;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id, teacherId } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
      }

      if (slot.status === SlotStatus.BLOCKED) {
        return res.status(400).json({ error: "Slot is already blocked" });
      }

      // Check for confirmed bookings — warn but still allow blocking
      const bookingRepository = AppDataSource.getRepository(Booking);
      const confirmedBookings = await bookingRepository.count({
        where: { slotId: id, status: BookingStatus.CONFIRMED },
      });

      slot.status = SlotStatus.BLOCKED;
      await slotRepository.save(slot);

      // TODO: (Epic 6) Notify affected students when slot is blocked
      // TODO: (Epic 2) Trigger refund for confirmed bookings when slot is blocked

      return res.json({
        message: confirmedBookings > 0
          ? `Slot blocked. ${confirmedBookings} confirmed booking(s) affected — students should be notified.`
          : "Slot blocked successfully",
        slot,
        affectedBookings: confirmedBookings,
      });
    } catch (error: any) {
      console.error("Error blocking slot:", error);
      return res.status(500).json({ error: "Failed to block slot" });
    }
  };

  // Unblock a blocked slot (restore to available)
  static unblockSlot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const teacherId = req.session.userId!;

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const slot = await slotRepository.findOne({ where: { id, teacherId } });

      if (!slot) {
        return res.status(404).json({ error: "Availability slot not found" });
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
      const teacherId = req.session.userId!;
      const { dayOfWeek, startTime, endTime } = req.body;

      if (!dayOfWeek) {
        return res.status(400).json({ error: "dayOfWeek is required" });
      }

      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const bookingRepository = AppDataSource.getRepository(Booking);

      // Find all future recurring slots matching the pattern
      const now = new Date();
      let query = slotRepository.createQueryBuilder("slot")
        .where("slot.teacher_id = :teacherId", { teacherId })
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

      await slotRepository.remove(deletable);

      // TODO: (Epic 6) Notify students about cancelled recurring slots

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

  // Create recurring availability slots (Teacher only)
  static createRecurringSlots = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { dayOfWeek, startTime, endTime, recurrenceEndDate, price, maxBookings, notes } = req.body;
      const teacherId = req.session.userId!;

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
      if (endDateParsed < new Date()) {
        return res.status(400).json({ error: "recurrenceEndDate must be in the future" });
      }

      // ── Find the next occurrence of the given day of week ──────
      const dayIndex = validDays.indexOf(dayOfWeek.toLowerCase());
      // JS: 0=Sunday,1=Monday,...6=Saturday → map our index (0=Monday..6=Sunday) to JS day
      const jsDayIndex = dayIndex === 6 ? 0 : dayIndex + 1;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let currentDate = new Date(today);
      const currentJsDay = currentDate.getDay();
      let daysUntilTarget = jsDayIndex - currentJsDay;
      if (daysUntilTarget < 0) daysUntilTarget += 7;
      if (daysUntilTarget === 0) {
        // If today is the target day, check if the time has already passed
        const [startH, startM] = startTime.split(':').map(Number);
        const nowTime = new Date();
        if (nowTime.getHours() > startH || (nowTime.getHours() === startH && nowTime.getMinutes() >= startM)) {
          daysUntilTarget = 7; // skip to next week
        }
      }
      currentDate.setDate(currentDate.getDate() + daysUntilTarget);

      // ── Generate slots week by week ───────────────────────────
      const slotRepository = AppDataSource.getRepository(AvailabilitySlot);
      const createdSlots: AvailabilitySlot[] = [];
      const skippedDates: string[] = [];

      while (currentDate <= endDateParsed) {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        const slotStart = new Date(currentDate);
        slotStart.setHours(startH, startM, 0, 0);

        const slotEnd = new Date(currentDate);
        slotEnd.setHours(endH, endM, 0, 0);

        // Check for overlap with existing slots on this specific date
        const overlapping = await slotRepository.createQueryBuilder("slot")
          .where("slot.teacher_id = :teacherId", { teacherId })
          .andWhere("slot.start_time < :end", { end: slotEnd })
          .andWhere("slot.end_time > :start", { start: slotStart })
          .andWhere("slot.status != :blocked", { blocked: SlotStatus.BLOCKED })
          .getOne();

        if (overlapping) {
          // Skip this date but continue with others
          skippedDates.push(currentDate.toISOString().split('T')[0]);
        } else {
          const slot = slotRepository.create({
            teacherId,
            startTime: slotStart,
            endTime: slotEnd,
            isRecurring: true,
            dayOfWeek: dayOfWeek.toLowerCase(),
            recurrenceEndDate: endDateParsed,
            price,
            maxBookings: maxBookings || 1,
            notes,
          });
          createdSlots.push(slot);
        }

        // Advance to next week
        currentDate.setDate(currentDate.getDate() + 7);
      }

      if (createdSlots.length === 0) {
        return res.status(409).json({
          error: "No slots could be created — all dates overlap with existing availability",
          skippedDates,
        });
      }

      // Batch save all slots
      await slotRepository.save(createdSlots);

      return res.status(201).json({
        message: "Recurring slots created successfully",
        slots: createdSlots,
        count: createdSlots.length,
        skippedDates,
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
