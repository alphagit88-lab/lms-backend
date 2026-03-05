import { Router } from "express";
import { EnrollmentController } from "../controllers/EnrollmentController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// All routes require authentication
router.get("/", authenticate, EnrollmentController.getMyEnrollments);
router.post("/bulk", authenticate, EnrollmentController.bulkEnroll);
router.post("/", authenticate, EnrollmentController.enroll);
router.get("/:id", authenticate, EnrollmentController.getById);
router.delete("/:id", authenticate, EnrollmentController.unenroll);

// Progress tracking
router.get("/:enrollmentId/progress", authenticate, EnrollmentController.getProgress);
router.post("/:enrollmentId/lessons/:lessonId/progress", authenticate, EnrollmentController.updateLessonProgress);

// Course enrollments (for instructors)
router.get("/courses/:courseId/enrollments", authenticate, EnrollmentController.getCourseEnrollments);

export default router;
