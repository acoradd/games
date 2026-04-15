import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { createHash } from "crypto";
import { prisma } from "../lib/prisma.js";

function gravatarUrl(email: string | null): string | null {
    if (!email) return null;
    const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
    return `https://www.gravatar.com/avatar/${hash}?d=retro&s=128`;
}

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme_dev";
const BCRYPT_ROUNDS = 10;

export async function registerPlayer(username: string, password: string) {
    const existing = await prisma.player.findFirst({ where: { username } });
    if (existing) {
        throw new Error("USERNAME_TAKEN");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const player = await prisma.player.create({
        data: {
            username,
            displayName: username,
            passwordHash,
        },
    });

    const token = jwt.sign(
        { playerId: player.id, username: player.username },
        JWT_SECRET,
        { expiresIn: "30d" }
    );

    const { passwordHash: _, ...safePlayer } = player;
    return { player: { ...safePlayer, gravatarUrl: gravatarUrl(safePlayer.email) }, token };
}

export async function loginPlayer(username: string, password: string) {
    const player = await prisma.player.findFirst({ where: { username } });
    if (!player) {
        throw new Error("INVALID_CREDENTIALS");
    }

    const valid = await bcrypt.compare(password, player.passwordHash);
    if (!valid) {
        throw new Error("INVALID_CREDENTIALS");
    }

    await prisma.player.update({
        where: { id: player.id },
        data: { lastSeenAt: new Date() },
    });

    const token = jwt.sign(
        { playerId: player.id, username: player.username },
        JWT_SECRET,
        { expiresIn: "30d" }
    );

    const { passwordHash: _, ...safePlayer } = player;
    return { player: { ...safePlayer, gravatarUrl: gravatarUrl(safePlayer.email) }, token };
}

export function verifyToken(token: string) {
    return jwt.verify(token, JWT_SECRET) as { playerId: number; username: string };
}
