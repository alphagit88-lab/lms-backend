import { Router, Request, Response, NextFunction } from "express";
import { RecordingController } from "../controllers/RecordingController";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { sessionRecordingUpload } from "../middleware/sessionRecordingUpload";

const router = Router();

// Wrapper to handle Multer errors gracefully and ensure JSON response
const uploadWrapper = (req: Request, res: Response, next: NextFunction) => {
    sessionRecordingUpload.fields([
        { name: 'videoFile', maxCount: 1 },
        { name: 'thumbnailFile', maxCount: 1 }
    ])(req, res, (err: any) => {
        if (err) {
            console.error("[Multer for Recording Error]", err);
            // Determine status code based on error type
            const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
            return res.status(status).json({
                error: "File upload failed",
                details: err.message || String(err),
                code: err.code
            });
        }
        next();
    });
};

// All routes require authentication
router.use(authenticate);

// Create recording (instructor/admin only)
router.post("/", authorize("instructor", "admin"), uploadWrapper, RecordingController.create);

// Get all recordings (with filters)
router.get("/", RecordingController.getAll);

// Get recording by ID
router.get("/:id", RecordingController.getById);

// Update recording (instructor/admin only, ownership check in controller)
router.put("/:id", authorize("instructor", "admin"), uploadWrapper, RecordingController.update);

// Delete recording (instructor/admin only, ownership check in controller)
router.delete("/:id", authorize("instructor", "admin"), RecordingController.delete);

// Sync recording from Zoom manually
router.post("/sync/:sessionId", authorize("instructor", "admin"), RecordingController.syncWithZoom);

export default router;

