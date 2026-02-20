import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Content, ContentType } from "../entities/Content";
import { FileStorageService } from "../services/FileStorageService";
import { Enrollment } from "../entities/Enrollment";
import { Payment, PaymentType } from "../entities/Payment";
import { Express } from "express";

type MulterRequest = Express.Request & {
  file?: Express.Multer.File;
  body: any;
}

const contentRepository = AppDataSource.getRepository(Content);
const enrollmentRepository = AppDataSource.getRepository(Enrollment);
const paymentRepository = AppDataSource.getRepository(Payment);
const fileStorageService = new FileStorageService();

export class ContentController {
  /**
   * Upload content (Teacher only)
   * POST /api/content/upload
   */
  static async upload(req: MulterRequest, res: Response) {
    try {
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      if (userRole !== "instructor" && userRole !== "admin") {
        return res.status(403).json({ error: "Only instructors can upload content" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "File is required" });
      }

      const {
        title,
        description,
        contentType,
        language,
        isPaid,
        price,
        subject,
        grade,
        isDownloadable,
        thumbnailUrl,
      } = req.body;

      // Validation
      if (!title || !contentType) {
        return res.status(400).json({ error: "Title and content type are required" });
      }

      if (!Object.values(ContentType).includes(contentType as ContentType)) {
        return res.status(400).json({ error: "Invalid content type" });
      }

      if (isPaid === "true" && (!price || parseFloat(price) <= 0)) {
        return res.status(400).json({ error: "Price is required for paid content" });
      }

      // Save file
      const { fileUrl, fileSize } = await fileStorageService.saveFile(
        req.file,
        contentType,
        userId!
      );

      // Create content record
      const content = contentRepository.create({
        teacherId: userId!,
        title,
        description: description || null,
        contentType: contentType as ContentType,
        language: language || "english",
        fileUrl,
        fileSize,
        thumbnailUrl: thumbnailUrl || null,
        isPaid: isPaid === "true" || isPaid === true,
        price: isPaid === "true" || isPaid === true ? parseFloat(price) : undefined,
        subject: subject || null,
        grade: grade || null,
        isDownloadable: isDownloadable !== "false" && isDownloadable !== false,
        isPublished: false, // Default to unpublished
        metadata: {},
      });

      await contentRepository.save(content);

      res.status(201).json({
        message: "Content uploaded successfully",
        content,
      });
    } catch (error) {
      console.error("Content upload error:", error);
      res.status(500).json({ error: "Failed to upload content" });
    }
  }

  /**
   * Get all content (with filters)
   * GET /api/content?teacherId=&type=&subject=&grade=&language=&isPaid=
   */
  static async getAll(req: Request, res: Response) {
    try {
      const {
        teacherId,
        type,
        subject,
        grade,
        language,
        isPaid,
        isPublished,
        search,
      } = req.query;

      const queryBuilder = contentRepository
        .createQueryBuilder("content")
        .leftJoinAndSelect("content.teacher", "teacher");

      // Filters
      if (teacherId) {
        queryBuilder.andWhere("content.teacherId = :teacherId", { teacherId });
      }

      if (type) {
        queryBuilder.andWhere("content.contentType = :type", { type });
      }

      if (subject) {
        queryBuilder.andWhere("content.subject = :subject", { subject });
      }

      if (grade) {
        queryBuilder.andWhere("content.grade = :grade", { grade });
      }

      if (language) {
        queryBuilder.andWhere("content.language = :language", { language });
      }

      if (isPaid !== undefined) {
        queryBuilder.andWhere("content.isPaid = :isPaid", {
          isPaid: isPaid === "true",
        });
      }

      if (isPublished !== undefined) {
        queryBuilder.andWhere("content.isPublished = :isPublished", {
          isPublished: isPublished === "true",
        });
      } else {
        // Default: only show published content to non-owners
        const userId = req.session.userId;
        const userRole = req.session.userRole;
        if (userRole !== "instructor" && userRole !== "admin") {
          queryBuilder.andWhere("content.isPublished = :isPublished", {
            isPublished: true,
          });
        } else if (teacherId && teacherId !== userId) {
          // If viewing another teacher's content, only show published
          queryBuilder.andWhere("content.isPublished = :isPublished", {
            isPublished: true,
          });
        }
      }

      if (search) {
        queryBuilder.andWhere(
          "(content.title ILIKE :search OR content.description ILIKE :search)",
          { search: `%${search}%` }
        );
      }

      queryBuilder.orderBy("content.createdAt", "DESC");

      const contents = await queryBuilder.getMany();

      res.json({ contents });
    } catch (error) {
      console.error("Get content error:", error);
      res.status(500).json({ error: "Failed to fetch content" });
    }
  }

  /**
   * Get content by ID
   * GET /api/content/:id
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const content = await contentRepository.findOne({
        where: { id: id as string },
        relations: ["teacher"],
      });

      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }

      // Check access (will be handled by access control endpoint)
      // For now, just return content metadata
      res.json({ content });
    } catch (error) {
      console.error("Get content by ID error:", error);
      res.status(500).json({ error: "Failed to fetch content" });
    }
  }

  /**
   * Update content (Teacher/Admin only)
   * PUT /api/content/:id
   */
  static async update(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const content = await contentRepository.findOne({
        where: { id },
      });

      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }

      // Check ownership or admin
      if (content.teacherId !== userId && userRole !== "admin") {
        return res.status(403).json({ error: "Not authorized to update this content" });
      }

      const {
        title,
        description,
        language,
        isPaid,
        price,
        subject,
        grade,
        isDownloadable,
        isPublished,
        thumbnailUrl,
      } = req.body;

