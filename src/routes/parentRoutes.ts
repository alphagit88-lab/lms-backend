import { Router } from "express";
import { ParentController } from "../controllers/ParentController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Parent operations - require parent role
router.post(
  "/link-student",
  authenticate,
  authorize("parent"),
  ParentController.linkStudent
);

router.get(
  "/my-students",
  authenticate,
  authorize("parent"),
  ParentController.getMyStudents
);

router.get(
  "/student/:studentId/progress",
  authenticate,
  authorize("parent"),
  ParentController.getStudentProgress
);

// Student operations - require student role
router.get(
  "/pending-requests",
  authenticate,
  authorize("student"),
  ParentController.getPendingRequests
);

router.post(
  "/respond-link",
  authenticate,
  authorize("student"),
  ParentController.respondToLink
);

router.get(
  "/my-parents",
  authenticate,
  authorize("student"),
  ParentController.getMyParents
);

// Shared operations - both parent and student can unlink
router.delete(
  "/unlink/:linkId",
  authenticate,
  ParentController.unlinkStudent
);

export default router;
