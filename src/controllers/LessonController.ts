import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Lesson } from "../entities/Lesson";
import { Course } from "../entities/Course";

const lessonRepository = AppDataSource.getRepository(Lesson);
const courseRepository = AppDataSource.getRepository(Course);

export class LessonController {
  /**
   * Get all lessons for a course
   * GET /api/courses/:courseId/lessons
   */
  static async getByCourse(req: Request, res: Response) {
    try {
      const { courseId } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      // Ensure param is string
      if (Array.isArray(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      // Get course to check permissions
      const course = await courseRepository.findOne({
        where: { id: courseId as string },
        relations: ["enrollments"],
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Check if user has access
      const isInstructor = course.instructorId === userId;
      const isAdmin = userRole === "admin";
      const isEnrolled =
        userId &&
        course.enrollments?.some((e) => e.studentId === userId);

      // For unpublished courses or unpublished lessons
      const canSeeUnpublished = isInstructor || isAdmin;

      const queryBuilder = lessonRepository
        .createQueryBuilder("lesson")
        .where("lesson.courseId = :courseId", { courseId });

      // Students can only see published lessons
      if (!canSeeUnpublished) {
        queryBuilder.andWhere("lesson.isPublished = :isPublished", {
          isPublished: true,
        });

        // Students must be enrolled to see lessons
        if (!course.isPublished || !isEnrolled) {
          return res
            .status(403)
            .json({ error: "Enrollment required to view lessons" });
        }
      }

      const lessons = await queryBuilder
        .orderBy("lesson.sortOrder", "ASC")
        .getMany();

      res.json({ lessons });
    } catch (error) {
      console.error("Get lessons error:", error);
      res.status(500).json({ error: "Failed to fetch lessons" });
    }
  }

  /**
   * Get single lesson
   * GET /api/lessons/:id
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid lesson ID" });
      }

      const lesson = await lessonRepository.findOne({
        where: { id: id as string },
        relations: ["course", "course.enrollments"],
      });

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      const course = lesson.course;

      // Check permissions
      const isInstructor = course.instructorId === userId;
      const isAdmin = userRole === "admin";
      const isEnrolled =
        userId &&
        course.enrollments?.some((e) => e.studentId === userId);

      // Check if user can access this lesson
      if (!lesson.isPublished || !course.isPublished) {
        if (!isInstructor && !isAdmin && !isEnrolled) {
          return res
            .status(403)
            .json({ error: "Access denied to this lesson" });
        }
      }

      // Students need to be enrolled (preview lessons are accessible without enrollment)
      if (!isInstructor && !isAdmin && !isEnrolled && !lesson.isPreview) {
        return res.status(403).json({ error: "Enrollment required" });
      }

      res.json({ lesson });
    } catch (error) {
      console.error("Get lesson error:", error);
      res.status(500).json({ error: "Failed to fetch lesson" });
    }
  }

  /**
   * Create new lesson (Course instructor or Admin only)
   * POST /api/courses/:courseId/lessons
   */
  static async create(req: Request, res: Response) {
    try {
      const { courseId } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;
      const {
        title,
        slug,
        content,
        videoUrl,
        durationMinutes,
        sortOrder,
        isPreview,
      } = req.body;

      // Ensure param is string
      if (Array.isArray(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      // Validation
      if (!title || !slug) {
        return res.status(400).json({ error: "Title and slug are required" });
      }

      // Get course and check permissions
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
          .json({ error: "Not authorized to add lessons to this course" });
      }

      // Check if slug already exists for this course
      const existingLesson = await lessonRepository.findOne({
        where: { courseId: courseId as string, slug },
      });

      if (existingLesson) {
        return res
          .status(409)
          .json({ error: "Lesson with this slug already exists in this course" });
      }

      // Get next sort order if not provided
      let finalSortOrder = sortOrder;
      if (finalSortOrder === undefined) {
        const lastLesson = await lessonRepository.findOne({
          where: { courseId: courseId as string },
          order: { sortOrder: "DESC" },
        });
        finalSortOrder = lastLesson ? lastLesson.sortOrder + 1 : 0;
      }

      const lesson = lessonRepository.create({
        courseId: courseId as string,
        title,
        slug,
        content,
        videoUrl,
        durationMinutes: durationMinutes || 0,
        sortOrder: finalSortOrder,
        isPreview: isPreview || false,
        isPublished: false,
      });

      await lessonRepository.save(lesson);

      res.status(201).json({
        message: "Lesson created successfully",
        lesson,
      });
    } catch (error) {
      console.error("Create lesson error:", error);
      res.status(500).json({ error: "Failed to create lesson" });
    }
  }

  /**
   * Update lesson (Course instructor or Admin only)
   * PUT /api/lessons/:id
   */
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;
      const {
        title,
        slug,
        content,
        videoUrl,
        durationMinutes,
        sortOrder,
        isPreview,
        isPublished,
      } = req.body;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid lesson ID" });
      }

      const lesson = await lessonRepository.findOne({
        where: { id: id as string },
        relations: ["course"],
      });

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Check authorization
      const isInstructor = lesson.course.instructorId === userId;
      const isAdmin = userRole === "admin";

      if (!isInstructor && !isAdmin) {
        return res
          .status(403)
          .json({ error: "Not authorized to update this lesson" });
      }

      // Check if slug is being changed and if it already exists
      if (slug && slug !== lesson.slug) {
        const existingLesson = await lessonRepository.findOne({
          where: { courseId: lesson.courseId, slug },
        });

        if (existingLesson) {
          return res.status(409).json({
            error: "Lesson with this slug already exists in this course",
          });
        }
      }

      // Update fields
      if (title !== undefined) lesson.title = title;
      if (slug !== undefined) lesson.slug = slug;
      if (content !== undefined) lesson.content = content;
      if (videoUrl !== undefined) lesson.videoUrl = videoUrl;
      if (durationMinutes !== undefined)
        lesson.durationMinutes = durationMinutes;
      if (sortOrder !== undefined) lesson.sortOrder = sortOrder;
      if (isPreview !== undefined) lesson.isPreview = isPreview;
      if (isPublished !== undefined) lesson.isPublished = isPublished;

      await lessonRepository.save(lesson);

      res.json({
        message: "Lesson updated successfully",
        lesson,
      });
    } catch (error) {
      console.error("Update lesson error:", error);
      res.status(500).json({ error: "Failed to update lesson" });
    }
  }

  /**
   * Delete lesson (Course instructor or Admin only)
   * DELETE /api/lessons/:id
   */
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid lesson ID" });
      }

      const lesson = await lessonRepository.findOne({
        where: { id: id as string },
        relations: ["course", "lessonProgress"],
      });

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Check authorization
      const isInstructor = lesson.course.instructorId === userId;
      const isAdmin = userRole === "admin";

      if (!isInstructor && !isAdmin) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this lesson" });
      }

      await lessonRepository.remove(lesson);

      res.json({ message: "Lesson deleted successfully" });
    } catch (error) {
      console.error("Delete lesson error:", error);
      res.status(500).json({ error: "Failed to delete lesson" });
    }
  }

  /**
   * Reorder lessons in a course
   * PUT /api/courses/:courseId/lessons/reorder
   */
  static async reorder(req: Request, res: Response) {
    try {
      const { courseId } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;
      const { lessonIds } = req.body; // Array of lesson IDs in new order

      // Ensure param is string
      if (Array.isArray(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      if (!Array.isArray(lessonIds)) {
        return res
          .status(400)
          .json({ error: "lessonIds must be an array" });
      }

      // Get course and check permissions
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
          .json({ error: "Not authorized to reorder lessons" });
      }

      // Update sort order for each lesson
      for (let i = 0; i < lessonIds.length; i++) {
        await lessonRepository.update(
          { id: lessonIds[i], courseId: courseId as string },
          { sortOrder: i }
        );
      }

      res.json({ message: "Lessons reordered successfully" });
    } catch (error) {
      console.error("Reorder lessons error:", error);
      res.status(500).json({ error: "Failed to reorder lessons" });
    }
  }
}
