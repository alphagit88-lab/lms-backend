import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import express from "express";
import { paymentController } from "../controllers/PaymentController";

const router = Router();

// Endpoint for creating an intent. We specifically use express.json() here since global parsing is disabled prior.
router.post("/create-intent", authenticate, express.json(), paymentController.createIntent);

// Endpoint for Stripe to hit our webhook
// Must not parse body to JSON, Stripe needs the raw Buffer!
router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    paymentController.webhook
);

// History
router.get("/history", authenticate, paymentController.getMyPayments);
router.get("/transactions", authenticate, paymentController.getTransactions);
router.get("/earnings", authenticate, paymentController.getTeacherEarnings);

export default router;
