import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Enrollment } from "../entities/Enrollment";
import { Course } from "../entities/Course";
import { LessonProgress } from "../entities/LessonProgress";
import { Lesson } from "../entities/Lesson";

const enrollmentRepository = AppDataSource.getRepository(Enrollment);
const courseRepository = AppDataSource.getRepository(Course);
const lessonProgressRepository = AppDataSource.getRepository(LessonProgress);
const lessonRepository = AppDataSource.getRepository(Lesson);

export class EnrollmentController {
  /**
   * Get all enrollments for current user
   * GET /api/enrollments
   */
  static async getMyEnrollments(req: Request, res: Response) {
    try {
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const enrollments = await enrollmentRepository.find({
        where: { studentId: userId },
        relations: ["course", "course.instructor", "course.category"],
        order: { enrolledAt: "DESC" },
      });

      res.json({ enrollments });
    } catch (error) {
      console.error("Get enrollments error:", error);
      res.status(500).json({ error: "Failed to fetch enrollments" });
    }
  }

  /**
   * Get single enrollment with progress
   * GET /api/enrollments/:id
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;

      const enrollment = await enrollmentRepository.findOne({
        where: { id: id as string },
        relations: [
          "course",
          "course.lessons",
          "course.instructor",
          "lessonProgress",
          "lessonProgress.lesson",
        ],
      });

      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      // Check authorization
      if (enrollment.studentId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to view this enrollment" });
      }

      // Sort lessons by sortOrder
      if (enrollment.course.lessons) {
        enrollment.course.lessons.sort((a, b) => a.sortOrder - b.sortOrder);
      }

      res.json({ enrollment });
    } catch (error) {
      console.error("Get enrollment error:", error);
      res.status(500).json({ error: "Failed to fetch enrollment" });
    }
  }

  /**
   * Enroll in a course
   * POST /api/enrollments
   */
  static async enroll(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      const { courseId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!courseId) {
        return res.status(400).json({ error: "Course ID is required" });
      }

      // Check if course exists and is published
      const course = await courseRepository.findOne({
        where: { id: courseId as string },
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      if (!course.isPublished) {
        return res
          .status(400)
          .json({ error: "Cannot enroll in unpublished course" });
      }

      // Check if already enrolled
      const existingEnrollment = await enrollmentRepository.findOne({
        where: { studentId: userId, courseId },
      });

      if (existingEnrollment) {
        return res
          .status(409)
          .json({ error: "Already enrolled in this course" });
      }

      // Create enrollment
      const enrollment = enrollmentRepository.create({
        studentId: userId,
        courseId,
        status: "active",
        progressPercentage: 0,
      });

      await enrollmentRepository.save(enrollment);

      // Update course enrollment count
      await courseRepository.increment({ id: courseId }, "enrollmentCount", 1);

      // Fetch with relations
      const createdEnrollment = await enrollmentRepository.findOne({
        where: { id: enrollment.id },
        relations: ["course", "course.instructor"],
      });

      res.status(201).json({
        message: "Successfully enrolled in course",
        enrollment: createdEnrollment,
      });
    } catch (error) {
      console.error("Enroll error:", error);
      res.status(500).json({ error: "Failed to enroll in course" });
    }
  }

  /**
   * Unenroll from a course
   * DELETE /api/enrollments/:id
   */
  static async unenroll(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;

      const enrollment = await enrollmentRepository.findOne({
        where: { id: id as string },
        relations: ["course"],
      });

      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      // Check authorization
      if (enrollment.studentId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to unenroll from this course" });
      }

      // Prevent unenrolling if course is completed
      if (enrollment.status === "completed") {
        return res
          .status(400)
          .json({ error: "Cannot unenroll from completed course" });
      }

      await enrollmentRepository.remove(enrollment);

      // Update course enrollment count
      await courseRepository.decrement(
        { id: enrollment.courseId },
        "enrollmentCount",
        1
      );

      res.json({ message: "Successfully unenrolled from course" });
    } catch (error) {
      console.error("Unenroll error:", error);
      res.status(500).json({ error: "Failed to unenroll from course" });
    }
  }

