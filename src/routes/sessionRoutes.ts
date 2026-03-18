import { Router } from "express";
import { SessionController } from "../controllers/SessionController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// All session routes require authentication
router.use(authenticate);

// GET /api/sessions/upcoming - Get upcoming sessions for current user
router.get("/upcoming", SessionController.getUpcomingSessions);

// GET /api/sessions - Get sessions with filters (type=upcoming|past, status)
router.get("/", SessionController.getSessions);

// POST /api/sessions - Create an ad-hoc session (Teacher/Admin only)
router.post(
    "/",
    authorize("instructor", "admin"),
    SessionController.createSession
);

// GET /api/sessions/:id - Get session details
router.get("/:id", SessionController.getSessionById);

// PATCH /api/sessions/:id/start - Mark session as in_progress (Teacher only)
router.patch(
    "/:id/start",
    authorize("instructor"),
    SessionController.startSession
);

// PATCH /api/sessions/:id/end - Mark session as completed (Teacher only)
router.patch(
    "/:id/end",
    authorize("instructor"),
    SessionController.endSession
);

// DELETE /api/sessions/:id - Cancel a session (Teacher/Admin only)
router.delete(
    "/:id",
    authorize("instructor", "admin"),
    SessionController.cancelSession
);

export default router;
