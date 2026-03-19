import { Router } from "express";
import { GradingController } from "../controllers/GradingController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// === Instructor Grading Routes ===

// Get all submissions for an exam (instructor view)
router.get(
    "/exam/:examId/submissions",
    authenticate,
    authorize("instructor", "admin"),
    GradingController.getSubmissionsForExam
);

// Grade an individual answer
router.put(
    "/submissions/:submissionId/grade",
    authenticate,
    authorize("instructor", "admin"),
    GradingController.gradeAnswer
);

// Finalize grading for a master submission
router.put(
    "/submissions/:submissionId/finalize",
    authenticate,
    authorize("instructor", "admin"),
    GradingController.finalizeGrading
);

// Publish exam scores to students
router.patch(
    "/exam/:examId/publish-scores",
    authenticate,
    authorize("instructor", "admin"),
    GradingController.publishScores
);

// === Student Result Routes ===

// Get my graded result for an exam
router.get(
    "/exam/:examId/my-result",
    authenticate,
    GradingController.getMyResult
);

// === OCR & PDF Routes ===

// Trigger OCR processing on a submission (instructor only)
router.post(
    "/submissions/:submissionId/ocr",
    authenticate,
    authorize("instructor", "admin"),
    GradingController.processOCR
);

// Download submission as PDF (instructor or student)
router.get(
    "/submissions/:submissionId/pdf",
    authenticate,
    GradingController.downloadPDF
);

export default router;
