import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const isVercel = !!process.env.VERCEL;
const PROFILE_PICS_DIR = isVercel
    ? "/tmp/uploads/profile-pictures"
    : path.join(process.cwd(), "uploads", "profile-pictures");

// Ensure directory exists immediately so diskStorage doesn't throw
try {
    if (!fs.existsSync(PROFILE_PICS_DIR)) {
        fs.mkdirSync(PROFILE_PICS_DIR, { recursive: true });
    }
} catch { /* ignore on serverless if it somehow fails */ }

// Allowed image types
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Multer storage configuration for profile pictures
 */
const storage = multer.memoryStorage();


/**
 * File filter — only allow image files
 */
const fileFilter = (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        return cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}`));
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        return cb(new Error(`Invalid MIME type: ${file.mimetype}`));
    }

    cb(null, true);
};

/**
 * Multer instance for profile picture uploads
 * Field name: "profilePicture"
 */
export const profilePictureUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_IMAGE_SIZE,
    },
});
