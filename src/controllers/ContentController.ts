import { Request, Response } from "express";
import * as fs from "fs";
import { AppDataSource } from "../config/data-source";
import { Content, ContentType, AcademicResourceType } from "../entities/Content";
import { FileStorageService } from "../services/FileStorageService";
import { Enrollment } from "../entities/Enrollment";
import { Payment, PaymentType } from "../entities/Payment";
import { Express } from "express";
import { validatePrice, validateStringLength } from "../utils/validation";
import { parsePagination, createPaginationMeta } from "../utils/pagination";
import { Logger } from "../utils/logger";

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
  static async upload(req: MulterRequest | Request, res: Response) {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let fileUrl: string | null = null;

    try {
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      if (userRole !== "instructor" && userRole !== "admin") {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(403).json({ error: "Only instructors can upload content" });
      }

      if (!req.file) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: "File is required" });
      }

      const {
        title,
        description,
        contentType,
        resourceType,
        language,
        isPaid,
        price,
        subject,
        grade,
        topic,
        isDownloadable,
        thumbnailUrl,
        isPublished,
        courseId,
      } = req.body;

      // Validation
      if (!title || !contentType) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: "Title and content type are required" });
      }

      // Validate title length (max 200 chars per entity)
      const titleValidation = validateStringLength(title, "Title", 200, 1);
      if (!titleValidation.isValid) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: titleValidation.error });
      }

      // Validate description length if provided (text field, but reasonable limit)
      if (description) {
        const descValidation = validateStringLength(description, "Description", 10000);
        if (!descValidation.isValid) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
          return res.status(400).json({ error: descValidation.error });
        }
      }

      if (!Object.values(ContentType).includes(contentType as ContentType)) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: "Invalid content type" });
      }

      const { AcademicResourceType } = await import("../entities/Content");
      if (resourceType && !Object.values(AcademicResourceType).includes(resourceType as AcademicResourceType)) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return res.status(400).json({ error: "Invalid resource type" });
      }

      // Validate price if content is paid
      if (isPaid === "true" || isPaid === true) {
        if (!price) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
          return res.status(400).json({ error: "Price is required for paid content" });
        }

        const priceValidation = validatePrice(price, 0, 1000000);
        if (!priceValidation.isValid) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
          return res.status(400).json({ error: priceValidation.error });
        }
      }

      // Save file first
      const fileResult = await fileStorageService.saveFile(
        req.file,
        contentType,
        userId!
      );
      fileUrl = fileResult.fileUrl;

      // Create content record within transaction
      const content = queryRunner.manager.create(Content, {
        teacherId: userId!,
        title,
        description: description || null,
        contentType: contentType as ContentType,
        resourceType: (resourceType as AcademicResourceType) || AcademicResourceType.OTHER,
        language: language || "english",
        fileUrl: fileResult.fileUrl,
        fileSize: fileResult.fileSize,
        thumbnailUrl: thumbnailUrl || null,
        isPaid: isPaid === "true" || isPaid === true,
        price: isPaid === "true" || isPaid === true ? parseFloat(price) : undefined,
        subject: subject || null,
        grade: grade || null,
        topic: topic || null,
        isDownloadable: isDownloadable !== "false" && isDownloadable !== false,
        // Honour the isPublished flag from the request; default to false so
        // drafts are safe, but allow callers to publish in one step.
        isPublished: isPublished === "true" || isPublished === true,
        courseId: courseId || null,
        metadata: {},
      });

      await queryRunner.manager.save(Content, content);
      await queryRunner.commitTransaction();

      res.status(201).json({
        message: "Content uploaded successfully",
        content,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      
      // Clean up uploaded file if database save failed
      if (fileUrl) {
        try {
          await fileStorageService.deleteFile(fileUrl);
        } catch (deleteError) {
          console.error("Failed to cleanup file after upload error:", deleteError);
        }
      }
      
      Logger.error("Content upload error:", error, req as Request);
      res.status(500).json({ error: "Failed to upload content" });
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get all content (with filters and pagination)
   * GET /api/content?teacherId=&type=&subject=&grade=&language=&isPaid=&page=&limit=
   */
  static async getAll(req: Request, res: Response) {
    try {
      const {
        teacherId,
        type,
        subject,
        grade,
        topic,
        resourceType,
        language,
        isPaid,
        isPublished,
        search,
      } = req.query;

      // Parse pagination parameters
      const pagination = parsePagination(req.query, 20, 100);

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

      if (topic) {
        queryBuilder.andWhere("content.topic ILIKE :topic", { topic: `%${topic}%` });
      }

      if (resourceType) {
        queryBuilder.andWhere("content.resourceType = :resourceType", { resourceType });
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

      // Get total count for pagination
      const totalCount = await queryBuilder.getCount();

      // Apply pagination
      queryBuilder.skip(pagination.offset).take(pagination.limit);

      const contents = await queryBuilder.getMany();

      // Create pagination metadata
      const paginationMeta = createPaginationMeta(
        pagination.page,
        pagination.limit,
        totalCount
      );

      res.json({
        contents,
        pagination: paginationMeta,
      });
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
        topic,
        resourceType,
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
      if (topic !== undefined) content.topic = topic;
      if (resourceType !== undefined) content.resourceType = resourceType as AcademicResourceType;
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

      // Delete file from storage (with error handling)
      let fileDeleted = false;
      try {
        await fileStorageService.deleteFile(content.fileUrl);
        fileDeleted = true;
      } catch (fileError: any) {
        // Log error but continue with database deletion
        console.error("Error deleting file during content deletion:", fileError);
        // If file doesn't exist, that's okay - continue with DB deletion
        if (fileError.code !== "ENOENT") {
          // For other errors, log but don't fail the request
          console.warn(`File deletion failed for ${content.fileUrl}, but continuing with database deletion`);
        }
      }

      // Delete content record
      await contentRepository.remove(content);

      res.json({
        message: "Content deleted successfully",
        fileDeleted,
      });
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
          canDownload: content.isDownloadable,
          reason: "Teacher/Admin access",
        });
      }

      // Check if content is published
      if (!content.isPublished) {
        return res.json({
          hasAccess: false,
          canDownload: false,
          reason: "Content is not published",
        });
      }

      // Require login for any content access
      if (!userId) {
        return res.json({
          hasAccess: false,
          canDownload: false,
          reason: "Login required",
        });
      }

      // Free content: open to all authenticated users
      if (!content.isPaid) {
        return res.json({
          hasAccess: true,
          canDownload: content.isDownloadable,
          reason: "Free content",
        });
      }

      // Paid content: check for a completed CONTENT_PURCHASE payment
      const payment = await paymentRepository.findOne({
        where: {
          userId,
          referenceId: id as string,
          paymentType: PaymentType.CONTENT_PURCHASE,
          paymentStatus: "completed" as any,
        },
      });

      if (payment) {
        return res.json({
          hasAccess: true,
          canDownload: content.isDownloadable,
          reason: "Payment completed",
        });
      }

      return res.json({
        hasAccess: false,
        canDownload: false,
        reason: "Purchase required",
        price: content.price,
        teacherId: content.teacherId,
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
   * Stream video/audio content with HTTP 206 range-request support
   * GET /api/content/:id/stream
   */
  static async stream(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const content = await contentRepository.findOne({ where: { id } });
      if (!content) return res.status(404).json({ error: "Content not found" });

      // Access control (mirrors checkAccess logic)
      let hasAccess = false;
      if (userRole === "instructor" || userRole === "admin") {
        hasAccess = true;
      } else if (content.isPublished && userId) {
        if (!content.isPaid) {
          hasAccess = true;
        } else {
          const payment = await paymentRepository.findOne({
            where: {
              userId,
              referenceId: id,
              paymentType: PaymentType.CONTENT_PURCHASE,
              paymentStatus: "completed" as any,
            },
          });
          hasAccess = !!payment;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied", reason: "Purchase required" });
      }

      const filePath = fileStorageService.getFilePath(content.fileUrl);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found on server" });
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      // Detect MIME type from file extension
      const ext = content.fileUrl.split(".").pop()?.toLowerCase() ?? "";
      const mimeTypes: Record<string, string> = {
        mp4: "video/mp4",
        webm: "video/webm",
        ogg: "video/ogg",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        pdf: "application/pdf",
      };
      const mimeType = mimeTypes[ext] ?? "application/octet-stream";

      const range = req.headers.range;

      if (!range) {
        // No range header: serve the whole file
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": mimeType,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Parse range header: "bytes=start-end"
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
        return res.end();
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } catch (error) {
      console.error("Stream content error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream content" });
      }
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

