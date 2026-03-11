import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import express from "express";
import { paymentController } from "../controllers/PaymentController";
import { bankSlipUpload } from "../middleware/bankSlipUpload";

const router = Router();

// Initialize a PayHere payment session — returns checkout params for frontend redirect
router.post("/create-intent", authenticate, express.json(), paymentController.createIntent.bind(paymentController));

// Initialize a combined PayHere payment for multiple courses
router.post("/create-bulk-intent", authenticate, express.json(), paymentController.createBulkIntent.bind(paymentController));

// ── Bank-transfer (manual payment) routes ────────────────────────────────────
// Order matters: specific paths before /:paymentId generics
router.post("/bank-transfer/create-intent",      authenticate, express.json(), paymentController.createBankTransferIntent.bind(paymentController));
router.post("/bank-transfer/create-bulk-intent", authenticate, express.json(), paymentController.createBulkBankTransferIntent.bind(paymentController));
router.get( "/bank-transfer/pending",            authenticate, authorize("admin", "instructor"), paymentController.getPendingManualPayments.bind(paymentController));
router.post("/bank-transfer/:paymentId/upload-slip", authenticate, bankSlipUpload.single("slip"), paymentController.uploadBankSlip.bind(paymentController));
router.post("/bank-transfer/:paymentId/review",  authenticate, authorize("admin", "instructor"), express.json(), paymentController.reviewManualPayment.bind(paymentController));
// ─────────────────────────────────────────────────────────────────────────────

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

// Refund request — students for own booking payments, admin for any payment
router.post("/refund", authenticate, express.json(), paymentController.processRefund.bind(paymentController));

// Manual payment confirmation (Admin only — for dev/localhost use)
router.post(
    "/:paymentId/confirm",
    authenticate,
    authorize("admin"),
    express.json(),
    paymentController.manualConfirm
);

export default router;

