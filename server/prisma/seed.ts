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
            options: {
                speed:   { type: "range",  min: 1, max: 5, default: 3,        label: "Vitesse" },
                mapSize: { type: "select", options: ["Petite", "Moyenne", "Grande"], default: "Moyenne", label: "Carte" },
            },
        },
        {
            name: "Bomberman",
            slug: "bomberman",
            description: "Posez des bombes stratégiquement pour éliminer vos adversaires et survivre dans l'arène.",
            minPlayers: 2,
            maxPlayers: 4,
            isActive: true,
            options: {
                lives:     { type: "range", min: 1, max: 5, default: 3, label: "Vies" },
                bombCount: { type: "range", min: 1, max: 3, default: 1, label: "Bombes initiales" },
                powerUps:  { type: "toggle", default: true,              label: "Power-ups" },
            },
        },
        {
            name: "Memory",
            slug: "memory",
            description: "Retournez les cartes et trouvez les paires avant vos adversaires pour marquer le plus de points.",
            minPlayers: 2,
            maxPlayers: 4,
            isActive: true,
            options: {
                pairs: { type: "select", options: ["8", "12", "16", "24"], default: "12", label: "Nombre de paires" },
            },
        },
        {
            name: "Motus",
            slug: "motus",
            description: "Devinez le mot mystère avant vos adversaires en un minimum d'essais.",
            minPlayers: 2,
            maxPlayers: 8,
            isActive: true,
            options: {
                wordLength: { type: "range", min: 5, max: 8, default: 6,  label: "Longueur du mot" },
                timeLimit:  { type: "range", min: 30, max: 120, default: 60, step: 10, label: "Temps (s)" },
            },
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
