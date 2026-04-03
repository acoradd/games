import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";

const BCRYPT_ROUNDS = 10;

export async function getProfile(playerId: number) {
    const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true, username: true, createdAt: true, lastSeenAt: true },
    });
    if (!player) throw new Error("NOT_FOUND");
    return player;
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
        include: { player: { select: { username: true } } },
    });

    const coByGameId = new Map<string, { username: string; result: string; score: number }[]>();
    for (const cs of coSessions) {
        const list = coByGameId.get(cs.gameId) ?? [];
        list.push({ username: cs.player.username, result: cs.result, score: cs.score });
        coByGameId.set(cs.gameId, list);
    }

    return mySessions.map((s) => ({
        ...s,
        coPlayers: coByGameId.get(s.gameId) ?? [],
    }));
}

export async function recordGameSessions(
    slug: string,
    playerIdMap: Record<string, number>,
    roundPoints: Record<string, number>,
    explicitWinners?: string[]
) {
    const sessionIds = Object.keys(playerIdMap);
    if (sessionIds.length === 0) return;

    let winners: string[];
    if (explicitWinners !== undefined) {
        winners = explicitWinners;
    } else {
        const scores = sessionIds.map((sid) => roundPoints[sid] ?? 0);
        const maxScore = Math.max(...scores);
        winners = sessionIds.filter((sid) => (roundPoints[sid] ?? 0) === maxScore && maxScore > 0);
    }

    const gameId = randomUUID();
    await prisma.gameSession.createMany({
        data: sessionIds
            .filter((sid) => playerIdMap[sid] !== undefined)
            .map((sid) => ({
                gameId,
                playerId: playerIdMap[sid]!,
                gameModeSlug: slug,
                result: winners.includes(sid) ? "win" : "loss",
                score: roundPoints[sid] ?? 0,
            })),
    });
}
