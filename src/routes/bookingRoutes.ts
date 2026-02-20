import { Router } from "express";
import { BookingController } from "../controllers/BookingController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Student/Parent routes
router.post("/", authenticate, BookingController.createBooking);

router.get("/my", authenticate, BookingController.getMyBookings);

router.get(
  "/student/:studentId",
  authenticate,
  authorize("parent"),
  BookingController.getStudentBookings
);

// Package booking routes (must be before /:id params)
router.post("/package", authenticate, BookingController.createPackageBooking);
router.get("/packages", authenticate, BookingController.getMyPackages);
router.get("/packages/:id", authenticate, BookingController.getPackageById);

router.get("/:id/cancellation-policy", authenticate, BookingController.getCancellationPolicy);

router.put("/:id/cancel", authenticate, BookingController.cancelBooking);

// Teacher routes
router.get(
  "/teacher",
  authenticate,
  authorize("instructor"),
  BookingController.getTeacherBookings
);

router.put(
  "/:id/confirm",
  authenticate,
  authorize("instructor"),
  BookingController.confirmBooking
);

router.put(
  "/:id/complete",
  authenticate,
  authorize("instructor"),
  BookingController.completeBooking
);

router.put(
  "/:id/no-show",
  authenticate,
  authorize("instructor"),
  BookingController.markNoShow
);

export default router;
