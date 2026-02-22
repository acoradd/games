import { Request, Response } from "express";
import { getActiveGameModes, getGameModeBySlug } from "../services/gameMode.service.js";

export async function listGameModes(req: Request, res: Response) {
    try {
        const gameModes = await getActiveGameModes();
        res.json(gameModes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function getGameMode(req: Request, res: Response) {
    try {
        const gameMode = await getGameModeBySlug(req.params.slug);
        if (!gameMode) {
            res.status(404).json({ error: "Game mode not found" });
            return;
        }
        res.json(gameMode);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
}
