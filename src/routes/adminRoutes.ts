import { Router } from "express";
import express from "express";
import { AdminController } from "../controllers/AdminController";
import { authenticate, isAdmin } from "../middleware/authMiddleware";
import { paymentController } from "../controllers/PaymentController";

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
router.get("/payments/bank-transfer/pending", paymentController.getPendingManualPayments.bind(paymentController));
router.post("/payments/bank-transfer/:paymentId/review", express.json(), paymentController.reviewManualPayment.bind(paymentController));
router.post("/payments/:paymentId/confirm", express.json(), paymentController.manualConfirm.bind(paymentController));
router.post("/payments/:paymentId/cancel", express.json(), paymentController.manualCancel.bind(paymentController));
router.get("/enrollments", AdminController.getEnrollments);

// Parent Management
router.get("/parent-links", AdminController.getParentLinks);
router.get("/parent-links/pending", AdminController.getPendingParentLinks);
router.patch("/parent-links/:id/approve", AdminController.approveParentLink);
router.patch("/parent-links/:id/reject", AdminController.rejectParentLink);
router.post("/parent-links", AdminController.createParentLink);
router.delete("/parent-links/:id", AdminController.removeParentLink);

export default router;