  /**
   * Mark lesson as complete/incomplete
   * POST /api/enrollments/:enrollmentId/lessons/:lessonId/progress
   */
  static async updateLessonProgress(req: Request, res: Response) {
    try {
      const { enrollmentId, lessonId } = req.params;
      const { isCompleted, timeSpentSeconds } = req.body;
      const userId = req.session.userId;

      // Ensure params are strings
      if (Array.isArray(enrollmentId) || Array.isArray(lessonId)) {
        return res.status(400).json({ error: "Invalid enrollment or lesson ID" });
      }

      // Verify enrollment belongs to user
      const enrollment = await enrollmentRepository.findOne({
        where: { id: enrollmentId as string },
        relations: ["course", "course.lessons"],
      });

      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      if (enrollment.studentId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to update this progress" });
      }

      // Verify lesson belongs to course
      const lesson = await lessonRepository.findOne({
        where: { id: lessonId as string, courseId: enrollment.courseId },
      });

      if (!lesson) {
        return res
          .status(404)
          .json({ error: "Lesson not found in this course" });
      }

      // Find or create lesson progress
      let lessonProgress = await lessonProgressRepository.findOne({
        where: { enrollmentId: enrollmentId as string, lessonId: lessonId as string },
      });

      if (!lessonProgress) {
        lessonProgress = lessonProgressRepository.create({
          enrollmentId: enrollmentId as string,
          lessonId: lessonId as string,
          isCompleted: false,
          timeSpentSeconds: 0,
        });
      }

      // Update progress
      if (isCompleted !== undefined) {
        lessonProgress.isCompleted = isCompleted;
        if (isCompleted) {
          lessonProgress.completedAt = new Date();
        } else {
          lessonProgress.completedAt = undefined;
        }
      }

      if (timeSpentSeconds !== undefined) {
        lessonProgress.timeSpentSeconds += timeSpentSeconds;
      }

      await lessonProgressRepository.save(lessonProgress);

      // Recalculate enrollment progress
      await this.recalculateEnrollmentProgress(enrollmentId as string);

      res.json({
        message: "Lesson progress updated successfully",
        lessonProgress,
      });
    } catch (error) {
      console.error("Update lesson progress error:", error);
      res.status(500).json({ error: "Failed to update lesson progress" });
    }
  }

  /**
   * Get course progress for enrollment
   * GET /api/enrollments/:enrollmentId/progress
   */
  static async getProgress(req: Request, res: Response) {
    try {
      const { enrollmentId } = req.params;
      const userId = req.session.userId;

      // Ensure param is string
      if (Array.isArray(enrollmentId)) {
        return res.status(400).json({ error: "Invalid enrollment ID" });
      }

      const enrollment = await enrollmentRepository.findOne({
        where: { id: enrollmentId as string },
        relations: [
          "course",
          "course.lessons",
          "lessonProgress",
          "lessonProgress.lesson",
        ],
      });

      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      if (enrollment.studentId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to view this progress" });
      }

      // Calculate statistics
      const totalLessons = enrollment.course.lessons?.length || 0;
      const completedLessons =
        enrollment.lessonProgress?.filter((lp) => lp.isCompleted).length || 0;
      const totalTimeSpent =
        enrollment.lessonProgress?.reduce(
          (sum, lp) => sum + lp.timeSpentSeconds,
          0
        ) || 0;

      res.json({
        enrollment,
        statistics: {
          totalLessons,
          completedLessons,
          progressPercentage: enrollment.progressPercentage,
          totalTimeSpent,
          status: enrollment.status,
        },
      });
    } catch (error) {
      console.error("Get progress error:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  }

  /**
   * Helper method to recalculate enrollment progress
   */
  private static async recalculateEnrollmentProgress(
    enrollmentId: string
  ): Promise<void> {
    const enrollment = await enrollmentRepository.findOne({
      where: { id: enrollmentId },
      relations: ["course", "course.lessons", "lessonProgress"],
    });

    if (!enrollment) return;

    const totalLessons = enrollment.course.lessons?.length || 0;
    if (totalLessons === 0) {
      enrollment.progressPercentage = 0;
      await enrollmentRepository.save(enrollment);
      return;
    }

    const completedLessons =
      enrollment.lessonProgress?.filter((lp) => lp.isCompleted).length || 0;
    const progressPercentage = Math.round(
      (completedLessons / totalLessons) * 100
    );

    enrollment.progressPercentage = progressPercentage;

    // Mark as completed if 100%
    if (progressPercentage === 100 && enrollment.status !== "completed") {
      enrollment.status = "completed";
      enrollment.completedAt = new Date();
    }

    await enrollmentRepository.save(enrollment);
  }

  /**
   * Get enrollments for a specific course (Admin/Instructor only)
   * GET /api/courses/:courseId/enrollments
   */
  static async getCourseEnrollments(req: Request, res: Response) {
    try {
      const { courseId } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      // Get course to check permissions
      const course = await courseRepository.findOne({
        where: { id: courseId as string },
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Check authorization
      const isInstructor = course.instructorId === userId;
      const isAdmin = userRole === "admin";

      if (!isInstructor && !isAdmin) {
        return res
          .status(403)
          .json({ error: "Not authorized to view course enrollments" });
      }

      const enrollments = await enrollmentRepository.find({
        where: { courseId: courseId as string },
        relations: ["student"],
        order: { enrolledAt: "DESC" },
      });

      res.json({ enrollments });
    } catch (error) {
      console.error("Get course enrollments error:", error);
      res.status(500).json({ error: "Failed to fetch course enrollments" });
    }
  }
}
