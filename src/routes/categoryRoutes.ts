import { Router } from "express";
import { CategoryController } from "../controllers/CategoryController";
import { authenticate, isAdmin } from "../middleware/authMiddleware";

const router = Router();

// Public routes
router.get("/", CategoryController.getAll);
router.get("/:id", CategoryController.getById);

// Admin routes
router.post("/", authenticate, isAdmin, CategoryController.create);
router.put("/:id", authenticate, isAdmin, CategoryController.update);
router.delete("/:id", authenticate, isAdmin, CategoryController.delete);

export default router;
