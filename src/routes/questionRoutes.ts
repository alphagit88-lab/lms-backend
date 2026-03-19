import { Router } from "express";
import { ExamController } from "../controllers/ExamController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Update a specific question
router.put(
    "/:id",
    authenticate,
    authorize("instructor"),
    ExamController.updateQuestion
);

// Delete a specific question
router.delete(
    "/:id",
    authenticate,
    authorize("instructor"),
    ExamController.deleteQuestion
);

export default router;
