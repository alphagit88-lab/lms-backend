import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// On Vercel serverless, the filesystem is read-only except /tmp
const isVercel = !!process.env.VERCEL;

/**
 * File Storage Service
 * Currently uses local file system storage
 * Can be extended to support AWS S3 or other cloud storage
 */
export class FileStorageService {
  private uploadDir: string;

  constructor() {
    // Use /tmp on Vercel (read-only filesystem), otherwise use 'uploads'
    this.uploadDir = isVercel
      ? "/tmp/uploads"
      : (process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
    this.ensureUploadDirectories();
  }

  /**
   * Ensure upload directories exist
   */
  private ensureUploadDirectories(): void {
    const dirs = [
      this.uploadDir,
      path.join(this.uploadDir, "videos"),
      path.join(this.uploadDir, "documents"),
      path.join(this.uploadDir, "images"),
      path.join(this.uploadDir, "thumbnails"),
    ];

    dirs.forEach((dir) => {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch {
        // Silently ignore on serverless — directories may not be writable
      }
    });
  }

  /**
   * Get directory based on content type
   */
  private getContentTypeDir(contentType: string): string {
    const typeMap: { [key: string]: string } = {
      video: "videos",
      audio: "videos", // Store audio in videos folder
      pdf: "documents",
      document: "documents",
      presentation: "documents",
      worksheet: "documents",
      quiz: "documents",
      other: "documents",
    };

    return typeMap[contentType.toLowerCase()] || "documents";
  }

  /**
   * Save file to local storage
   */
  async saveFile(
    file: MulterFile,
    contentType: string,
    teacherId: string
  ): Promise<{ fileUrl: string; fileSize: number; fileName: string }> {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${randomUUID()}${fileExtension}`;
    const contentTypeDir = this.getContentTypeDir(contentType);
    const teacherDir = path.join(this.uploadDir, contentTypeDir, teacherId);

    // Ensure teacher directory exists
    try {
      if (!fs.existsSync(teacherDir)) {
        fs.mkdirSync(teacherDir, { recursive: true });
      }
    } catch {
      // On serverless, directory creation may fail
    }

    const filePath = path.join(teacherDir, fileName);
    const fileUrl = `/uploads/${contentTypeDir}/${teacherId}/${fileName}`;

    // Write file to disk
    await fs.promises.writeFile(filePath, file.buffer);

    return {
      fileUrl,
      fileSize: file.size,
      fileName,
    };
  }

  /**
   * Delete file from storage
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Remove /uploads prefix to get relative path
      const relativePath = fileUrl.replace(/^\/uploads\//, "");
      const filePath = path.join(this.uploadDir, relativePath);

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      // Don't throw - file might already be deleted
    }
  }

  /**
   * Get file path for serving
   */
  getFilePath(fileUrl: string): string {
    const relativePath = fileUrl.replace(/^\/uploads\//, "");
    return path.join(this.uploadDir, relativePath);
  }

  /**
   * Check if file exists
   */
  fileExists(fileUrl: string): boolean {
    try {
      const filePath = this.getFilePath(fileUrl);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Get file size
   */
  async getFileSize(fileUrl: string): Promise<number> {
    try {
      const filePath = this.getFilePath(fileUrl);
      const stats = await fs.promises.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }
}
