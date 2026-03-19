import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// On Vercel serverless, the filesystem is read-only except /tmp
const isVercel = !!process.env.VERCEL;
const BANK_SLIPS_DIR = isVercel
    ? "/tmp/uploads/bank-slips"
    : path.join(process.cwd(), "uploads", "bank-slips");

if (!isVercel) {
    try {
        if (!fs.existsSync(BANK_SLIPS_DIR)) {
            fs.mkdirSync(BANK_SLIPS_DIR, { recursive: true });
        }
    } catch { /* ignore on serverless */ }
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_EXTS  = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = isVercel
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, BANK_SLIPS_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${crypto.randomUUID()}${ext}`);
        },
    });

const fileFilter = (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext) || !ALLOWED_TYPES.includes(file.mimetype)) {
        return cb(new Error("Only JPEG, PNG, WEBP, and PDF files are accepted for bank slips."));
    }
    cb(null, true);
};

export const bankSlipUpload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });
