import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// Public routes
router.post("/register", AuthController.register);
router.post("/login", AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/status", AuthController.checkStatus);

// Protected routes (require authentication)
router.get("/me", authenticate, AuthController.getCurrentUser);
router.put("/profile", authenticate, AuthController.updateProfile);
router.put("/change-password", authenticate, AuthController.changePassword);

export default router;
