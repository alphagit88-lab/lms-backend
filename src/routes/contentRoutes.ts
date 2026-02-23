import { Router } from "express";
import { ContentController } from "../controllers/ContentController";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { upload, validateFileSize } from "../middleware/uploadMiddleware";
import { uploadRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload content (instructor/admin only) with rate limiting
router.post(
  "/upload",
  uploadRateLimiter,
  authorize("instructor", "admin"),
  upload.single("file"),
  validateFileSize,
  ContentController.upload
);

// Get all content (with filters)
router.get("/", ContentController.getAll);

// Get content by ID
router.get("/:id", ContentController.getById);

// Check content access
router.get("/:id/access", ContentController.checkAccess);

// Get download URL (access-controlled)
router.get("/:id/download", ContentController.download);

// Increment view count
router.post("/:id/view", ContentController.incrementView);

// Update content (instructor/admin only, ownership check in controller)
router.put("/:id", authorize("instructor", "admin"), ContentController.update);

// Delete content (instructor/admin only, ownership check in controller)
router.delete("/:id", authorize("instructor", "admin"), ContentController.delete);

export default router;

