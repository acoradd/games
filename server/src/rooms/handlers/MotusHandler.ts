import { prisma } from "../../lib/prisma.js";
import type { GameHandler, RoomContext, RoundCarryOver } from "./GameHandler.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type MotusLetterResult = "correct" | "misplaced" | "absent";

interface MotusGuess {
    word:      string;
    result:    MotusLetterResult[];
    guesserId: string; // stable DB playerId (as string)
}

interface MotusPlayerState {
    guesses:    MotusGuess[];
    solved:     boolean;
    solvedAt:   number;
    eliminated: boolean;
}

interface MotusGameState {
    phase:         "playing" | "roundEnd" | "ended";
    mode:          "vs" | "coop";
    wordLength:    number;
    firstLetter:   string;
    secretWord:    string | null;
    maxAttempts:   number;
    roundDeadline: number;
    players:       Record<string, MotusPlayerState>;
    playerOrder:   string[];
    sharedGuesses: MotusGuess[];
    currentTurnId: string;
    playerNames:    Record<string, string>;
    playerAvatars:  Record<string, { username: string; gravatarUrl: string }>; // playerId → {username, gravatarUrl}
    currentRound:   number;
    maxRounds:      number;
    roundPoints:    Record<string, number>;
    roundWinnerIds: string[];
    roundStartedAt: number;
}

// ── Difficulty thresholds ─────────────────────────────────────────────────────

const DIFFICULTY_THRESHOLDS: Record<string, number | null> = {
    easy:   10,
    medium: 1,
    hard:   0.05,
    expert: null,
};

// ── Handler ───────────────────────────────────────────────────────────────────

export class MotusHandler implements GameHandler {
    private ctx: RoomContext;
    private secret = "";
    private roundTimer: { clear(): void } | null = null;
    private vsGuesses = new Map<string, MotusGuess[]>();

    constructor(ctx: RoomContext) {
        this.ctx = ctx;
    }

    async init(options: Record<string, unknown>, prevRound: RoundCarryOver | null): Promise<void> {
        const mode        = String(options["mode"]          ?? "vs") as "vs" | "coop";
        const difficulty  = String(options["difficulty"]    ?? "medium");
        const minLen      = Math.max(3, parseInt(String(options["minWordLength"] ?? "5"), 10));
        const maxLen      = Math.max(minLen, parseInt(String(options["maxWordLength"] ?? "10"), 10));
        const maxAttempts = parseInt(String(options["maxAttempts"] ?? "6"), 10);
        const timeLimit   = parseInt(String(options["timeLimit"]   ?? "0"), 10);

        const currentRound = prevRound?.currentRound ?? 1;
        const maxRounds    = prevRound?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number>  = { ...(prevRound?.roundPoints ?? {}) };
        const existingNames: Record<string, string> = prevRound?.playerNames ?? {};
        const existingAvatars: Record<string, { username: string; gravatarUrl: string }> = prevRound?.playerAvatars ?? {};

        const threshold = DIFFICULTY_THRESHOLDS[difficulty] ?? 1;
        const whereClause: Record<string, unknown> = { isGuessable: true, length: { gte: minLen, lte: maxLen } };
        if (threshold !== null) whereClause["frequency"] = { gte: threshold };

        const count = await prisma.word.count({ where: whereClause as Parameters<typeof prisma.word.count>[0]["where"] });
        if (count === 0) { console.error("[Motus] No words found"); return; }

        const skip    = Math.floor(Math.random() * count);
        const wordRow = await prisma.word.findFirst({
            where: whereClause as Parameters<typeof prisma.word.findFirst>[0]["where"],
            skip,
        });
        if (!wordRow) { console.error("[Motus] Could not pick a word"); return; }

        this.secret = wordRow.text;
        this.vsGuesses.clear();

        const playerIds = Array.from(this.ctx.getPlayers().keys())
            .filter(id => !this.ctx.getPlayers().get(id)?.isEliminated);

        const playerNames: Record<string, string> = { ...existingNames };
        const playerAvatars: Record<string, { username: string; gravatarUrl: string }> = { ...existingAvatars };
        playerIds.forEach(id => {
            this.vsGuesses.set(id, []);
            const p = this.ctx.getPlayers().get(id);
            if (p) {
                playerNames[id] = p.username;
                const dbId = this.ctx.getPlayerDbId(id);
                if (dbId) playerAvatars[dbId] = { username: p.username, gravatarUrl: p.gravatarUrl };
            }
        });

        const players: Record<string, MotusPlayerState> = {};
        playerIds.forEach(id => {
            players[id] = { guesses: [], solved: false, solvedAt: 0, eliminated: false };
        });

        // Build player order
        let playerOrder: string[];
        if (mode === "coop") {
            const prevOrder = prevRound?.playerOrder;
            if (prevOrder && prevOrder.length > 0) {
                const active = prevOrder.filter(id => playerIds.includes(id));
                playerOrder  = [...active.slice(1), active[0]!];
                playerIds.filter(id => !active.includes(id)).forEach(id => playerOrder.push(id));
            } else {
                playerOrder = [...playerIds];
                for (let i = playerOrder.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [playerOrder[i], playerOrder[j]] = [playerOrder[j]!, playerOrder[i]!];
                }
            }
        } else {
            playerOrder = playerIds;
        }

        const now = Date.now();
        const gs: MotusGameState = {
            phase: "playing",
            mode,
            wordLength:    wordRow.length,
            firstLetter:   wordRow.text[0]!,
            secretWord:    null,
            maxAttempts,
            roundDeadline: timeLimit > 0 ? now + timeLimit * 1000 : 0,
            players,
            playerOrder,
            sharedGuesses:  [],
            currentTurnId:  playerOrder[0] ?? "",
            playerNames,
            playerAvatars,
            currentRound,
            maxRounds,
            roundPoints,
            roundWinnerIds: [],
            roundStartedAt: now,
        };

        this.ctx.setState(JSON.stringify(gs));

        if (timeLimit > 0) {
            this.roundTimer?.clear();
            this.roundTimer = this.ctx.clock.setTimeout(() => {
                let current: MotusGameState;
                try { current = JSON.parse(this.ctx.getState()) as MotusGameState; }
                catch { return; }
                if (current.phase !== "playing") return;
                this.endRound(current, null);
                this.ctx.setState(JSON.stringify(current));
            }, timeLimit * 1000);
        }
    }

