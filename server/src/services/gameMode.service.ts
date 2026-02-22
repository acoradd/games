import { prisma } from "../lib/prisma.js";

export async function getActiveGameModes() {
    return prisma.gameMode.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
    });
}

export async function getGameModeBySlug(slug: string) {
    return prisma.gameMode.findUnique({
        where: { slug },
    });
}
