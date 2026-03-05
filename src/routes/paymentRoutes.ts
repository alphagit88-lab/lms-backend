import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import express from "express";
import { paymentController } from "../controllers/PaymentController";

const router = Router();

// Initialize a PayHere payment session — returns checkout params for frontend redirect
router.post("/create-intent", authenticate, express.json(), paymentController.createIntent);

// PayHere server-to-server notify endpoint (called by PayHere after payment)
// Receives application/x-www-form-urlencoded — no auth, verified by MD5 signature
router.post(
    "/payhere-notify",
    express.urlencoded({ extended: false }),
    paymentController.payhereNotify
);

// Payment history & earnings
router.get("/history", authenticate, paymentController.getMyPayments);
router.get("/transactions", authenticate, paymentController.getTransactions);
router.get("/earnings", authenticate, paymentController.getTeacherEarnings);

// Manual payment confirmation (Admin only — for dev/localhost use)
router.post(
    "/:paymentId/confirm",
    authenticate,
    authorize("admin"),
    express.json(),
    paymentController.manualConfirm
);

export default router;

