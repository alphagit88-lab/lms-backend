import { Router } from "express";
import { CourseController } from "../controllers/CourseController";
import { authenticate, isInstructorOrAdmin } from "../middleware/authMiddleware";
import { courseMediaUpload } from "../middleware/courseMediaUpload";

const router = Router();

// Public/Student routes
router.get("/", CourseController.getAll);
router.get("/my-courses", authenticate, isInstructorOrAdmin, CourseController.getMyCourses);
router.get("/:id", CourseController.getById);

// Instructor/Admin routes
router.post("/upload-media", authenticate, isInstructorOrAdmin, courseMediaUpload.single("file"), CourseController.uploadMedia);
router.delete("/delete-media", authenticate, isInstructorOrAdmin, CourseController.deleteMedia);
router.post("/", authenticate, isInstructorOrAdmin, CourseController.create);
router.put("/:id", authenticate, isInstructorOrAdmin, CourseController.update);
router.delete("/:id", authenticate, isInstructorOrAdmin, CourseController.delete);
router.patch("/:id/publish", authenticate, isInstructorOrAdmin, CourseController.togglePublish);

export default router;
