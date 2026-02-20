import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Recording } from "../entities/Recording";
import { Session } from "../entities/Session";
import { Enrollment } from "../entities/Enrollment";
import { Class } from "../entities/Class";
import { Course } from "../entities/Course";

const recordingRepository = AppDataSource.getRepository(Recording);
const sessionRepository = AppDataSource.getRepository(Session);
const enrollmentRepository = AppDataSource.getRepository(Enrollment);
const classRepository = AppDataSource.getRepository(Class);
const courseRepository = AppDataSource.getRepository(Course);

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

      // Validation
      if (!sessionId || !fileUrl) {
        return res.status(400).json({ error: "Session ID and file URL are required" });
      }

      // Verify session exists and belongs to teacher
      const session = await sessionRepository.findOne({
        where: { id: sessionId },
        relations: ["class"],
      });

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Get class to check teacher ownership
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

      // Check if recording already exists
      let recording = await recordingRepository.findOne({
        where: { sessionId },
      });

      if (recording) {
        // Update existing recording
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
        // Create new recording
        recording = recordingRepository.create({
          sessionId,
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

        // Update session to mark as recorded
        session.isRecorded = true;
        await sessionRepository.save(session);
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
        .leftJoin("class.instructor", "instructor");

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
        queryBuilder.andWhere("class.instructorId = :teacherId", { teacherId });
      }

      // Access control: students can only see public recordings or recordings from classes they booked
      if (userRole === "student" && userId) {
        // For students, show public recordings only (or implement booking-based access)
        queryBuilder.andWhere("recording.isPublic = :isPublic", { isPublic: true });
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
      const classEntity = await classRepository.findOne({
        where: { id: recording.session.classId },
      });

      if (!classEntity) {
        return res.status(404).json({ error: "Class not found" });
      }

      if (classEntity.teacherId !== userId && userRole !== "admin") {
        return res.status(403).json({ error: "Not authorized to update this recording" });
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
      const classEntity = await classRepository.findOne({
        where: { id: recording.session.classId },
      });

      if (!classEntity) {
        return res.status(404).json({ error: "Class not found" });
      }

      if (classEntity.teacherId !== userId && userRole !== "admin") {
        return res.status(403).json({ error: "Not authorized to delete this recording" });
      }

      // Update session
      const session = await sessionRepository.findOne({
        where: { id: recording.sessionId },
      });

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
      const session = await sessionRepository.findOne({
        where: { id: recording.sessionId },
        relations: ["class"],
      });

      if (session && session.class.teacherId === userId) {
        return true;
      }
    }

    // Students: check if enrolled in the course
    if (userRole === "student") {
      const session = await sessionRepository.findOne({
        where: { id: recording.sessionId },
        relations: ["class"],
      });

      if (session) {
        const classEntity = await classRepository.findOne({
          where: { id: session.classId },
        });

        if (classEntity) {
          // For now, students can access public recordings only
          // TODO: Implement booking-based access control
          return false;
        }
      }
    }

    return false;
  }
}