      // Update fields
      if (title !== undefined) content.title = title;
      if (description !== undefined) content.description = description;
      if (language !== undefined) content.language = language;
      if (subject !== undefined) content.subject = subject;
      if (grade !== undefined) content.grade = grade;
      if (thumbnailUrl !== undefined) content.thumbnailUrl = thumbnailUrl;
      if (isDownloadable !== undefined)
        content.isDownloadable = isDownloadable === "true" || isDownloadable === true;
      if (isPublished !== undefined)
        content.isPublished = isPublished === "true" || isPublished === true;

      if (isPaid !== undefined) {
        content.isPaid = isPaid === "true" || isPaid === true;
        if (content.isPaid && price !== undefined) {
          content.price = parseFloat(price);
        } else if (!content.isPaid) {
          content.price = undefined;
        }
      } else if (price !== undefined && content.isPaid) {
        content.price = parseFloat(price);
      }

      await contentRepository.save(content);

      res.json({
        message: "Content updated successfully",
        content,
      });
    } catch (error) {
      console.error("Update content error:", error);
      res.status(500).json({ error: "Failed to update content" });
    }
  }

  /**
   * Delete content (Teacher/Admin only)
   * DELETE /api/content/:id
   */
  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const content = await contentRepository.findOne({
        where: { id },
      });

      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }

      // Check ownership or admin
      if (content.teacherId !== userId && userRole !== "admin") {
        return res.status(403).json({ error: "Not authorized to delete this content" });
      }

      // Delete file from storage
      await fileStorageService.deleteFile(content.fileUrl);

      // Delete content record
      await contentRepository.remove(content);

      res.json({ message: "Content deleted successfully" });
    } catch (error) {
      console.error("Delete content error:", error);
      res.status(500).json({ error: "Failed to delete content" });
    }
  }

  /**
   * Check content access (for students)
   * GET /api/content/:id/access
   */
  static async checkAccess(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const content = await contentRepository.findOne({
        where: { id },
      });

      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }

      // Teacher/Admin always has access
      if (userRole === "instructor" || userRole === "admin") {
        return res.json({
          hasAccess: true,
          reason: "Teacher/Admin access",
        });
      }

      // Check if content is published
      if (!content.isPublished) {
        return res.json({
          hasAccess: false,
          reason: "Content is not published",
        });
      }

      // Free content: check enrollment (if linked to course)
      if (!content.isPaid) {
        // For now, free content is accessible to all enrolled students
        // TODO: Link content to specific courses for enrollment check
        return res.json({
          hasAccess: true,
          reason: "Free content",
        });
      }

      // Paid content: check payment
      if (userRole === "student" && userId) {
        const payment = await paymentRepository.findOne({
          where: {
            userId: userId,
            referenceId: id as string,
            paymentType: PaymentType.CONTENT_PURCHASE,
            paymentStatus: "completed" as any,
          },
        });

        if (payment) {
          return res.json({
            hasAccess: true,
            reason: "Payment completed",
          });
        }
      }

      return res.json({
        hasAccess: false,
        reason: "Payment required",
        price: content.price,
      });
    } catch (error) {
      console.error("Check access error:", error);
      res.status(500).json({ error: "Failed to check access" });
    }
  }

  /**
   * Get content download URL (access-controlled)
   * GET /api/content/:id/download
   */
  static async download(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const content = await contentRepository.findOne({
        where: { id },
      });

      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }

      // Check if downloadable
      if (!content.isDownloadable) {
        return res.status(403).json({ error: "Content is not downloadable" });
      }

      // Check access using the checkAccess logic
      let hasAccess = false;
      let accessReason = "";

      // Teacher/Admin always has access
      if (userRole === "instructor" || userRole === "admin") {
        hasAccess = true;
        accessReason = "Teacher/Admin access";
      } else if (!content.isPublished) {
        hasAccess = false;
        accessReason = "Content is not published";
      } else if (!content.isPaid) {
        hasAccess = true;
        accessReason = "Free content";
      } else if (userRole === "student" && userId) {
        const payment = await paymentRepository.findOne({
          where: {
            userId: userId,
            referenceId: id as string,
            paymentType: PaymentType.CONTENT_PURCHASE,
            paymentStatus: "completed" as any,
          },
        });

        if (payment) {
          hasAccess = true;
          accessReason = "Payment completed";
        } else {
          hasAccess = false;
          accessReason = "Payment required";
        }
      } else {
        hasAccess = false;
        accessReason = "Access denied";
      }

      if (!hasAccess) {
        return res.status(403).json({
          error: "Access denied",
          reason: accessReason,
          price: content.isPaid ? content.price : undefined,
        });
      }

      // Increment download count
      content.downloadCount += 1;
      await contentRepository.save(content);

      // Return file URL (in production, use signed URL for S3)
      const filePath = fileStorageService.getFilePath(content.fileUrl);

      // Check if file exists
      if (!fileStorageService.fileExists(content.fileUrl)) {
        return res.status(404).json({ error: "File not found on server" });
      }

      // Serve file
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error("File serve error:", err);
          if (!res.headersSent) {
            res.status(404).json({ error: "File not found" });
          }
        }
      });
    } catch (error) {
      console.error("Download content error:", error);
      res.status(500).json({ error: "Failed to download content" });
    }
  }

  /**
   * Increment view count
   * POST /api/content/:id/view
   */
  static async incrementView(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      const content = await contentRepository.findOne({
        where: { id },
      });

      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }

      content.viewCount += 1;
      await contentRepository.save(content);

      res.json({ viewCount: content.viewCount });
    } catch (error) {
      console.error("Increment view error:", error);
      res.status(500).json({ error: "Failed to increment view count" });
    }
  }
}

