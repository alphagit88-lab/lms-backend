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
  image: 10 * 1024 * 1024, // 10MB
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

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// All allowed types combined — used in fileFilter so we can accept ANY known
// valid file at this stage. Per-contentType enforcement happens AFTER multer
// has parsed req.body (see validateContentType below).
const ALL_ALLOWED_TYPES = [
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_AUDIO_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
  ...ALLOWED_IMAGE_TYPES,
];
const ALL_ALLOWED_EXTENSIONS = [
  ...ALLOWED_VIDEO_EXTENSIONS,
  ...ALLOWED_AUDIO_EXTENSIONS,
  ...ALLOWED_DOCUMENT_EXTENSIONS,
  ...ALLOWED_IMAGE_EXTENSIONS,
];

/**
 * File filter function — validates extension and MIME type against the full
 * set of known valid types.
 *
 * NOTE: req.body is NOT yet populated when multer calls this filter for a
 * multipart/form-data request (body fields are parsed alongside the file
 * stream). Do NOT read req.body.contentType here — use validateContentType
 * middleware below instead, which runs AFTER multer has finished parsing.
 */
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (!ALL_ALLOWED_EXTENSIONS.includes(fileExtension)) {
    return cb(
      new Error(
        `File type not allowed. Supported extensions: ${ALL_ALLOWED_EXTENSIONS.join(", ")}`
      )
    );
  }

  if (!ALL_ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(
        `MIME type not allowed: ${file.mimetype}`
      )
    );
  }

  cb(null, true);
};

/**
 * Middleware: validates that the uploaded file extension matches the declared
 * contentType from req.body.  Run this AFTER upload.single() so req.body is
 * fully available.
 */
export const validateContentType = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return next();
  }

  const contentType = (req.body.contentType as string || "other").toLowerCase();
  const ext = path.extname(req.file.originalname).toLowerCase();

  const mismatch = (
    (contentType === "video" && !ALLOWED_VIDEO_EXTENSIONS.includes(ext)) ||
    (contentType === "audio" && !ALLOWED_AUDIO_EXTENSIONS.includes(ext)) ||
    (contentType === "image" && !ALLOWED_IMAGE_EXTENSIONS.includes(ext)) ||
    (!((["video", "audio", "image"] as string[])).includes(contentType) && !ALLOWED_DOCUMENT_EXTENSIONS.includes(ext))
  );

  if (mismatch) {
    const allowed =
      contentType === "video" ? ALLOWED_VIDEO_EXTENSIONS :
      contentType === "audio" ? ALLOWED_AUDIO_EXTENSIONS :
      contentType === "image" ? ALLOWED_IMAGE_EXTENSIONS :
      ALLOWED_DOCUMENT_EXTENSIONS;
    return res.status(400).json({
      error: `Invalid file for content type "${contentType}". Allowed extensions: ${allowed.join(", ")}`,
    });
  }

  next();
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

