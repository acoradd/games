import type { GameHandler, RoomContext, RoundCarryOver } from "./GameHandler.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemoryCard {
    id: number;
    value: number;
    isFlipped: boolean;
    isMatched: boolean;
}

interface MemoryGameState {
    phase: "picking1" | "picking2" | "revealing" | "roundEnd" | "ended";
    currentTurnId: string;
    firstFlippedIndex: number;
    cards: MemoryCard[];
    scores: Record<string, number>;
    turnDeadline: number;
    playerNames: Record<string, string>;
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    roundWinnerIds: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SYMBOLS = [
    "🎮","🎲","🎯","⚽","🏀","🎾","🏆","🚀","🌟","🎪",
    "🎨","🎭","🎰","🎵","🎬","🌈","🍕","🦁","🐬","🌺",
    "🎸","🏄","🚂","🎃","🦊",
];

// ── Handler ───────────────────────────────────────────────────────────────────

export class MemoryHandler implements GameHandler {
    private ctx: RoomContext;
    private turnTimer: { clear(): void } | null = null;
    private turnTimeoutSec = 30;

    constructor(ctx: RoomContext) {
        this.ctx = ctx;
    }

    init(options: Record<string, unknown>, prevRound: RoundCarryOver | null): void {
        this.turnTimeoutSec = parseInt(String(options["turnTimeout"] ?? "30"), 10);
        const pairs = parseInt(String(options["pairs"] ?? "12"), 10);

        const currentRound = prevRound?.currentRound ?? 1;
        const maxRounds    = prevRound?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number>  = { ...(prevRound?.roundPoints ?? {}) };
        const existingNames: Record<string, string> = prevRound?.playerNames ?? {};

        const symbolIndices = Array.from({ length: SYMBOLS.length }, (_, i) => i);
        const shuffled      = symbolIndices.sort(() => Math.random() - 0.5).slice(0, pairs);
        const deck          = [...shuffled, ...shuffled].sort(() => Math.random() - 0.5);

        const cards: MemoryCard[] = deck.map((value, id) => ({
            id, value, isFlipped: false, isMatched: false,
        }));

        const scores: Record<string, number>       = {};
        const playerNames: Record<string, string>  = { ...existingNames };

        this.ctx.getPlayers().forEach((p, id) => {
            playerNames[id] = p.username;
            if (!p.isEliminated) scores[id] = 0;
        });

        const playerIds = Array.from(this.ctx.getPlayers().keys())
            .filter(id => !this.ctx.getPlayers().get(id)?.isEliminated);

        const gs: MemoryGameState = {
            phase: "picking1",
            currentTurnId: playerIds[0] ?? "",
            firstFlippedIndex: -1,
            cards,
            scores,
            playerNames,
            turnDeadline: 0,
            currentRound,
            maxRounds,
            roundPoints,
            roundWinnerIds: [],
        };

        this.startTurnTimer(gs);
    }

    onMessage(type: string, playerId: string, data: unknown): void {
        if (type === "flipCard") {
            this.handleFlipCard(playerId, (data as { index?: number }).index ?? -1);
        }
    }

    onEliminate(playerId: string): void {
        let gs: MemoryGameState;
        try { gs = JSON.parse(this.ctx.getState()) as MemoryGameState; }
        catch { return; }

        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const wasTheirTurn = gs.currentTurnId === playerId;

        if (wasTheirTurn) {
            gs.cards.forEach((c) => { if (c.isFlipped && !c.isMatched) c.isFlipped = false; });
            gs.firstFlippedIndex = -1;

            if (this.nextTurn(gs)) {
                this.endRound(gs);
                this.ctx.setState(JSON.stringify(gs));
                return;
            }

            gs.phase = "picking1";
            this.startTurnTimer(gs);
            return;
        }

        const activeCount = Object.keys(gs.scores).filter((id) => {
            const p = this.ctx.getPlayers().get(id);
            return p && !p.isEliminated;
        }).length;

        if (activeCount === 0) {
            this.endRound(gs);
        }

        this.ctx.setState(JSON.stringify(gs));
    }

