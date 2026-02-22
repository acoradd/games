import { Request, Response } from "express";
import { createAnonymousPlayer } from "../services/player.service.js";

export async function createAnonymous(req: Request, res: Response) {
    const { username } = req.body as { username?: string };

    if (!username || typeof username !== "string" || username.trim().length === 0) {
        res.status(400).json({ error: "username is required" });
        return;
    }

    const trimmed = username.trim().slice(0, 32);

    try {
        const result = await createAnonymousPlayer(trimmed);
        res.status(201).json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
}
