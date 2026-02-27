import { Router } from "express";
import { UserController } from "../controllers/UserController";
import { authenticate, isAdmin } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);
router.use(isAdmin);

router.get("/users", UserController.getAllUsers);
router.get("/users/:id", UserController.getUserById);
router.post("/users", UserController.createUser);
router.put("/users/:id", UserController.updateUser);
router.delete("/users/:id", UserController.deleteUser);

export default router;
