/**
 * Import words from examples/OpenLexicon.tsv into the Word table.
 *
 * Usage (from /server):
 *   npm run import:words
 *
 * TSV columns used:
 *   0  ortho              — word form
 *   2  Lexique4__Lemme    — lemma
 *   3  Lexique4__Cgram    — grammatical category
 *   5  Lexique4__FreqOrtho — frequency per million
 *   7  Lexique4__IsLem    — 1 if this row IS the lemma
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TSV_PATH = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "OpenLexicon.tsv"
);

const GUESSABLE_CGRAMS = new Set(["NOM", "ADJ", "VER", "ADV"]);
const NON_LEMME_CGRAMS = new Set(["NOM", "ADJ"]);
const BATCH_SIZE = 1000;

function normalizeWord(word: string): string {
    return word
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/g, "");
}

interface WordEntry {
    text: string;
    length: number;
    frequency: number;
    isGuessable: boolean;
}

async function main() {
    const existing = await prisma.word.count();
    if (existing > 0) {
        console.log(`Words already imported (${existing} entries), skipping.`);
        return;
    }

    console.log(`Reading TSV from: ${TSV_PATH}`);

    if (!fs.existsSync(TSV_PATH)) {
        console.error(`File not found: ${TSV_PATH}`);
        process.exit(1);
    }

    const guessableSet = new Set<string>();
    // First pass: collect all guessable word texts
    {
        const rl = readline.createInterface({
            input: fs.createReadStream(TSV_PATH, { encoding: "utf8" }),
            crlfDelay: Infinity,
        });

        let firstLine = true;
        for await (const line of rl) {
            if (firstLine) { firstLine = false; continue; } // skip header
            const cols = line.split("\t");
            if (cols.length < 8) continue;

            const ortho = cols[0]!.trim();
            const cgram = cols[3]!.trim();
            const isLem = cols[7]!.trim();

            if (!GUESSABLE_CGRAMS.has(cgram)) continue;
            if (isLem !== "1") continue;

            const normalized = normalizeWord(ortho);
            if (!normalized || normalized.length < 3) continue;
            if (normalized !== ortho.toLowerCase().replace(/\s/g, "").replace(/[^a-z]/g, "") && normalized.length < 1) continue;

            guessableSet.add(normalized);
        }
    }

    console.log(`First pass: ${guessableSet.size} guessable words found`);

    // Second pass: build full word map
    const wordMap = new Map<string, WordEntry>();

    {
        const rl = readline.createInterface({
            input: fs.createReadStream(TSV_PATH, { encoding: "utf8" }),
            crlfDelay: Infinity,
        });

        let firstLine = true;
        for await (const line of rl) {
            if (firstLine) { firstLine = false; continue; }
            const cols = line.split("\t");
            if (cols.length < 8) continue;

            const ortho = cols[0]!.trim();
            const lemme = cols[2]!.trim();
            const cgram = cols[3]!.trim();
            const freqStr = cols[5]!.trim();
            const isLem = cols[7]!.trim();

            const normalized = normalizeWord(ortho);
            if (!normalized || normalized.length < 3) continue;

            const frequency = parseFloat(freqStr) || 0;

            // Pass 1 result: isGuessable=true entries
            if (GUESSABLE_CGRAMS.has(cgram) && isLem === "1" && guessableSet.has(normalized)) {
                const existing = wordMap.get(normalized);
                if (!existing || existing.isGuessable === false) {
                    wordMap.set(normalized, {
                        text: normalized,
                        length: normalized.length,
                        frequency,
                        isGuessable: true,
                    });
                } else if (existing.isGuessable && frequency > existing.frequency) {
                    // keep highest frequency
                    existing.frequency = frequency;
                }
                continue;
            }

            // Pass 2: isGuessable=false (inflected forms whose lemma is guessable)
            if (NON_LEMME_CGRAMS.has(cgram) && isLem === "0") {
                const normalizedLemme = normalizeWord(lemme);
                if (!guessableSet.has(normalizedLemme)) continue;
                if (wordMap.has(normalized)) continue; // already registered as guessable
                wordMap.set(normalized, {
                    text: normalized,
                    length: normalized.length,
                    frequency,
                    isGuessable: false,
                });
            }
        }
    }

    console.log(`Total entries to upsert: ${wordMap.size}`);

    // Batch upsert
    const entries = Array.from(wordMap.values());
    let inserted = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
            batch.map((w) =>
                prisma.word.upsert({
                    where: { text: w.text },
                    update: {
                        length: w.length,
                        frequency: w.frequency,
                        isGuessable: w.isGuessable,
                    },
                    create: w,
                })
            )
        );
        inserted += batch.length;
        if (inserted % 10000 === 0 || inserted === entries.length) {
            console.log(`  Upserted ${inserted}/${entries.length} words…`);
        }
    }

    const guessableCount = entries.filter((w) => w.isGuessable).length;
    const nonGuessableCount = entries.filter((w) => !w.isGuessable).length;
    console.log(`Done! ${guessableCount} guessable, ${nonGuessableCount} valid-input-only`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
