import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { AppDataSource } from "../config/data-source";
import { Course } from "../entities/Course";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { TeacherProfile } from "../entities/TeacherProfile";
import { validatePrice, validateStringLength } from "../utils/validation";
import { parsePagination, createPaginationMeta } from "../utils/pagination";
import { Logger } from "../utils/logger";

const courseRepository = AppDataSource.getRepository(Course);
const userRepository = AppDataSource.getRepository(User);
const categoryRepository = AppDataSource.getRepository(Category);
const teacherProfileRepository = AppDataSource.getRepository(TeacherProfile);

export class CourseController {
  /**
   * Get all courses (published only for students, all for instructors/admin)
   * GET /api/courses
   */
  static async getAll(req: Request, res: Response) {
    try {
      const { category, level, search, instructorId, medium } = req.query;
      const userRole = req.session.userRole;

      const queryBuilder = courseRepository
        .createQueryBuilder("course")
        .leftJoinAndSelect("course.instructor", "instructor")
        .leftJoinAndSelect("course.category", "category");

      // Students can only see published courses
      if (!userRole || userRole === "student") {
        queryBuilder.where("course.isPublished = :isPublished", {
          isPublished: true,
        });
      }

      // Filter by category
      if (category) {
        queryBuilder.andWhere("course.categoryId = :categoryId", {
          categoryId: category,
        });
      }

      // Filter by level
      if (level) {
        queryBuilder.andWhere("course.level = :level", { level });
      }

      // Filter by medium (language)
      if (medium) {
        queryBuilder.andWhere("course.medium = :medium", { medium });
      }

      // Filter by instructor
      if (instructorId) {
        queryBuilder.andWhere("course.instructorId = :instructorId", {
          instructorId,
        });
      }

      // Search by title or description
      if (search) {
        queryBuilder.andWhere(
          "(course.title LIKE :search OR course.description LIKE :search)",
          { search: `%${search}%` }
        );
      }

      // Parse pagination parameters
      const pagination = parsePagination(req.query, 20, 100);

      // Get total count for pagination
      const totalCount = await queryBuilder.getCount();

      // Apply pagination
      const courses = await queryBuilder
        .orderBy("course.createdAt", "DESC")
        .skip(pagination.offset)
        .take(pagination.limit)
        .getMany();

      // Create pagination metadata
      const paginationMeta = createPaginationMeta(
        pagination.page,
        pagination.limit,
        totalCount
      );

      res.json({
        courses,
        pagination: paginationMeta,
      });
    } catch (error) {
      Logger.error("Get courses error:", error, req);
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  }

  /**
   * Get single course with lessons
   * GET /api/courses/:id
   */
  static async getById(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const course = await courseRepository.findOne({
        where: { id },
        relations: ["instructor", "category", "lessons", "enrollments", "exams"],
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Check if user has access to unpublished courses
      if (!course.isPublished) {
        if (!userId) {
          return res.status(403).json({ error: "Course not available" });
        }

        // Only instructor, admin, or enrolled students can view unpublished courses
        const isInstructor = course.instructorId === userId;
        const isAdmin = userRole === "admin";
        const isEnrolled = course.enrollments?.some(
          (e) => e.studentId === userId
        );

        if (!isInstructor && !isAdmin && !isEnrolled) {
          return res.status(403).json({ error: "Course not available" });
        }
      }

      // Sort lessons by sortOrder
      if (course.lessons) {
        course.lessons.sort((a, b) => a.sortOrder - b.sortOrder);
      }

      // Check if user is enrolled (if authenticated)
      let isEnrolled = false;
      if (userId && course.enrollments) {
        isEnrolled = course.enrollments.some((e) => e.studentId === userId);
      }

      res.json({
        course,
        isEnrolled,
      });
    } catch (error) {
      console.error("Get course error:", error);
      res.status(500).json({ error: "Failed to fetch course" });
    }
  }

  /**
   * Get instructor's courses
   * GET /api/courses/my-courses
   */
  static async getMyCourses(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // If admin, they see all courses. If instructor, they see only their own.
      const whereCondition = userRole === "admin" ? {} : { instructorId: userId };

      const courses = await courseRepository.find({
        where: whereCondition,
        relations: ["category", "lessons", "enrollments"],
        order: { createdAt: "DESC" },
      });

      res.json({ courses });
    } catch (error) {
      console.error("Get my courses error:", error);
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  }

  /**
   * Create new course (Instructor/Admin only)
   * POST /api/courses
   */
  static async create(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      const userRole = req.session.userRole;
      const {
        title,
        slug,
        description,
        categoryId,
        level,
        medium,
        price,
        thumbnail,
        previewVideoUrl,
      } = req.body;

      // Validation
      if (!title || !slug || !categoryId) {
        return res
          .status(400)
          .json({ error: "Title, slug, and category are required" });
      }

      // Validate title length (max 200 chars per entity)
      const titleValidation = validateStringLength(title, "Title", 200, 1);
      if (!titleValidation.isValid) {
        return res.status(400).json({ error: titleValidation.error });
      }

      // Validate slug length (max 250 chars per entity, unique)
      const slugValidation = validateStringLength(slug, "Slug", 250, 1);
      if (!slugValidation.isValid) {
        return res.status(400).json({ error: slugValidation.error });
      }

      // Validate description length if provided (text field, reasonable limit)
      if (description) {
        const descValidation = validateStringLength(description, "Description", 50000);
        if (!descValidation.isValid) {
          return res.status(400).json({ error: descValidation.error });
        }
      }

      // Validate price if provided
      if (price !== undefined && price !== null) {
        const priceValidation = validatePrice(price, 0, 1000000);
        if (!priceValidation.isValid) {
          return res.status(400).json({ error: priceValidation.error });
        }
      }

      // Check if teacher is verified (admins can skip this check)
      if (userRole === "instructor") {
        const teacherProfile = await teacherProfileRepository.findOne({
          where: { teacherId: userId! },
        });

        if (!teacherProfile || !teacherProfile.verified) {
          return res.status(403).json({
            error: "You must be verified by an admin before creating courses. Please wait for verification.",
          });
        }
      }
      // Note: Admins can create courses without verification (userRole === "admin" bypasses this check)

      // Check if slug already exists
      const existingCourse = await courseRepository.findOne({
        where: { slug },
      });

      if (existingCourse) {
        return res
          .status(409)
          .json({ error: "Course with this slug already exists" });
      }

      // Verify category exists
      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      });

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      const course = courseRepository.create({
        title,
        slug,
        description,
        instructorId: userId!,
        categoryId,
        level: level || "beginner",
        medium: medium || "english",
        price: price || 0,
        thumbnail,
        previewVideoUrl,
        status: "draft",
        isPublished: false,
      });

      await courseRepository.save(course);

      // Fetch with relations
      const createdCourse = await courseRepository.findOne({
        where: { id: course.id },
        relations: ["instructor", "category"],
      });

      res.status(201).json({
        message: "Course created successfully",
        course: createdCourse,
      });
    } catch (error) {
      console.error("Create course error:", error);
      res.status(500).json({ error: "Failed to create course" });
    }
  }

  /**
   * Update course (Course instructor or Admin only)
   * PUT /api/courses/:id
   */
  static async update(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const userId = req.session.userId;
      const userRole = req.session.userRole;
      const {
        title,
        slug,
        description,
        categoryId,
        level,
        medium,
        price,
        thumbnail,
        previewVideoUrl,
        status,
        isPublished,
      } = req.body;

      const course = await courseRepository.findOne({
        where: { id },
        relations: ["instructor"],
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
          .json({ error: "Not authorized to update this course" });
      }

      // Check if slug is being changed and if it already exists
      if (slug && slug !== course.slug) {
        const existingCourse = await courseRepository.findOne({
          where: { slug },
        });

        if (existingCourse) {
          return res
            .status(409)
            .json({ error: "Course with this slug already exists" });
        }
      }

      // Verify category if being changed
      if (categoryId && categoryId !== course.categoryId) {
        const category = await categoryRepository.findOne({
          where: { id: categoryId },
        });

        if (!category) {
          return res.status(404).json({ error: "Category not found" });
        }
      }

      // Update fields
      if (title !== undefined) course.title = title;
      if (slug !== undefined) course.slug = slug;
      if (description !== undefined) course.description = description;
      if (categoryId !== undefined) course.categoryId = categoryId;
      if (level !== undefined) course.level = level;
      if (medium !== undefined) course.medium = medium;
      if (price !== undefined) course.price = price;
      if (thumbnail !== undefined) course.thumbnail = thumbnail;
      if (previewVideoUrl !== undefined)
        course.previewVideoUrl = previewVideoUrl;
      if (status !== undefined) course.status = status;
      if (isPublished !== undefined) course.isPublished = isPublished;

      await courseRepository.save(course);

      // Fetch with relations
      const updatedCourse = await courseRepository.findOne({
        where: { id },
        relations: ["instructor", "category"],
      });

      res.json({
        message: "Course updated successfully",
        course: updatedCourse,
      });
    } catch (error) {
      console.error("Update course error:", error);
      res.status(500).json({ error: "Failed to update course" });
    }
  }

  /**
   * Delete course (Course instructor or Admin only)
   * DELETE /api/courses/:id
   */
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const course = await courseRepository.findOne({
        where: { id: id as string },
        relations: ["enrollments", "lessons"],
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
          .json({ error: "Not authorized to delete this course" });
      }

      // Check if course has enrollments
      if (course.enrollments && course.enrollments.length > 0) {
        return res.status(400).json({
          error: "Cannot delete course with existing enrollments",
          enrollmentsCount: course.enrollments.length,
        });
      }

      await courseRepository.remove(course);

      res.json({ message: "Course deleted successfully" });
    } catch (error) {
      console.error("Delete course error:", error);
      res.status(500).json({ error: "Failed to delete course" });
    }
  }

  /**
   * Publish/unpublish course
   * PATCH /api/courses/:id/publish
   */
  static async togglePublish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;
      const { isPublished } = req.body;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const course = await courseRepository.findOne({
        where: { id: id as string },
        relations: ["lessons"],
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
          .json({ error: "Not authorized to publish this course" });
      }

      course.isPublished = isPublished;
      if (isPublished) {
        course.status = "published";
      }

      await courseRepository.save(course);

      res.json({
        message: `Course ${isPublished ? "published" : "unpublished"} successfully`,
        course,
      });
    } catch (error) {
      console.error("Toggle publish error:", error);
      res.status(500).json({ error: "Failed to update course status" });
    }
  }

  /**
   * Upload course media (thumbnail or preview video)
   * POST /api/courses/upload-media
   */
  static async uploadMedia(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      // The file was saved successfully by multer. We return the URL.
      const fileUrl = `/uploads/course-media/${req.file.filename}`;
      res.json({ message: "File uploaded successfully", url: fileUrl });
    } catch (error) {
      console.error("Upload course media error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  }

  /**
   * Delete course media
   * DELETE /api/courses/delete-media
   */
  static async deleteMedia(req: Request, res: Response) {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "No URL provided" });
      }

      // Check if it's a local file and starts with the upload prefix
      // We check for the filename only to be safe
      if (url.includes("/uploads/course-media/")) {
        const urlParts = url.split("/");
        const filename = urlParts[urlParts.length - 1];
        
        // Basic security check: ensure it's just a filename, no path traversal
        if (filename && !filename.includes("..")) {
          const filePath = path.join(process.cwd(), "uploads", "course-media", filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }
      res.json({ message: "Media removed successfully" });
    } catch (error) {
      console.error("Delete course media error:", error);
      res.status(500).json({ error: "Failed to remove file" });
    }
  }
}
