import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// On Vercel serverless, the filesystem is read-only except /tmp
const isVercel = !!process.env.VERCEL;
const COURSE_MEDIA_DIR = isVercel
    ? "/tmp/uploads/course-media"
    : path.join(process.cwd(), "uploads", "course-media");

try {
    if (!fs.existsSync(COURSE_MEDIA_DIR)) {
        fs.mkdirSync(COURSE_MEDIA_DIR, { recursive: true });
    }
} catch {
    // ignore directory creation errors on serverless if any
}

// Allowed file types (Images for thumbnail, Videos for preview, Documents for lessons)
const ALLOWED_TYPES = [
    "image/jpeg", "image/png", "image/webp", "image/gif", 
    "video/mp4", "video/webm", "video/quicktime",
    "application/pdf", 
    "application/msword", 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "audio/mpeg", "audio/wav", "audio/ogg"
];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov", ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".mp3", ".wav", ".ogg"];
const MAX_SIZE = 500 * 1024 * 1024; // 500MB

const storage = multer.memoryStorage();


const fileFilter = (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(new Error(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
        return cb(new Error(`Invalid MIME type: ${file.mimetype}`));
    }

    cb(null, true);
};

export const courseMediaUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_SIZE,
    },
});
