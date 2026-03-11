import { Router } from "express";
import { SubmissionController } from "../controllers/SubmissionController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// Get an exam for a student (strips out correct answers)
router.get(
    "/exam/:examId",
    authenticate,
    SubmissionController.getExamForStudent
);

// Submit answers for an exam
router.post(
    "/exam/:examId",
    authenticate,
    SubmissionController.submitExam
);

// Get a student's submission history for a particular exam
router.get(
    "/exam/:examId/history",
    authenticate,
    SubmissionController.getSubmissionHistory
);

// Save draft answers (auto-save without submitting)
router.post(
    "/exam/:examId/save-draft",
    authenticate,
    SubmissionController.saveDraft
);

export default router;