    async onMessage(type: string, sessionId: string, data: unknown): Promise<void> {
        if (type === "motus:guess") {
            await this.handleGuess(sessionId, (data as { word?: string }).word ?? "");
        } else if (type === "motus:typing") {
            this.handleTyping(sessionId, (data as { input?: string }).input ?? "");
        } else if (type === "forceEndRound") {
            this.handleForceEndRound(sessionId);
        }
    }

    onEliminate(sessionId: string): void {
        let gs: MotusGameState;
        try { gs = JSON.parse(this.ctx.getState()) as MotusGameState; }
        catch { return; }
        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const p = gs.players[sessionId];
        if (p) p.eliminated = true;

        if (gs.mode === "coop") {
            if (gs.currentTurnId === sessionId) gs.currentTurnId = this.nextCoopPlayer(gs);
            const activeCount = gs.playerOrder.filter(id => gs.players[id] && !gs.players[id]!.eliminated).length;
            if (activeCount === 0) this.endRound(gs, null);
        } else {
            const allDone = gs.playerOrder.every(id => {
                const player = gs.players[id];
                if (!player || player.eliminated) return true;
                return this.isPlayerDone(gs, id);
            });
            if (allDone) this.endRound(gs, null);
        }

        this.ctx.setState(JSON.stringify(gs));
    }

