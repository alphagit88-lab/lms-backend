import { Router } from "express";
import { UploadController } from "../controllers/UploadController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// Route specifically for Vercel Blob client uploads
router.post("/blob", authenticate, UploadController.handleClientUpload);

export default router;