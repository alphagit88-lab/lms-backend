import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController";
import { authenticate, authorize, isAdmin } from "../middleware/authMiddleware";

const router = Router();

// Student profile routes
router.put(
  "/student",
  authenticate,
  authorize("student"),
  ProfileController.updateStudentProfile
);

router.get(
  "/student/:studentId",
  authenticate,
  ProfileController.getStudentProfile
);

// Teacher profile routes
router.put(
  "/teacher",
  authenticate,
  authorize("instructor"),
  ProfileController.updateTeacherProfile
);

router.get("/teacher/me", authenticate, authorize("instructor"), ProfileController.getMyTeacherProfile);
router.get("/teacher/:teacherId", ProfileController.getTeacherProfile);

router.get("/teachers/verified", ProfileController.getVerifiedTeachers);

router.post(
  "/teacher/:teacherId/verify",
  authenticate,
  isAdmin,
  ProfileController.verifyTeacher
);

// Parent profile routes
router.put(
  "/parent",
  authenticate,
  authorize("parent"),
  ProfileController.updateParentProfile
);

router.get(
  "/parent",
  authenticate,
  authorize("parent"),
  ProfileController.getParentProfile
);

export default router;
