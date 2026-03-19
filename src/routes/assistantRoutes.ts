import { Router } from "express";
import { AssistantController } from "../controllers/AssistantController";
import { authenticate, isInstructor } from "../middleware/authMiddleware";

const router = Router();

// Teacher routes (requires instructor role)
router.post("/add", authenticate, isInstructor, AssistantController.addAssistant);
router.get("/my-assistants", authenticate, isInstructor, AssistantController.getMyAssistants);
router.patch("/:id/permissions", authenticate, isInstructor, AssistantController.updatePermissions);
router.delete("/:id", authenticate, isInstructor, AssistantController.removeAssistant);

// Assistant routes (any authenticated user can be an assistant)
router.get("/my-teachers", authenticate, AssistantController.getMyTeachers);

export default router;
