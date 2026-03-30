import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// On Vercel serverless, the filesystem is read-only except /tmp
const isVercel = !!process.env.VERCEL;
const RECORDING_MEDIA_DIR = isVercel
    ? "/tmp/uploads/session-recordings"
    : path.join(process.cwd(), "uploads", "session-recordings");

try {
    if (!fs.existsSync(RECORDING_MEDIA_DIR)) {
        fs.mkdirSync(RECORDING_MEDIA_DIR, { recursive: true });
    }
} catch {
    // ignore directory creation errors on serverless if any
}

// Allowed file types
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/x-matroska", "video/quicktime"]; // .mp4, .webm, .mkv, .mov
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]; // .jpg, .png, .webp, .gif
const MAX_SIZE = 500 * 1024 * 1024; // 500MB

const storage = multer.memoryStorage();


const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.fieldname === "videoFile") {
        if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid video type. Allowed types: ${ALLOWED_VIDEO_TYPES.join(", ")}`));
        }
    } else if (file.fieldname === "thumbnailFile") {
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid image type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`));
        }
    } else {
        cb(new Error("Unexpected field"));
    }
};

export const sessionRecordingUpload = multer({
    storage,
    limits: {
        fileSize: MAX_SIZE, 
    },
    fileFilter,
});
