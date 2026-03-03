import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { authenticate, isAdmin } from "../middleware/authMiddleware";

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(isAdmin);

// Platform statistics
router.get("/stats", AdminController.getStats);

// User management
router.get("/users", AdminController.getUsers);
router.patch("/users/:id/toggle-active", AdminController.toggleUserActive);
router.delete("/users/:id", AdminController.deleteUser);

// Teacher verification
router.get("/teachers/pending", AdminController.getPendingTeachers);
router.patch("/teachers/:id/verify", AdminController.verifyTeacher);
router.patch("/teachers/:id/reject", AdminController.rejectTeacher);

// Payouts
router.get("/payouts", AdminController.getPayouts);
router.post("/payouts/:id/process", AdminController.processPayout);

// Payments & Enrollments
router.get("/payments", AdminController.getPayments);
router.get("/enrollments", AdminController.getEnrollments);

// Parent Management
router.get("/parent-links", AdminController.getParentLinks);
router.post("/parent-links", AdminController.createParentLink);
router.delete("/parent-links/:id", AdminController.removeParentLink);

export default router;