    dispose(): void {
        this.roundTimer?.clear();
        this.roundTimer = null;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async handleGuess(sessionId: string, word: string): Promise<void> {
        let gs: MotusGameState;
        try { gs = JSON.parse(this.ctx.getState()) as MotusGameState; }
        catch { return; }
        if (gs.phase !== "playing") return;

        const player = gs.players[sessionId];
        if (!player || player.eliminated) return;
        if (gs.mode === "coop" && sessionId !== gs.currentTurnId) return;
        if (gs.mode === "vs" && player.solved) return;

        const normalized = this.normalize(word);
        if (normalized.length !== gs.wordLength) return;
        if (normalized[0] !== gs.firstLetter) return;

        const wordExists = await prisma.word.findUnique({ where: { text: normalized } });
        if (!wordExists) {
            this.ctx.sendTo(sessionId, "motus:invalid", { reason: "unknown_word" });
            return;
        }

        const result   = this.computeResult(this.secret, normalized);
        const isSolved = result.every(r => r === "correct");

        if (gs.mode === "vs") {
            const privateGuesses = this.vsGuesses.get(sessionId) ?? [];
            privateGuesses.push({ word: normalized, result });
            this.vsGuesses.set(sessionId, privateGuesses);

            player.guesses.push({ word: "", result });
            if (isSolved) { player.solved = true; player.solvedAt = Date.now(); }

            const allDone = gs.playerOrder.every(id => {
                const p = gs.players[id];
                if (!p || p.eliminated) return true;
                return this.isPlayerDone(gs, id);
            });
            if (allDone) this.endRound(gs, null);

            this.ctx.setState(JSON.stringify(gs));
            this.ctx.sendTo(sessionId, "motus:myGuesses", privateGuesses);
        } else {
            // Coop
            const guesserId = this.ctx.getPlayerDbId(sessionId) ?? sessionId;
            gs.sharedGuesses.push({ word: normalized, result, guesserId });
            if (isSolved) {
                this.endRound(gs, sessionId);
            } else if (gs.maxAttempts > 0 && gs.sharedGuesses.length >= gs.maxAttempts) {
                this.endRound(gs, null);
            } else {
                gs.currentTurnId = this.nextCoopPlayer(gs);
            }
            this.ctx.setState(JSON.stringify(gs));
        }
    }

    private handleTyping(sessionId: string, input: string): void {
        let gs: MotusGameState;
        try { gs = JSON.parse(this.ctx.getState()) as MotusGameState; }
        catch { return; }
        if (gs.phase !== "playing" || gs.mode !== "coop") return;
        if (gs.currentTurnId !== sessionId) return;
        this.ctx.broadcastExcept(sessionId, "motus:typing", { input });
    }

    private handleForceEndRound(sessionId: string): void {
        // Only called for coop motus by host — LobbyRoom checks hostId before delegating
        let gs: MotusGameState;
        try { gs = JSON.parse(this.ctx.getState()) as MotusGameState; }
        catch { return; }
        if (gs.phase !== "playing" || gs.mode !== "coop") return;
        this.endRound(gs, null);
        this.ctx.setState(JSON.stringify(gs));
    }

    private endRound(gs: MotusGameState, coopWinnerId: string | null): void {
        this.roundTimer?.clear();
        this.roundTimer = null;

        gs.secretWord = this.secret;

        if (gs.mode === "vs") {
            const solved = gs.playerOrder.filter(id => gs.players[id]?.solved);
            if (solved.length > 0) {
                const minAttempts  = Math.min(...solved.map(id => gs.players[id]!.guesses.length));
                const byAttempts   = solved.filter(id => gs.players[id]!.guesses.length === minAttempts);
                if (byAttempts.length === 1) {
                    gs.roundWinnerIds = byAttempts;
                } else {
                    const minTime = Math.min(...byAttempts.map(id => gs.players[id]!.solvedAt));
                    gs.roundWinnerIds = byAttempts.filter(id => gs.players[id]!.solvedAt === minTime);
                }
            } else {
                gs.roundWinnerIds = [];
            }
        } else {
            gs.roundWinnerIds = coopWinnerId ? [coopWinnerId] : [];
        }

        if (gs.roundWinnerIds.length === 1) {
            const wId = gs.roundWinnerIds[0]!;
            gs.roundPoints[wId] = (gs.roundPoints[wId] ?? 0) + 1;
        }

        gs.phase = gs.currentRound >= gs.maxRounds ? "ended" : "roundEnd";
        if (gs.phase === "ended") {
            let winners: string[] | undefined;
            if (gs.mode === "coop") {
                const teamWon = Object.values(gs.roundPoints).some(v => v > 0);
                winners = teamWon ? gs.playerOrder : [];
            }
            this.ctx.onGameEnded(gs.roundPoints, winners);
        }
    }

    private isPlayerDone(gs: MotusGameState, playerId: string): boolean {
        const player = gs.players[playerId];
        if (!player) return true;
        if (player.solved) return true;
        if (gs.maxAttempts > 0 && player.guesses.length >= gs.maxAttempts) return true;
        const solvedPlayers = gs.playerOrder
            .map(id => gs.players[id])
            .filter(p => p?.solved);
        if (solvedPlayers.length === 0) return false;
        const bestAttempts = Math.min(...solvedPlayers.map(p => p!.guesses.length));
        return player.guesses.length >= bestAttempts;
    }

    private nextCoopPlayer(gs: MotusGameState): string {
        const active = gs.playerOrder.filter(id => {
            const p  = gs.players[id];
            const lp = this.ctx.getPlayers().get(id);
            return p && !p.eliminated && lp && !lp.isEliminated;
        });
        if (active.length === 0) return gs.currentTurnId;
        const idx = active.indexOf(gs.currentTurnId);
        return active[(idx + 1) % active.length] ?? active[0]!;
    }

    private normalize(word: string): string {
        return word
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z]/g, "");
    }

    private computeResult(secret: string, guess: string): MotusLetterResult[] {
        const result: MotusLetterResult[] = Array(secret.length).fill("absent");
        const remaining: Record<string, number> = {};
        for (let i = 0; i < secret.length; i++) {
            if (guess[i] === secret[i]) {
                result[i] = "correct";
            } else {
                remaining[secret[i]!] = (remaining[secret[i]!] ?? 0) + 1;
            }
        }
        for (let i = 0; i < secret.length; i++) {
            if (result[i] !== "correct" && guess[i] && remaining[guess[i]!] && remaining[guess[i]!]! > 0) {
                result[i] = "misplaced";
                remaining[guess[i]!]!--;
            }
        }
        return result;
    }
}
