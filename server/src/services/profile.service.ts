import bcrypt from "bcrypt";
import { randomUUID, createHash } from "crypto";
import { prisma } from "../lib/prisma.js";

function gravatarUrl(email: string | null): string | null {
    if (!email) return null;
    const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
    return `https://www.gravatar.com/avatar/${hash}?d=retro&s=128`;
}

const BCRYPT_ROUNDS = 10;

export async function getProfile(playerId: number) {
    const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true, username: true, displayName: true, email: true, createdAt: true, lastSeenAt: true },
    });
    if (!player) throw new Error("NOT_FOUND");
    return { ...player, gravatarUrl: gravatarUrl(player.email) };
}

export async function updateDisplayName(playerId: number, newDisplayName: string) {
    const existing = await prisma.player.findFirst({ where: { displayName: newDisplayName } });
    if (existing && existing.id !== playerId) {
        throw new Error("DISPLAY_NAME_TAKEN");
    }
    await prisma.player.update({
        where: { id: playerId },
        data: { displayName: newDisplayName },
    });
}

export async function updateEmail(playerId: number, email: string | null) {
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("INVALID_EMAIL");
    }
    await prisma.player.update({
        where: { id: playerId },
        data: { email: email ?? null },
    });
}

export async function changePassword(playerId: number, currentPassword: string, newPassword: string) {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error("NOT_FOUND");

    const valid = await bcrypt.compare(currentPassword, player.passwordHash);
    if (!valid) throw new Error("INVALID_CREDENTIALS");

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.player.update({ where: { id: playerId }, data: { passwordHash } });
}

export async function getGameSessions(playerId: number) {
    const mySessions = await prisma.gameSession.findMany({
        where: { playerId },
        orderBy: { playedAt: "desc" },
        take: 50,
    });

    if (mySessions.length === 0) return [];

    const gameIds = mySessions.map((s) => s.gameId);
    const coSessions = await prisma.gameSession.findMany({
        where: { gameId: { in: gameIds }, NOT: { playerId } },
        include: { player: { select: { username: true, email: true } } },
    });

    const coByGameId = new Map<string, { username: string; result: string; score: number; gravatarUrl: string | null }[]>();
    for (const cs of coSessions) {
        const list = coByGameId.get(cs.gameId) ?? [];
        list.push({ username: cs.player.username, result: cs.result, score: cs.score, gravatarUrl: gravatarUrl(cs.player.email) });
        coByGameId.set(cs.gameId, list);
    }

    return mySessions.map((s) => ({
        ...s,
        coPlayers: coByGameId.get(s.gameId) ?? [],
    }));
}

export async function deleteAccount(playerId: number) {
    await prisma.gameSession.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });
}

export async function recordGameSessions(
    slug: string,
    playerIds: string[],
    roundPoints: Record<string, number>,
    explicitWinners?: string[]
) {
    if (playerIds.length === 0) return;

    let winners: string[];
    if (explicitWinners !== undefined) {
        winners = explicitWinners;
    } else {
        const scores   = playerIds.map((id) => roundPoints[id] ?? 0);
        const maxScore = Math.max(...scores);
        winners = playerIds.filter((id) => (roundPoints[id] ?? 0) === maxScore && maxScore > 0);
    }

    const gameId = randomUUID();
    await prisma.gameSession.createMany({
        data: playerIds.map((id) => ({
            gameId,
            playerId:     parseInt(id, 10),
            gameModeSlug: slug,
            result:       winners.includes(id) ? "win" : "loss",
            score:        roundPoints[id] ?? 0,
        })),
    });
}
