import { Router } from "express";
import { NotificationController } from "../controllers/NotificationController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// All notification routes require authentication
router.use(authenticate);

router.get("/", NotificationController.getNotifications);
router.get("/unread-count", NotificationController.getUnreadCount);
router.patch("/read-all", NotificationController.markAllRead);
router.patch("/:id/read", NotificationController.markRead);
router.delete("/:id", NotificationController.deleteNotification);

export default router;