    dispose(): void {
        this.clearTurnTimer();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private handleFlipCard(playerId: string, index: number): void {
        let gs: MemoryGameState;
        try { gs = JSON.parse(this.ctx.getState()) as MemoryGameState; }
        catch { return; }

        const { phase, currentTurnId, cards } = gs;
        if (phase === "revealing" || phase === "ended" || phase === "roundEnd") return;
        if (playerId !== currentTurnId) return;
        if (typeof index !== "number" || index < 0 || index >= cards.length) return;

        const card = cards[index];
        if (!card || card.isFlipped || card.isMatched) return;

        if (phase === "picking1") {
            card.isFlipped = true;
            gs.firstFlippedIndex = index;
            gs.phase = "picking2";
            this.ctx.setState(JSON.stringify(gs));

        } else {
            // picking2
            card.isFlipped = true;
            const firstCard = cards[gs.firstFlippedIndex];
            if (!firstCard) return;

            if (firstCard.value === card.value) {
                // Match
                firstCard.isMatched = true;
                card.isMatched = true;
                gs.scores[playerId] = (gs.scores[playerId] ?? 0) + 1;
                gs.firstFlippedIndex = -1;

                if (cards.every((c) => c.isMatched)) {
                    this.endRound(gs);
                    this.ctx.setState(JSON.stringify(gs));
                } else {
                    gs.phase = "picking1";
                    this.ctx.setState(JSON.stringify(gs));
                    this.startTurnTimer(gs);
                }
            } else {
                // No match — reveal briefly then unflip
                const cardId      = card.id;
                const firstCardId = firstCard.id;

                gs.phase = "revealing";
                gs.firstFlippedIndex = -1;
                this.clearTurnTimer();
                this.ctx.setState(JSON.stringify(gs));

                this.ctx.clock.setTimeout(() => {
                    let current: MemoryGameState;
                    try { current = JSON.parse(this.ctx.getState()) as MemoryGameState; }
                    catch { return; }
                    if (current.phase !== "revealing") return;

                    const c1 = current.cards.find((c) => c.id === cardId);
                    const c2 = current.cards.find((c) => c.id === firstCardId);
                    if (c1 && !c1.isMatched) c1.isFlipped = false;
                    if (c2 && !c2.isMatched) c2.isFlipped = false;

                    if (this.nextTurn(current)) {
                        this.endRound(current);
                        this.ctx.setState(JSON.stringify(current));
                        return;
                    }

                    current.phase = "picking1";
                    this.startTurnTimer(current);
                }, 1500);
            }
        }
    }

    private nextTurn(gs: MemoryGameState): boolean {
        const playerIds = Object.keys(gs.scores).filter((id) => {
            const p = this.ctx.getPlayers().get(id);
            return p && !p.isEliminated;
        });
        if (playerIds.length === 0) return true;
        const idx = playerIds.indexOf(gs.currentTurnId);
        gs.currentTurnId = playerIds[(idx + 1) % playerIds.length] ?? playerIds[0]!;
        return false;
    }

    private startTurnTimer(gs: MemoryGameState): void {
        this.clearTurnTimer();

        if (this.turnTimeoutSec === 0) {
            gs.turnDeadline = 0;
            this.ctx.setState(JSON.stringify(gs));
            return;
        }

        const timeoutMs = this.turnTimeoutSec * 1000;
        gs.turnDeadline = Date.now() + timeoutMs;
        this.ctx.setState(JSON.stringify(gs));

        this.turnTimer = this.ctx.clock.setTimeout(() => {
            let current: MemoryGameState;
            try { current = JSON.parse(this.ctx.getState()) as MemoryGameState; }
            catch { return; }
            if (current.phase === "ended" || current.phase === "roundEnd") return;

            current.cards.forEach((c) => { if (c.isFlipped && !c.isMatched) c.isFlipped = false; });
            current.firstFlippedIndex = -1;

            if (this.nextTurn(current)) {
                this.endRound(current);
                this.ctx.setState(JSON.stringify(current));
                return;
            }

            current.phase = "picking1";
            this.startTurnTimer(current);
        }, timeoutMs);
    }

    private clearTurnTimer(): void {
        this.turnTimer?.clear();
        this.turnTimer = null;
    }

    private endRound(gs: MemoryGameState): void {
        const entries  = Object.entries(gs.scores);
        const maxScore = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 0;
        const winners  = entries.filter(([, v]) => v === maxScore).map(([id]) => id);

        gs.roundWinnerIds = winners;
        if (winners.length === 1) {
            const wId = winners[0]!;
            gs.roundPoints[wId] = (gs.roundPoints[wId] ?? 0) + 1;
        }
        gs.phase = gs.currentRound >= gs.maxRounds ? "ended" : "roundEnd";
        if (gs.phase === "ended") this.ctx.onGameEnded(gs.roundPoints);
        this.clearTurnTimer();
    }
}
