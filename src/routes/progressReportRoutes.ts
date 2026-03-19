import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { ProgressReportController } from "../controllers/ProgressReportController";

const router = Router();

router.use(authenticate);

router.get("/", ProgressReportController.getReports);
router.get("/:id", ProgressReportController.getReportById);
router.post("/:id/share", ProgressReportController.shareWithParents);

export default router;
