import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme_dev";

export async function createAnonymousPlayer(username: string) {
    const player = await prisma.player.create({
        data: {
            username,
            isAnonymous: true,
        },
    });

    const token = jwt.sign(
        { playerId: player.id, username: player.username },
        JWT_SECRET,
        { expiresIn: "30d" }
    );

    return { player, token };
}

export function verifyToken(token: string) {
    return jwt.verify(token, JWT_SECRET) as { playerId: number; username: string };
}
