import { Router } from "express";
import { authenticate, authorize, isInstructorOrAdmin } from "../middleware/authMiddleware";
import express from "express";
import { paymentController } from "../controllers/PaymentController";
import { bankSlipUpload } from "../middleware/bankSlipUpload";

const router = Router();

router.get("/test-role", (req, res) => res.json({ role: req.session.userRole }));

// ── Shared Payment Listing ──────────────────────────────────────────────────
// Used by both Admins (all) and Instructors (filtered).
router.get("/list", authenticate, authorize("instructor", "admin"), (req, res) => paymentController.getPayments(req, res));
// ─────────────────────────────────────────────────────────────────────────────

// Initialize a PayHere payment session — returns checkout params for frontend redirect
router.post("/create-intent", authenticate, express.json(), paymentController.createIntent.bind(paymentController));

// Initialize a combined PayHere payment for multiple courses
router.post("/create-bulk-intent", authenticate, express.json(), paymentController.createBulkIntent.bind(paymentController));

// ── Bank-transfer (manual payment) routes ────────────────────────────────────
// Order matters: specific paths before /:paymentId generics
router.post("/bank-transfer/create-intent",      authenticate, express.json(), paymentController.createBankTransferIntent.bind(paymentController));
router.post("/bank-transfer/create-bulk-intent", authenticate, express.json(), paymentController.createBulkBankTransferIntent.bind(paymentController));
router.get( "/bank-transfer/pending",            authenticate, authorize("instructor", "admin"), (req, res) => paymentController.getPendingManualPayments(req, res));
router.post("/bank-transfer/:paymentId/upload-slip", authenticate, bankSlipUpload.single("slip"), paymentController.uploadBankSlip.bind(paymentController));
router.post("/bank-transfer/:paymentId/review",  authenticate, authorize("instructor", "admin"), express.json(), (req, res) => paymentController.reviewManualPayment(req, res));
// ─────────────────────────────────────────────────────────────────────────────

// PayHere server-to-server notify endpoint (called by PayHere after payment)
// Receives application/x-www-form-urlencoded — no auth, verified by MD5 signature
router.post(
    "/payhere-notify",
    express.urlencoded({ extended: false }),
    paymentController.payhereNotify
);

// Payment history & earnings
router.get("/history",      authenticate, paymentController.getMyPayments);
router.get("/transactions", authenticate, paymentController.getTransactions);
router.get("/earnings",     authenticate, (req, res) => paymentController.getTeacherEarnings(req, res));

// Status check & manual verification
router.get("/:id/status", authenticate, (req, res) => paymentController.getPaymentStatus(req, res));
router.post("/:id/verify", authenticate, express.json(), (req, res) => paymentController.verifyPayment(req, res));

// Refund request — students for own booking payments, admin for any payment
router.post("/refund", authenticate, express.json(), paymentController.processRefund.bind(paymentController));

router.post(
    "/:paymentId/confirm",
    authenticate,
    authorize("instructor", "admin"),
    express.json(),
    (req, res) => paymentController.manualConfirm(req, res)
);

router.post(
    "/:paymentId/cancel",
    authenticate,
    authorize("instructor", "admin"),
    express.json(),
    (req, res) => paymentController.manualCancel(req, res)
);

export default router;

