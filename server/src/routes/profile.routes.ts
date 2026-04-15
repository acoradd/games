import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { getMe, updatePassword, putEmail, putDisplayName, getSessions, deleteMe } from "../controllers/profile.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/me", getMe);
router.put("/me/password", updatePassword);
router.put("/me/email", putEmail);
router.put("/me/display-name", putDisplayName);
router.get("/me/sessions", getSessions);
router.delete("/me", deleteMe);

export default router;
