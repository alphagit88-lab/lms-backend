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

// Allowed file types (Images for thumbnail, Videos for preview)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm"];
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        // Log destination path for debugging
        console.log(`[Multer] Saving file to: ${COURSE_MEDIA_DIR}`);
        
        // Ensure directory exists just in case
        if (!fs.existsSync(COURSE_MEDIA_DIR)) {
            try {
                fs.mkdirSync(COURSE_MEDIA_DIR, { recursive: true });
                console.log(`[Multer] Created directory: ${COURSE_MEDIA_DIR}`);
            } catch (err) {
                console.error("Failed to create course media directory:", err);
                // Return error to callback instead of ignoring
                return cb(err as Error, COURSE_MEDIA_DIR); 
            }
        }
        cb(null, COURSE_MEDIA_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${crypto.randomUUID()}${ext}`;
        cb(null, uniqueName);
    },
});

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
