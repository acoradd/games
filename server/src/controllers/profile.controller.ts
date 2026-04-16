import { Request, Response } from "express";
import { getProfile, changePassword, getGameSessions, updateEmail, updateDisplayName, deleteAccount, updateSettings } from "../services/profile.service.js";

type AuthedRequest = Request & { player: { playerId: number; username: string } };

export async function getMe(req: Request, res: Response) {
    const { playerId } = (req as AuthedRequest).player;
    try {
        const player = await getProfile(playerId);
        res.json(player);
    } catch {
        res.status(404).json({ error: "Player not found" });
    }
}

export async function updatePassword(req: Request, res: Response) {
    const { playerId } = (req as AuthedRequest).player;
    const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "currentPassword and newPassword are required" });
        return;
    }

    try {
        await changePassword(playerId, currentPassword, newPassword);
        res.json({ ok: true });
    } catch (err) {
        if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
            res.status(401).json({ error: "Mot de passe actuel incorrect" });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function putEmail(req: Request, res: Response) {
    const { playerId } = (req as AuthedRequest).player;
    const { email } = req.body as { email?: string | null };

    try {
        await updateEmail(playerId, email ?? null);
        res.json({ ok: true });
    } catch (err) {
        if (err instanceof Error && err.message === "INVALID_EMAIL") {
            res.status(400).json({ error: "Format d'email invalide" });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function putDisplayName(req: Request, res: Response) {
    const { playerId } = (req as AuthedRequest).player;
    const { displayName } = req.body as { displayName?: string };

    if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
        res.status(400).json({ error: "displayName est requis" });
        return;
    }

    const trimmed = displayName.trim().slice(0, 32);

    try {
        await updateDisplayName(playerId, trimmed);
        res.json({ ok: true, displayName: trimmed });
    } catch (err) {
        if (err instanceof Error && err.message === "DISPLAY_NAME_TAKEN") {
            res.status(409).json({ error: "Ce pseudo est déjà pris" });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function putSettings(req: Request, res: Response) {
    const { playerId } = (req as AuthedRequest).player;
    const { colorblindMode } = req.body as { colorblindMode?: boolean };

    try {
        await updateSettings(playerId, { colorblindMode });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: "Internal server error" });
    }
}

export async function getSessions(req: Request, res: Response) {
    const { playerId } = (req as AuthedRequest).player;
    const sessions = await getGameSessions(playerId);
    res.json(sessions);
}

export async function deleteMe(req: Request, res: Response) {
    const { playerId } = (req as AuthedRequest).player;
    try {
        await deleteAccount(playerId);
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: "Internal server error" });
    }
}
