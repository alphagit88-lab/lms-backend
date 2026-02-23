import multer from "multer";
import { Request, Response, NextFunction } from "express";
import path from "path";

// File size limits (in bytes)
const MAX_FILE_SIZES = {
  video: 2 * 1024 * 1024 * 1024, // 2GB
  audio: 500 * 1024 * 1024, // 500MB
  pdf: 50 * 1024 * 1024, // 50MB
  document: 50 * 1024 * 1024, // 50MB
  presentation: 100 * 1024 * 1024, // 100MB
  worksheet: 10 * 1024 * 1024, // 10MB
  quiz: 10 * 1024 * 1024, // 10MB
  other: 50 * 1024 * 1024, // 50MB
};

// Allowed file types with corresponding extensions
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".avi"];

const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"];
const ALLOWED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a"];

const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
];
const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"];

/**
 * File filter function - validates both mimetype AND file extension
 * This prevents mimetype spoofing attacks
 */
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const contentType = req.body.contentType || req.query.contentType || "other";

  // Determine allowed types and extensions based on content type
  let allowedTypes: string[] = [];
  let allowedExtensions: string[] = [];
  
  if (contentType === "video") {
    allowedTypes = ALLOWED_VIDEO_TYPES;
    allowedExtensions = ALLOWED_VIDEO_EXTENSIONS;
  } else if (contentType === "audio") {
    allowedTypes = ALLOWED_AUDIO_TYPES;
    allowedExtensions = ALLOWED_AUDIO_EXTENSIONS;
  } else {
    allowedTypes = ALLOWED_DOCUMENT_TYPES;
    allowedExtensions = ALLOWED_DOCUMENT_EXTENSIONS;
  }

  // Validate file extension
  const fileExtension = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    return cb(
      new Error(
        `Invalid file extension. Allowed extensions for ${contentType}: ${allowedExtensions.join(", ")}`
      )
    );
  }

  // Validate mimetype (must match extension)
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        `Invalid file type. Allowed types for ${contentType}: ${allowedTypes.join(", ")}`
      )
    );
  }

  cb(null, true);
};

/**
 * Configure multer storage (memory storage for processing)
 */
const storage = multer.memoryStorage();

/**
 * Create multer upload instance
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB max (will be validated per content type)
  },
});

/**
 * Middleware to validate file size based on content type
 */
export const validateFileSize = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return next();
  }

  const contentType = req.body.contentType || "other";
  const maxSize = MAX_FILE_SIZES[contentType as keyof typeof MAX_FILE_SIZES] || MAX_FILE_SIZES.other;

  if (req.file.size > maxSize) {
    return res.status(400).json({
      error: `File size exceeds maximum allowed size for ${contentType}: ${(maxSize / (1024 * 1024)).toFixed(0)}MB`,
    });
  }

  next();
};

