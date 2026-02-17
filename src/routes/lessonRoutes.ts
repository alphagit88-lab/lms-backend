import { Router } from "express";
import { LessonController } from "../controllers/LessonController";
import { authenticate, isInstructorOrAdmin } from "../middleware/authMiddleware";

const router = Router();

// Get lessons (requires appropriate access)
router.get("/courses/:courseId/lessons", LessonController.getByCourse);
router.get("/:id", LessonController.getById);

// Instructor/Admin routes
router.post("/courses/:courseId/lessons", authenticate, isInstructorOrAdmin, LessonController.create);
router.put("/:id", authenticate, isInstructorOrAdmin, LessonController.update);
router.delete("/:id", authenticate, isInstructorOrAdmin, LessonController.delete);
router.put("/courses/:courseId/lessons/reorder", authenticate, isInstructorOrAdmin, LessonController.reorder);

export default router;
