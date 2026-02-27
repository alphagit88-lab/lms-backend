import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { authenticate } from "../middleware/authMiddleware";
import { authRateLimiter, registerRateLimiter, passwordResetRateLimiter } from "../middleware/rateLimiter";
import { profilePictureUpload } from "../middleware/profilePictureUpload";

const router = Router();

// Public routes with rate limiting
router.post("/register", registerRateLimiter, AuthController.register);
router.post("/login", authRateLimiter, AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/status", AuthController.checkStatus);
router.post("/forgot-password", passwordResetRateLimiter, AuthController.forgotPassword);
router.post("/reset-password", passwordResetRateLimiter, AuthController.resetPassword);

// Protected routes (require authentication)
router.get("/me", authenticate, AuthController.getCurrentUser);
router.put("/profile", authenticate, AuthController.updateProfile);
router.put("/change-password", authenticate, AuthController.changePassword);

// Profile picture
router.post("/profile-picture", authenticate, profilePictureUpload.single("profilePicture"), AuthController.uploadProfilePicture);
router.delete("/profile-picture", authenticate, AuthController.deleteProfilePicture);

export default router;
