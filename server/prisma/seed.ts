import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const gameModes = [
        {
            name: "Tron",
            slug: "tron",
            description: "Course de moto-lumière : éliminez vos adversaires en les forçant à percuter votre traînée.",
            minPlayers: 2,
            maxPlayers: 4,
            isActive: true,
        },
        {
            name: "Bomberman",
            slug: "bomberman",
            description: "Posez des bombes stratégiquement pour éliminer vos adversaires et survivre dans l'arène.",
            minPlayers: 2,
            maxPlayers: 4,
            isActive: true,
        },
        {
            name: "Memory",
            slug: "memory",
            description: "Retournez les cartes et trouvez les paires avant vos adversaires pour marquer le plus de points.",
            minPlayers: 2,
            maxPlayers: 4,
            isActive: true,
        },
        {
            name: "Motus",
            slug: "motus",
            description: "Devinez le mot mystère avant vos adversaires en un minimum d'essais.",
            minPlayers: 2,
            maxPlayers: 8,
            isActive: true,
        },
    ];

    for (const gm of gameModes) {
        await prisma.gameMode.upsert({
            where: { slug: gm.slug },
            update: gm,
            create: gm,
        });
    }

    console.log("Seeded game modes:", gameModes.map((g) => g.slug).join(", "));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
