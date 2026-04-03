import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { getMe, updatePassword, getSessions } from "../controllers/profile.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/me", getMe);
router.put("/me/password", updatePassword);
router.get("/me/sessions", getSessions);

export default router;
