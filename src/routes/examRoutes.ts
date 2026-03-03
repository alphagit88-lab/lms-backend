import { Router } from "express";
import { ExamController } from "../controllers/ExamController";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { upload, validateContentType, validateFileSize } from "../middleware/uploadMiddleware";

const router = Router();

// ==== Exam Routes ====

// Create an exam (Instructors only)
router.post(
    "/",
    authenticate,
    authorize("instructor"),
    ExamController.createExam
);

// Get all exams for current instructor
router.get(
    "/my-exams",
    authenticate,
    authorize("instructor"),
    ExamController.getMyExams
);

// Get all exams for a course (Students & Instructors)
router.get(
    "/course/:courseId",
    authenticate,
    ExamController.getExamsForCourse
);

// Get a specific exam by ID
router.get(
    "/:id",
    authenticate,
    ExamController.getExamById
);

// Update an exam Details
router.put(
    "/:id",
    authenticate,
    authorize("instructor"),
    ExamController.updateExam
);

// Delete an exam
router.delete(
    "/:id",
    authenticate,
    authorize("instructor"),
    ExamController.deleteExam
);

// Publish an exam
router.patch(
    "/:id/publish",
    authenticate,
    authorize("instructor"),
    ExamController.publishExam
);

// ==== Question Routes (Nested logically but accessible flatly for updates) ====

// Create a question for a specific exam
router.post(
    "/:examId/questions",
    authenticate,
    authorize("instructor"),
    ExamController.createQuestion
);

// Get all questions for a specific exam
router.get(
    "/:examId/questions",
    authenticate,
    ExamController.getQuestionsForExam
);

// Note: To match standard REST and avoid deeply nested URLs, 
// question updates/deletes should ideal be on a separate router (e.g. /api/questions).
// But as per requested routes in requirements "/api/questions/:id" we will export them, 
// wait, we can just export the question routes in this file since they are bundled.

// Upload handwritten answer for a question
router.post(
    "/:examId/questions/:questionId/upload",
    authenticate,
    upload.single("file"),
    validateFileSize,
    validateContentType,
    ExamController.uploadHandwrittenAnswer
);

export default router;
