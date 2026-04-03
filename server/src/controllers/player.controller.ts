import { Request, Response } from "express";
import { registerPlayer, loginPlayer } from "../services/player.service.js";

export async function register(req: Request, res: Response) {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || typeof username !== "string" || username.trim().length === 0) {
        res.status(400).json({ error: "username is required" });
        return;
    }
    if (!password || typeof password !== "string" || password.length === 0) {
        res.status(400).json({ error: "password is required" });
        return;
    }

    try {
        const result = await registerPlayer(username.trim().slice(0, 32), password);
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof Error && err.message === "USERNAME_TAKEN") {
            res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris" });
            return;
        }
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function login(req: Request, res: Response) {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
        res.status(400).json({ error: "username and password are required" });
        return;
    }

    try {
        const result = await loginPlayer(username.trim(), password);
        res.json(result);
    } catch (err) {
        if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
            res.status(401).json({ error: "Nom d'utilisateur ou mot de passe incorrect" });
            return;
        }
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
}
