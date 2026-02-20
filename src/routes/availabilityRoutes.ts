import { Router } from "express";
import { AvailabilityController } from "../controllers/AvailabilityController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Public routes (students can view teacher availability)
router.get("/slots/teacher/:teacherId", AvailabilityController.getTeacherSlots);
router.get("/weekly/:teacherId", AvailabilityController.getWeeklyAvailability);

// Teacher only routes
router.post(
  "/slots",
  authenticate,
  authorize("instructor"),
  AvailabilityController.createSlot
);

router.post(
  "/recurring",
  authenticate,
  authorize("instructor"),
  AvailabilityController.createRecurringSlots
);

router.get(
  "/slots/my",
  authenticate,
  authorize("instructor"),
  AvailabilityController.getMySlots
);

router.put(
  "/slots/:id",
  authenticate,
  authorize("instructor"),
  AvailabilityController.updateSlot
);

router.delete(
  "/slots/:id",
  authenticate,
  authorize("instructor"),
  AvailabilityController.deleteSlot
);

router.post(
  "/slots/:id/block",
  authenticate,
  authorize("instructor"),
  AvailabilityController.blockSlot
);

router.post(
  "/slots/:id/unblock",
  authenticate,
  authorize("instructor"),
  AvailabilityController.unblockSlot
);

router.post(
  "/recurring/cancel",
  authenticate,
  authorize("instructor"),
  AvailabilityController.cancelFutureRecurring
);

export default router;
