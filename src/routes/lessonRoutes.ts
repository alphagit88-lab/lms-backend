import { Router, Request, Response, NextFunction } from "express";
import { LessonController } from "../controllers/LessonController";
import { authenticate, isInstructorOrAdmin } from "../middleware/authMiddleware";
import { courseMediaUpload } from "../middleware/courseMediaUpload";

const router = Router();

// Wrapper to handle Multer errors gracefully and ensure JSON response
const uploadWrapper = (req: Request, res: Response, next: NextFunction) => {
  courseMediaUpload.single("videoFile")(req, res, (err: any) => {
    if (err) {
      console.error("[Multer Error]", err);
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

// Get lessons (requires appropriate access)
router.get("/courses/:courseId/lessons", LessonController.getByCourse);
router.get("/:id", LessonController.getById);

// Instructor/Admin routes
router.post(
  "/courses/:courseId/lessons", 
  authenticate, 
  isInstructorOrAdmin, 
  uploadWrapper, 
  LessonController.create
);
router.put(
  "/:id", 
  authenticate, 
  isInstructorOrAdmin, 
  uploadWrapper, 
  LessonController.update
);
router.delete("/:id", authenticate, isInstructorOrAdmin, LessonController.delete);
router.put("/courses/:courseId/lessons/reorder", authenticate, isInstructorOrAdmin, LessonController.reorder);

export default router;
