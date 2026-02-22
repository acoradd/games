import { Router } from "express";
import { listGameModes, getGameMode } from "../controllers/gameMode.controller.js";

const router = Router();

router.get("/", listGameModes);
router.get("/:slug", getGameMode);

export default router;
