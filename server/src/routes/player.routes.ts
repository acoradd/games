import { Router } from "express";
import { createAnonymous } from "../controllers/player.controller.js";

const router = Router();

router.post("/anonymous", createAnonymous);

export default router;
