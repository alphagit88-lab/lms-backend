import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { authenticate, isAdmin } from "../middleware/authMiddleware";

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(isAdmin);

// Teacher verification routes
router.get("/teachers/pending", AdminController.getPendingTeachers);
router.patch("/teachers/:id/verify", AdminController.verifyTeacher);
router.patch("/teachers/:id/reject", AdminController.rejectTeacher);

export default router;

