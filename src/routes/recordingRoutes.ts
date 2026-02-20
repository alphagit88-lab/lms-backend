import { Router } from "express";
import { RecordingController } from "../controllers/RecordingController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create recording (instructor/admin only)
router.post("/", authorize("instructor", "admin"), RecordingController.create);

// Get all recordings (with filters)
router.get("/", RecordingController.getAll);

// Get recording by ID
router.get("/:id", RecordingController.getById);

// Update recording (instructor/admin only, ownership check in controller)
router.put("/:id", authorize("instructor", "admin"), RecordingController.update);

// Delete recording (instructor/admin only, ownership check in controller)
router.delete("/:id", authorize("instructor", "admin"), RecordingController.delete);

export default router;

