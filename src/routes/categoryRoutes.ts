import { Router } from "express";
import { CategoryController } from "../controllers/CategoryController";
import { authenticate, isAdmin, isInstructorOrAdmin } from "../middleware/authMiddleware";

const router = Router();

// Public routes
router.get("/", CategoryController.getAll);
router.get("/:id", CategoryController.getById);

// Admin / Instructor routes
router.post("/", authenticate, isInstructorOrAdmin, CategoryController.create);
router.put("/:id", authenticate, isInstructorOrAdmin, CategoryController.update);
router.delete("/:id", authenticate, isAdmin, CategoryController.delete);

export default router;
