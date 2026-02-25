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
                mode:    { type: "select", options: ["Tron", "Snake"], default: "Tron", label: "Mode" },
                rounds:  { type: "select", options: ["1", "3", "5", "7"], default: "1", label: "Manches" },
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
                lives:      { type: "range",  min: 1, max: 5, default: 1,          label: "Vies" },
                bombCount:  { type: "range",  min: 1, max: 3, default: 1,          label: "Bombes initiales" },
                bombRange:  { type: "range",  min: 1, max: 4, default: 2,          label: "Portée initiale" },
                bombSpeed:  { type: "range",  min: 1, max: 5, default: 3,          label: "Vitesse des bombes" },
                mapSize:    { type: "select", options: ["Petite", "Normale", "Grande"], default: "Normale", label: "Carte" },
                powerUps:   { type: "toggle", default: true,                       label: "Power-ups" },
                rounds:     { type: "select", options: ["1", "3", "5", "7"], default: "1", label: "Manches" },
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
                pairs:        { type: "select", options: ["8", "12", "16", "24"],        default: "12", label: "Nombre de paires" },
                turnTimeout:  { type: "select", options: ["10", "15", "30", "60", "0"], default: "30", label: "Temps par tour (s, 0=∞)" },
                rounds:       { type: "select", options: ["1", "3", "5", "7"], default: "1", label: "Manches" },
            },
        },
        {
            name: "Motus",
            slug: "motus",
            description: "Devinez le mot mystère avant vos adversaires en un minimum d'essais.",
            minPlayers: 1,
            maxPlayers: 8,
            isActive: true,
            options: {
                mode:          { type: "select", options: ["vs", "coop"],                          default: "vs",     label: "Mode" },
                difficulty:    { type: "select", options: ["easy", "medium", "hard", "expert"],    default: "medium", label: "Difficulté" },
                minWordLength: { type: "range",  min: 3, max: 16,                                  default: 5,        label: "Longueur min" },
                maxWordLength: { type: "range",  min: 3, max: 16,                                  default: 10,       label: "Longueur max" },
                maxAttempts:   { type: "select", options: ["4", "6", "8", "10", "0"],              default: "6",      label: "Essais max (0=∞)" },
                timeLimit:     { type: "select", options: ["30", "60", "90", "120", "0"],          default: "0",      label: "Temps/manche (s)" },
                rounds:        { type: "select", options: ["1", "3", "5", "7"],                    default: "1",      label: "Manches" },
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
