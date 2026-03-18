import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { In } from "typeorm";
import { Brackets } from "typeorm";
import { Recording } from "../entities/Recording";
import { Session } from "../entities/Session";
import { Enrollment } from "../entities/Enrollment";
import { Class } from "../entities/Class";
import { Course } from "../entities/Course";
import { Booking, BookingStatus } from "../entities/Booking";

const recordingRepository = AppDataSource.getRepository(Recording);
const sessionRepository = AppDataSource.getRepository(Session);
const enrollmentRepository = AppDataSource.getRepository(Enrollment);
const classRepository = AppDataSource.getRepository(Class);
const courseRepository = AppDataSource.getRepository(Course);
const bookingRepository = AppDataSource.getRepository(Booking);

export class RecordingController {
  /**
   * Create/Update recording (associate with session)
   * POST /api/recordings
   */
  static async create(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      if (userRole !== "instructor" && userRole !== "admin") {
        return res.status(403).json({ error: "Only instructors can create recordings" });
      }

      const {
        sessionId,
        fileUrl,
        fileSize,
        durationMinutes,
        videoQuality,
        thumbnailUrl,
        isPublic,
        metadata,
      } = req.body;

      // Validation — only fileUrl is required; sessionId is optional.
      // Recordings can be standalone (no linked session) when added manually
      // through the UI without an associated booking session.
      if (!fileUrl) {
        return res.status(400).json({ error: "File URL is required" });
      }

      // When sessionId is supplied, verify it exists and that the teacher owns it.
      // When omitted the recording is created as standalone (sessionId = null).
      let session: Session | null = null;

      if (sessionId) {
        session = await sessionRepository.findOne({
          where: { id: sessionId },
          relations: ["class"],
        });

        if (!session) {
          return res.status(404).json({ error: "Session not found. Omit sessionId to create a standalone recording." });
        }

        // Get class to check teacher ownership
        if (!session.classId) {
          return res.status(404).json({ error: "No class associated with this session" });
        }

        const classEntity = await classRepository.findOne({
          where: { id: session.classId },
        });

        if (!classEntity) {
          return res.status(404).json({ error: "Class not found" });
        }

        // Check if teacher owns the class (or is admin)
        if (classEntity.teacherId !== userId && userRole !== "admin") {
          return res.status(403).json({ error: "Not authorized to create recording for this session" });
        }
      }

      // Check if a recording already exists for this session (only when sessionId given)
      let recording = sessionId
        ? await recordingRepository.findOne({ where: { sessionId } })
        : null;

      if (recording) {
        // Update existing recording linked to the session
        recording.fileUrl = fileUrl;
        if (fileSize !== undefined) recording.fileSize = fileSize;
        if (durationMinutes !== undefined) recording.durationMinutes = durationMinutes;
        if (videoQuality !== undefined) recording.videoQuality = videoQuality;
        if (thumbnailUrl !== undefined) recording.thumbnailUrl = thumbnailUrl;
        if (isPublic !== undefined) recording.isPublic = isPublic === "true" || isPublic === true;
        if (metadata !== undefined) recording.metadata = metadata;
        recording.isProcessed = true;
        recording.uploadedAt = new Date();

        await recordingRepository.save(recording);
      } else {
        // Create new recording (standalone or session-linked)
        recording = recordingRepository.create({
          sessionId: sessionId || null,
          fileUrl,
          fileSize: fileSize || null,
          durationMinutes: durationMinutes || null,
          videoQuality: videoQuality || null,
          thumbnailUrl: thumbnailUrl || null,
          isPublic: isPublic === "true" || isPublic === true,
          isProcessed: true,
          uploadedAt: new Date(),
          metadata: metadata || {},
        });

        await recordingRepository.save(recording);

        // Mark linked session as recorded
        if (session) {
          session.isRecorded = true;
          await sessionRepository.save(session);
        }
      }

      res.status(201).json({
        message: "Recording created successfully",
        recording,
      });
    } catch (error) {
      console.error("Create recording error:", error);
      res.status(500).json({ error: "Failed to create recording" });
    }
  }

  /**
   * Get all recordings (with filters)
   * GET /api/recordings?sessionId=&classId=&isPublic=
   */
  static async getAll(req: Request, res: Response) {
    try {
      const { sessionId, classId, isPublic, teacherId } = req.query;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const queryBuilder = recordingRepository
        .createQueryBuilder("recording")
        .leftJoinAndSelect("recording.session", "session")
        .leftJoin("session.class", "class")
        .leftJoin("class.teacher", "teacher");

      // Filters
      if (sessionId) {
        queryBuilder.andWhere("recording.sessionId = :sessionId", { sessionId });
      }

      if (classId) {
        queryBuilder.andWhere("session.classId = :classId", { classId });
      }

      if (isPublic !== undefined) {
        queryBuilder.andWhere("recording.isPublic = :isPublic", {
          isPublic: isPublic === "true",
        });
      }

      if (teacherId) {
        queryBuilder.andWhere("class.teacherId = :teacherId", { teacherId });
      }

      // Access control: students see public recordings + private recordings from sessions they've booked
      if (userRole === "student" && userId) {
        // Gather all session IDs the student has a confirmed/completed booking for
        const studentBookings = await bookingRepository.find({
          where: { studentId: userId, status: In([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]) },
          select: ["id"],
        });
        const bookedIds = studentBookings.map((b) => b.id);

        queryBuilder.andWhere(
          new Brackets((qb) => {
            qb.where("recording.isPublic = :isPublic", { isPublic: true });
            if (bookedIds.length > 0) {
              // Include private recordings whose session is linked to one of the student's bookings
              qb.orWhere("session.bookingId IN (:...bookedIds)", { bookedIds });
            }
          })
        );
      }

      queryBuilder.orderBy("recording.uploadedAt", "DESC");

      const recordings = await queryBuilder.getMany();

      res.json({ recordings });
    } catch (error) {
      console.error("Get recordings error:", error);
      res.status(500).json({ error: "Failed to fetch recordings" });
    }
  }

  /**
   * Get recording by ID
   * GET /api/recordings/:id
   */
  static async getById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const recording = await recordingRepository.findOne({
        where: { id },
        relations: ["session", "session.class"],
      });

      if (!recording) {
        return res.status(404).json({ error: "Recording not found" });
      }

      // Check access
      const hasAccess = await RecordingController.checkAccess(
        recording,
        userId!,
        userRole!
      );

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this recording" });
      }

      // Increment view count
      recording.viewCount += 1;
      await recordingRepository.save(recording);

      res.json({ recording });
    } catch (error) {
      console.error("Get recording by ID error:", error);
      res.status(500).json({ error: "Failed to fetch recording" });
    }
  }

  /**
   * Update recording (Teacher/Admin only)
   * PUT /api/recordings/:id
   */
  static async update(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const recording = await recordingRepository.findOne({
        where: { id },
        relations: ["session", "session.class"],
      });

      if (!recording) {
        return res.status(404).json({ error: "Recording not found" });
      }

      // Check ownership
      if (!recording.session) {
        // For standalone recordings, check if the creator is the instructor
        // (Assuming you have a creatorId or similar, but for now let's just allow if instructor)
        if (userRole !== "admin" && userRole !== "instructor") {
          return res.status(403).json({ error: "Not authorized to update this recording" });
        }
      } else {
        const classEntity = await classRepository.findOne({
          where: { id: recording.session.classId },
        });

        if (!classEntity) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (classEntity.teacherId !== userId && userRole !== "admin") {
          return res.status(403).json({ error: "Not authorized to update this recording" });
        }
      }

      const {
        fileUrl,
        durationMinutes,
        videoQuality,
        thumbnailUrl,
        isPublic,
        metadata,
      } = req.body;

      // Update fields
      if (fileUrl !== undefined) recording.fileUrl = fileUrl;
      if (durationMinutes !== undefined) recording.durationMinutes = durationMinutes;
      if (videoQuality !== undefined) recording.videoQuality = videoQuality;
      if (thumbnailUrl !== undefined) recording.thumbnailUrl = thumbnailUrl;
      if (isPublic !== undefined)
        recording.isPublic = isPublic === "true" || isPublic === true;
      if (metadata !== undefined) recording.metadata = metadata;

      await recordingRepository.save(recording);

      res.json({
        message: "Recording updated successfully",
        recording,
      });
    } catch (error) {
      console.error("Update recording error:", error);
      res.status(500).json({ error: "Failed to update recording" });
    }
  }

  /**
   * Delete recording (Teacher/Admin only)
   * DELETE /api/recordings/:id
   */
  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const recording = await recordingRepository.findOne({
        where: { id },
        relations: ["session", "session.class"],
      });

      if (!recording) {
        return res.status(404).json({ error: "Recording not found" });
      }

      // Check ownership
      if (!recording.session) {
        if (userRole !== "admin" && userRole !== "instructor") {
          return res.status(403).json({ error: "Not authorized to delete this recording" });
        }
      } else {
        const classEntity = await classRepository.findOne({
          where: { id: recording.session.classId },
        });

        if (!classEntity) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (classEntity.teacherId !== userId && userRole !== "admin") {
          return res.status(403).json({ error: "Not authorized to delete this recording" });
        }
      }

      // Update session (only if this recording was linked to one)
      const session = recording.sessionId
        ? await sessionRepository.findOne({ where: { id: recording.sessionId } })
        : null;

      if (session) {
        session.isRecorded = false;
        await sessionRepository.save(session);
      }

      // Delete recording
      await recordingRepository.remove(recording);

      res.json({ message: "Recording deleted successfully" });
    } catch (error) {
      console.error("Delete recording error:", error);
      res.status(500).json({ error: "Failed to delete recording" });
    }
  }

  /**
   * Check recording access
   */
  private static async checkAccess(
    recording: Recording,
    userId: string,
    userRole: string
  ): Promise<boolean> {
    // Admin always has access
    if (userRole === "admin") {
      return true;
    }

    // Public recordings are accessible to all
    if (recording.isPublic) {
      return true;
    }

    // Teacher who owns the class has access
    if (userRole === "instructor") {
      if (!recording.sessionId) return true; // standalone recording — teacher always has access
      const session = await sessionRepository.findOne({
        where: { id: recording.sessionId },
        relations: ["class"],
      });

      if (session && session.class?.teacherId === userId) {
        return true;
      }
    }

    // Students: check if they have a confirmed/completed booking linked to this recording's session
    if (userRole === "student") {
      if (!recording.sessionId) return false; // standalone recording — no student access

      const session = await sessionRepository.findOne({
        where: { id: recording.sessionId },
      });

      if (!session) return false;

      // 1-on-1 session: session is directly linked to a booking
      if (session.bookingId) {
        const booking = await bookingRepository.findOne({
          where: {
            id: session.bookingId,
            studentId: userId,
            status: In([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
          },
        });
        if (booking) return true;
      }

      // Group class session: check if student has any confirmed booking with the teacher of that class
      if (session.classId) {
        const classEntity = await classRepository.findOne({
          where: { id: session.classId },
        });
        if (classEntity) {
          const booking = await bookingRepository.findOne({
            where: {
              studentId: userId,
              teacherId: classEntity.teacherId,
              status: In([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
            },
          });
          if (booking) return true;
        }
      }

      return false;
    }

    return false;
  }
}

