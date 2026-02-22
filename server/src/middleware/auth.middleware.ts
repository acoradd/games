import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/player.service.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid authorization header" });
        return;
    }

    const token = authHeader.slice(7);

    try {
        const payload = verifyToken(token);
        (req as Request & { player: typeof payload }).player = payload;
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}
