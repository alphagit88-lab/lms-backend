import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { authenticate } from "../middleware/authMiddleware";
import { authRateLimiter, registerRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// Public routes with rate limiting
router.post("/register", registerRateLimiter, AuthController.register);
router.post("/login", authRateLimiter, AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/status", AuthController.checkStatus);

// Protected routes (require authentication)
router.get("/me", authenticate, AuthController.getCurrentUser);
router.put("/profile", authenticate, AuthController.updateProfile);
router.put("/change-password", authenticate, AuthController.changePassword);

export default router;
