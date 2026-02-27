import { Room, Client, CloseCode, ServerError } from "colyseus";
import { LobbyState, LobbyPlayer, ChatMessage } from "./schema/LobbyState.js";
import { verifyToken } from "../services/player.service.js";
import { prisma } from "../lib/prisma.js";

interface JoinOptions {
    username?: string;
    token?: string;
}

interface AuthPayload {
    playerId: number;
    username: string;
}

// ── Round carry-over (between rounds of the same game) ─────────────────────
interface RoundCarryOver {
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    playerNames: Record<string, string>;
}

// ── Memory game types (server-only) ────────────────────────────────────────
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

// ── Tron game types (server-only) ──────────────────────────────────────────
interface TronPlayer {
    x: number; y: number;
    dir: "up" | "down" | "left" | "right";
    alive: boolean; eliminated: boolean;
    color: string; score: number;
    eliminatedAt: number; // tick when eliminated (0 = still alive)
}

interface TronGameState {
    phase: "playing" | "roundEnd" | "ended";
    mode: "Tron" | "Snake";
    gridSize: number;
    grid: string;
    players: Record<string, TronPlayer>;
    playerOrder: string[];
    apples: { x: number; y: number }[];
    playerNames: Record<string, string>;
    tick: number;
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    roundWinnerIds: string[];
}

// ── Bomberman game types (server-only) ─────────────────────────────────────
interface BombermanPlayer {
    x: number; y: number;
    alive: boolean; eliminated: boolean;
    lives: number; score: number;
    bombsMax: number; bombsPlaced: number;
    range: number;
    shield: boolean; invincibleTicks: number;
    color: string;
    eliminatedAt: number; // tick when eliminated (0 = still alive)
}

interface BombermanGameState {
    phase: "playing" | "roundEnd" | "ended";
    cols: number; rows: number;
    grid: string;
    players: Record<string, BombermanPlayer>;
    playerOrder: string[];
    bombs: BombBM[];
    explosions: ExplosionBM[];
    bonuses: BonusBM[];
    playerNames: Record<string, string>;
    tick: number;
    bombTickEvery: number; // run bomb logic every N game ticks
    bombTickMs: number;    // ms per bomb-tick (for client countdown display)
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    roundWinnerIds: string[];
}

interface BombBM { id: number; x: number; y: number; ownerId: string; fuseLeft: number; range: number; }
interface ExplosionBM { cells: { x: number; y: number }[]; ticksLeft: number; }
interface BonusBM { x: number; y: number; type: "bomb" | "range" | "shield"; }

// ── Motus game types (server-only) ─────────────────────────────────────────
type MotusLetterResult = "correct" | "misplaced" | "absent";

interface MotusGuess {
    word:   string;
    result: MotusLetterResult[];
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
    currentRound:   number;
    maxRounds:      number;
    roundPoints:    Record<string, number>;
    roundWinnerIds: string[];
    roundStartedAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────
const SYMBOLS = [
    "🎮","🎲","🎯","⚽","🏀","🎾","🏆","🚀","🌟","🎪",
    "🎨","🎭","🎰","🎵","🎬","🌈","🍕","🦁","🐬","🌺",
    "🎸","🏄","🚂","🎃","🦊",
];

const TRON_SPEED_MS = [200, 150, 120, 80, 50];
const TRON_GRID_SIZES: Record<string, number> = { Petite: 20, Moyenne: 30, Grande: 40 };
const TRON_COLORS = ["#00e5ff", "#ff1744", "#76ff03", "#ff6d00"];
const SNAKE_APPLE_COUNT = 3;

const GAME_TICK_MS = 50;
const BOMB_TICK_SPEEDS = [300, 200, 150, 100, 75]; // ms per bomb-tick for speed 1-5
const FUSE_TICKS = 20;
const EXPLOSION_TICKS = 5;
const INVINCIBLE_TICKS = 8;
const BONUS_DROP_RATE = 0.3;
/** Clear a 3×3 area around a spawn corner, expanding inward from the edge. */
function clearSpawnZone(grid: string[], cx: number, cy: number, cols: number, rows: number) {
    const dx = cx === 0 ? 1 : -1;
    const dy = cy === 0 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const sx = cx + i * dx;
            const sy = cy + j * dy;
            if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
                grid[sy * cols + sx] = "0";
            }
        }
    }
}

export class LobbyRoom extends Room<{ state: LobbyState }> {
    maxClients = 8;

    private playerIdMap = new Map<number, string>();
    private sessionToPlayerId = new Map<string, number>();
    // Keeps the old sessionId of eliminated players so onJoin can clean up the stale entry
    private staleSessionByPlayerId = new Map<number, string>();

    private currentTurnTimer: { clear(): void } | null = null;

    // Tron server-only state
    private tronDirs = new Map<string, "up" | "down" | "left" | "right">();
    private snakeTrails = new Map<string, number[]>();

    // Bomberman server-only state — one move per keypress, consumed each tick
    private bombermanMovePending = new Map<string, "up" | "down" | "left" | "right">();
    private bombermanBombsPending = new Set<string>();
    private bombIdCounter = 0;

    private gameSimInterval: { clear(): void } | null = null;

    // Round carry-over between rounds of the same game session
    private prevRound: RoundCarryOver | null = null;

    // Motus server-only state
    private motusSecret: string = "";
    private motusRoundTimer: { clear(): void } | null = null;
    // VS only: full guess history per player (never sent in gameStateJson)
    private motusVsGuesses: Map<string, MotusGuess[]> = new Map();

    onCreate(_options: Record<string, unknown>) {
        this.setState(new LobbyState());
        this.autoDispose = true;
    }

    onAuth(_client: Client, options: JoinOptions): AuthPayload {
        if (!options.token) {
            throw new ServerError(401, "Token manquant");
        }

        let payload: AuthPayload;
        try {
            payload = verifyToken(options.token) as AuthPayload;
        } catch {
            throw new ServerError(401, "Token invalide");
        }

        if (this.playerIdMap.has(payload.playerId)) {
            throw new ServerError(409, "Déjà connecté dans cette room");
        }

        return payload;
    }

    onJoin(client: Client, _options: JoinOptions, auth: AuthPayload) {
        // Remove the stale entry from a previous eliminated session so we don't get duplicates
        const staleSessionId = this.staleSessionByPlayerId.get(auth.playerId);
        if (staleSessionId) {
            this.state.players.delete(staleSessionId);
            this.staleSessionByPlayerId.delete(auth.playerId);
        }

        const isFirstPlayer = this.state.players.size === 0;

        const player = new LobbyPlayer();
        player.id = client.sessionId;
        player.username = auth.username.trim().slice(0, 32);
        player.isHost = isFirstPlayer;
        player.isReady = false;
        player.isConnected = true;
        player.isEliminated = false;

        if (isFirstPlayer) {
            this.state.hostId = client.sessionId;
        }

        if (this.state.status === "game") {
            player.isSpectator = true;
            player.isReady = true;
        }

        this.playerIdMap.set(auth.playerId, client.sessionId);
        this.sessionToPlayerId.set(client.sessionId, auth.playerId);

        this.state.players.set(client.sessionId, player);
        console.log(`[LobbyRoom ${this.roomId}] ${player.username} joined (host: ${player.isHost}, spectator: ${player.isSpectator})`);
    }

    async onLeave(client: Client, code: CloseCode) {
        const leaving = this.state.players.get(client.sessionId);
        if (!leaving) return;

        console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} left (code: ${code})`);

        if (this.state.isStarted && !leaving.isSpectator && code !== CloseCode.CONSENTED) {
            leaving.isConnected = false;

            // Si plus aucun joueur actif connecté → terminer la partie immédiatement
            let hasConnectedActive = false;
            this.state.players.forEach((p) => {
                if (!p.isSpectator && !p.isEliminated && p.isConnected) hasConnectedActive = true;
            });
            if (!hasConnectedActive) {
                console.log(`[LobbyRoom ${this.roomId}] no connected active players left, ending game`);
                const toEliminate: string[] = [];
                this.state.players.forEach((p) => {
                    if (!p.isSpectator && !p.isEliminated) toEliminate.push(p.id);
                });
                for (const sid of toEliminate) this.eliminatePlayer(sid);
                return;
            }

            try {
                await this.allowReconnection(client, 30);
                leaving.isConnected = true;
                console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} reconnected`);
                // Restore private Motus guesses after reconnection
                if (this.state.selectedGameSlug === "motus" && this.state.status === "game") {
                    const privateGuesses = this.motusVsGuesses.get(client.sessionId);
                    if (privateGuesses) client.send("motus:myGuesses", privateGuesses);
                }
            } catch {
                console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} reconnection timed out, eliminating`);
                this.eliminatePlayer(client.sessionId);
            }
        } else if (this.state.isStarted && !leaving.isSpectator && code === CloseCode.CONSENTED) {
            this.eliminatePlayer(client.sessionId);
        } else {
            this.removePlayer(client.sessionId, leaving);
        }
    }

    onDispose() {
        this.clearTurnTimer();
        this.stopGameLoop();
        console.log(`[LobbyRoom ${this.roomId}] disposed`);
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private stopGameLoop() {
        this.gameSimInterval?.clear();
        this.gameSimInterval = null;
    }

    private removePlayer(sessionId: string, leaving: LobbyPlayer) {
        const playerId = this.sessionToPlayerId.get(sessionId);
        if (playerId) {
            this.playerIdMap.delete(playerId);
            this.sessionToPlayerId.delete(sessionId);
        }

        this.state.players.delete(sessionId);
        if (leaving.isHost && this.state.players.size > 0) {
            const nextEntry = this.state.players.entries().next().value;
            if (nextEntry) {
                const [nextId, nextPlayer] = nextEntry;
                nextPlayer.isHost = true;
                this.state.hostId = nextId;
            }
        }
    }

    private eliminatePlayer(sessionId: string) {
        const player = this.state.players.get(sessionId);
        if (!player) return;

        player.isEliminated = true;
        player.isConnected = false;

        const playerId = this.sessionToPlayerId.get(sessionId);
        if (playerId) {
            this.staleSessionByPlayerId.set(playerId, sessionId); // for dedup on rejoin
            this.playerIdMap.delete(playerId);
            this.sessionToPlayerId.delete(sessionId);
        }

        if (this.state.status !== "game") return;

        const slug = this.state.selectedGameSlug;

        if (slug === "memory") {
            this.eliminatePlayerMemory(sessionId);
        } else if (slug === "tron") {
            this.eliminatePlayerTron(sessionId);
        } else if (slug === "bomberman") {
            this.eliminatePlayerBomberman(sessionId);
        } else if (slug === "motus") {
            this.eliminatePlayerMotus(sessionId);
        }
    }

    private eliminatePlayerMemory(sessionId: string) {
        let gs: MemoryGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as MemoryGameState;
        } catch {
            return;
        }

        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const wasTheirTurn = gs.currentTurnId === sessionId;

        if (wasTheirTurn) {
            gs.cards.forEach((c) => {
                if (c.isFlipped && !c.isMatched) c.isFlipped = false;
            });
            gs.firstFlippedIndex = -1;

            if (this.nextTurn(gs)) {
                this.endMemoryRound(gs);
                this.state.gameStateJson = JSON.stringify(gs);
                return;
            }

            gs.phase = "picking1";
            this.startTurnTimer(gs);
            return;
        }

        const activeCount = Object.keys(gs.scores).filter((id) => {
            const p = this.state.players.get(id);
            return p && !p.isEliminated;
        }).length;

        if (activeCount === 0) {
            this.endMemoryRound(gs);
            this.state.gameStateJson = JSON.stringify(gs);
            return;
        }

        this.state.gameStateJson = JSON.stringify(gs);
    }

    private eliminatePlayerTron(sessionId: string) {
        let gs: TronGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as TronGameState;
        } catch {
            return;
        }
        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const p = gs.players[sessionId];
        if (p) {
            p.alive = false;
            p.eliminated = true;
            p.eliminatedAt = gs.tick ?? 0;
        }

        this.checkTronRoundEnd(gs);
        this.state.gameStateJson = JSON.stringify(gs);
    }

    private eliminatePlayerBomberman(sessionId: string) {
        let gs: BombermanGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as BombermanGameState;
        } catch {
            return;
        }
        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const p = gs.players[sessionId];
        if (p) {
            p.lives = 0;
            p.alive = false;
            p.eliminated = true;
            p.eliminatedAt = gs.tick ?? 0;
        }

        this.checkBombermanRoundEnd(gs);
        this.state.gameStateJson = JSON.stringify(gs);
    }

    private eliminatePlayerMotus(sessionId: string) {
        let gs: MotusGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as MotusGameState;
        } catch {
            return;
        }
        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const p = gs.players[sessionId];
        if (p) {
            p.eliminated = true;
        }

        if (gs.mode === "coop") {
            if (gs.currentTurnId === sessionId) {
                gs.currentTurnId = this.nextCoopPlayer(gs);
            }
            const activeCount = gs.playerOrder.filter((id) => {
                const player = gs.players[id];
                return player && !player.eliminated;
            }).length;
            if (activeCount === 0) {
                this.endMotusRound(gs, null);
            }
        } else {
            // VS: check if all remaining players are done
            const allDone = gs.playerOrder.every((id) => {
                const player = gs.players[id];
                if (!player) return true;
                if (player.eliminated) return true;
                return this.isMotusPlayerDone(gs, id);
            });
            if (allDone) {
                this.endMotusRound(gs, null);
            }
        }

        this.state.gameStateJson = JSON.stringify(gs);
    }

    // ── Victory helpers ──────────────────────────────────────────────────────

    // Memory: most pairs wins; tie if equal
    private calcMemoryWinners(gs: MemoryGameState): string[] {
        const entries = Object.entries(gs.scores);
        if (entries.length === 0) return [];
        const maxScore = Math.max(...entries.map(([, v]) => v));
        return entries.filter(([, v]) => v === maxScore).map(([id]) => id);
    }

    // Ends a Memory round: awards roundPoints, advances phase
    private endMemoryRound(gs: MemoryGameState): void {
        const winners = this.calcMemoryWinners(gs);
        gs.roundWinnerIds = winners;
        // Single winner gets 1 point; ties award nothing
        if (winners.length === 1) {
            const wId = winners[0]!;
            gs.roundPoints[wId] = (gs.roundPoints[wId] ?? 0) + 1;
        }
        gs.phase = gs.currentRound >= gs.maxRounds ? "ended" : "roundEnd";
        this.clearTurnTimer();
    }

    // Tron: last alive wins; Snake tie-break = most apples
    private calcTronWinners(gs: TronGameState): string[] {
        const { players, playerOrder, mode } = gs;
        const alive = playerOrder.filter(id => players[id]?.alive);

        if (alive.length === 1) return alive;

        if (alive.length > 1) {
            // Multiple still alive (can happen in Snake if rounds end externally)
            if (mode === "Snake") {
                const maxScore = Math.max(...alive.map(id => players[id]?.score ?? 0));
                return alive.filter(id => (players[id]?.score ?? 0) === maxScore);
            }
            return alive; // Tron tie
        }

        // All dead: who survived longest (highest eliminatedAt)?
        const allIds = playerOrder.filter(id => players[id]);
        if (allIds.length === 0) return [];
        const maxElimAt = Math.max(...allIds.map(id => players[id]?.eliminatedAt ?? 0));
        const lastDied = allIds.filter(id => (players[id]?.eliminatedAt ?? 0) === maxElimAt);

        if (mode === "Snake" && lastDied.length > 1) {
            const maxScore = Math.max(...lastDied.map(id => players[id]?.score ?? 0));
            return lastDied.filter(id => (players[id]?.score ?? 0) === maxScore);
        }
        return lastDied;
    }

    // Returns true if the round ended (≤1 alive)
    private checkTronRoundEnd(gs: TronGameState): boolean {
        const aliveCount = Object.values(gs.players).filter(p => p.alive).length;
        if (aliveCount > 1) return false;

        const winners = this.calcTronWinners(gs);
        gs.roundWinnerIds = winners;
        if (winners.length === 1) {
            const wId = winners[0]!;
            gs.roundPoints[wId] = (gs.roundPoints[wId] ?? 0) + 1;
        }
        gs.phase = gs.currentRound >= gs.maxRounds ? "ended" : "roundEnd";
        this.stopGameLoop();
        return true;
    }

    // Bomberman: last alive wins; tie by eliminatedAt
    private checkBombermanRoundEnd(gs: BombermanGameState): boolean {
        const aliveCount = Object.values(gs.players).filter(p => p.alive).length;
        if (aliveCount > 1) return false;

        const alive = gs.playerOrder.filter(id => gs.players[id]?.alive);
        let winners: string[];
        if (alive.length >= 1) {
            winners = alive; // 1 survivor (or edge case: multiple alive at aliveCount check)
        } else {
            // All eliminated: last one out wins
            const maxElimAt = Math.max(...gs.playerOrder.map(id => gs.players[id]?.eliminatedAt ?? 0));
            winners = gs.playerOrder.filter(id => (gs.players[id]?.eliminatedAt ?? 0) === maxElimAt);
        }

        gs.roundWinnerIds = winners;
        if (winners.length === 1) {
            const wId = winners[0]!;
            gs.roundPoints[wId] = (gs.roundPoints[wId] ?? 0) + 1;
        }
        gs.phase = gs.currentRound >= gs.maxRounds ? "ended" : "roundEnd";
        this.stopGameLoop();
        return true;
    }

    // ── Motus helpers ────────────────────────────────────────────────────────

    private normalizeMotusWord(word: string): string {
        return word
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z]/g, "");
    }

    private computeMotusResult(secret: string, guess: string): MotusLetterResult[] {
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

    private isMotusPlayerDone(gs: MotusGameState, playerId: string): boolean {
        const player = gs.players[playerId];
        if (!player) return true;
        if (player.solved) return true;
        if (gs.maxAttempts > 0 && player.guesses.length >= gs.maxAttempts) return true;

        // Unlimited: done if >= attempts count of the first solver
        const solvedPlayers = gs.playerOrder
            .map((id) => gs.players[id])
            .filter((p) => p?.solved);

        if (solvedPlayers.length === 0) return false;

        const bestAttempts = Math.min(...solvedPlayers.map((p) => p!.guesses.length));
        return player.guesses.length >= bestAttempts;
    }

    private nextCoopPlayer(gs: MotusGameState): string {
        const active = gs.playerOrder.filter((id) => {
            const p = gs.players[id];
            const lobbyP = this.state.players.get(id);
            return p && !p.eliminated && lobbyP && !lobbyP.isEliminated;
        });
        if (active.length === 0) return gs.currentTurnId;
        const idx = active.indexOf(gs.currentTurnId);
        return active[(idx + 1) % active.length] ?? active[0]!;
    }

    private endMotusRound(gs: MotusGameState, coopWinnerId: string | null): void {
        // Cancel the round timer
        if (this.motusRoundTimer) {
            this.motusRoundTimer.clear();
            this.motusRoundTimer = null;
        }

        gs.secretWord = this.motusSecret;

        if (gs.mode === "vs") {
            const solved = gs.playerOrder.filter((id) => gs.players[id]?.solved);
            if (solved.length > 0) {
                const minAttempts = Math.min(...solved.map((id) => gs.players[id]!.guesses.length));
                const byAttempts = solved.filter((id) => gs.players[id]!.guesses.length === minAttempts);
                if (byAttempts.length === 1) {
                    gs.roundWinnerIds = byAttempts;
                } else {
                    const minTime = Math.min(...byAttempts.map((id) => gs.players[id]!.solvedAt));
                    gs.roundWinnerIds = byAttempts.filter((id) => gs.players[id]!.solvedAt === minTime);
                }
            } else {
                gs.roundWinnerIds = [];
            }
        } else {
            gs.roundWinnerIds = coopWinnerId ? [coopWinnerId] : [];
        }

        // Award round points (1 pt per winner; split if tie gives 0)
        if (gs.roundWinnerIds.length === 1) {
            const wId = gs.roundWinnerIds[0]!;
            gs.roundPoints[wId] = (gs.roundPoints[wId] ?? 0) + 1;
        }

        gs.phase = gs.currentRound >= gs.maxRounds ? "ended" : "roundEnd";
    }

    private async initMotus(): Promise<void> {
        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const mode = (String(options["mode"] ?? "vs")) as "vs" | "coop";
        const difficulty = String(options["difficulty"] ?? "medium");
        const minLen = Math.max(3, parseInt(String(options["minWordLength"] ?? "5"), 10));
        const maxLen = Math.max(minLen, parseInt(String(options["maxWordLength"] ?? "10"), 10));
        const maxAttempts = parseInt(String(options["maxAttempts"] ?? "6"), 10);
        const timeLimit = parseInt(String(options["timeLimit"] ?? "0"), 10);

        const roundCarryOver = this.prevRound;
        this.prevRound = null;
        const currentRound = roundCarryOver?.currentRound ?? 1;
        const maxRounds = roundCarryOver?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number> = { ...(roundCarryOver?.roundPoints ?? {}) };
        const existingPlayerNames: Record<string, string> = roundCarryOver?.playerNames ?? {};

        // Frequency threshold by difficulty
        const DIFFICULTY_THRESHOLDS: Record<string, number | null> = {
            easy:   10,
            medium: 1,
            hard:   0.05,
            expert: null,
        };
        const threshold = DIFFICULTY_THRESHOLDS[difficulty] ?? 1;

        // Pick a random word from DB
        const whereClause: Record<string, unknown> = {
            isGuessable: true,
            length: { gte: minLen, lte: maxLen },
        };
        if (threshold !== null) {
            whereClause["frequency"] = { gte: threshold };
        }

        const count = await prisma.word.count({ where: whereClause as Parameters<typeof prisma.word.count>[0]["where"] });
        if (count === 0) {
            console.error(`[Motus] No words found for options: diff=${difficulty}, len=${minLen}-${maxLen}`);
            return;
        }
        const skip = Math.floor(Math.random() * count);
        const wordRow = await prisma.word.findFirst({
            where: whereClause as Parameters<typeof prisma.word.findFirst>[0]["where"],
            skip,
        });

        if (!wordRow) {
            console.error("[Motus] Could not pick a word");
            return;
        }

        this.motusSecret = wordRow.text;
        this.motusVsGuesses.clear();

        const playerIds = Array.from(this.state.players.keys())
            .filter((id) => !this.state.players.get(id)?.isEliminated);

        const playerNames: Record<string, string> = { ...existingPlayerNames };
        playerIds.forEach((id) => {
            this.motusVsGuesses.set(id, []);
            const p = this.state.players.get(id);
            if (p) playerNames[id] = p.username;
        });

        const players: Record<string, MotusPlayerState> = {};
        playerIds.forEach((id) => {
            players[id] = { guesses: [], solved: false, solvedAt: 0, eliminated: false };
        });

        const now = Date.now();
        const gs: MotusGameState = {
            phase: "playing",
            mode,
            wordLength: wordRow.length,
            firstLetter: wordRow.text[0]!,
            secretWord: null,
            maxAttempts,
            roundDeadline: timeLimit > 0 ? now + timeLimit * 1000 : 0,
            players,
            playerOrder: playerIds,
            sharedGuesses: [],
            currentTurnId: playerIds[0] ?? "",
            playerNames,
            currentRound,
            maxRounds,
            roundPoints,
            roundWinnerIds: [],
            roundStartedAt: now,
        };

        this.state.gameStateJson = JSON.stringify(gs);

        if (timeLimit > 0) {
            if (this.motusRoundTimer) this.motusRoundTimer.clear();
            this.motusRoundTimer = this.clock.setTimeout(() => {
                let gsCurrent: MotusGameState;
                try {
                    gsCurrent = JSON.parse(this.state.gameStateJson) as MotusGameState;
                } catch { return; }
                if (gsCurrent.phase !== "playing") return;
                this.endMotusRound(gsCurrent, null);
                this.state.gameStateJson = JSON.stringify(gsCurrent);
            }, timeLimit * 1000);
        }
    }

    // ── Memory helpers ───────────────────────────────────────────────────────

    // Returns true if no more active players (round should end)
    private nextTurn(state: MemoryGameState): boolean {
        const playerIds = Object.keys(state.scores).filter((id) => {
            const p = this.state.players.get(id);
            return p && !p.isEliminated;
        });

        if (playerIds.length === 0) return true;

        const idx = playerIds.indexOf(state.currentTurnId);
        state.currentTurnId = playerIds[(idx + 1) % playerIds.length] ?? playerIds[0]!;
        return false;
    }

    private startTurnTimer(gameState: MemoryGameState) {
        this.clearTurnTimer();

        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const turnTimeoutSec = parseInt(String(options["turnTimeout"] ?? "30"), 10);

        if (turnTimeoutSec === 0) {
            gameState.turnDeadline = 0;
            this.state.gameStateJson = JSON.stringify(gameState);
            return;
        }

        const timeoutMs = turnTimeoutSec * 1000;
        gameState.turnDeadline = Date.now() + timeoutMs;
        this.state.gameStateJson = JSON.stringify(gameState);

        this.currentTurnTimer = this.clock.setTimeout(() => {
            let gs: MemoryGameState;
            try {
                gs = JSON.parse(this.state.gameStateJson) as MemoryGameState;
            } catch {
                return;
            }

            if (gs.phase === "ended" || gs.phase === "roundEnd") return;

            gs.cards.forEach((c) => {
                if (c.isFlipped && !c.isMatched) c.isFlipped = false;
            });
            gs.firstFlippedIndex = -1;

            if (this.nextTurn(gs)) {
                this.endMemoryRound(gs);
                this.state.gameStateJson = JSON.stringify(gs);
                return;
            }

            gs.phase = "picking1";
            this.startTurnTimer(gs);
        }, timeoutMs);
    }

    private clearTurnTimer() {
        if (this.currentTurnTimer) {
            this.currentTurnTimer.clear();
            this.currentTurnTimer = null;
        }
    }

    private initMemory() {
        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const pairs = parseInt(String(options["pairs"] ?? "12"), 10);

        const roundCarryOver = this.prevRound;
        this.prevRound = null;
        const currentRound = roundCarryOver?.currentRound ?? 1;
        const maxRounds = roundCarryOver?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number> = { ...(roundCarryOver?.roundPoints ?? {}) };
        const existingPlayerNames: Record<string, string> = roundCarryOver?.playerNames ?? {};

        const symbolIndices = Array.from({ length: SYMBOLS.length }, (_, i) => i);
        const shuffled = symbolIndices.sort(() => Math.random() - 0.5).slice(0, pairs);
        const deck = [...shuffled, ...shuffled].sort(() => Math.random() - 0.5);

        const cards: MemoryCard[] = deck.map((value, id) => ({
            id, value, isFlipped: false, isMatched: false,
        }));

        const scores: Record<string, number> = {};
        const playerNames: Record<string, string> = { ...existingPlayerNames };

        this.state.players.forEach((p, sessionId) => {
            playerNames[sessionId] = p.username;
            if (!p.isEliminated) {
                scores[sessionId] = 0;
            }
        });

        const playerIds = Array.from(this.state.players.keys())
            .filter(id => !this.state.players.get(id)?.isEliminated);

        const initialState: MemoryGameState = {
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

        this.startTurnTimer(initialState);
    }

    // ── Tron helpers ─────────────────────────────────────────────────────────

    private initTron() {
        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const speedIndex = Math.min(4, Math.max(0, parseInt(String(options["speed"] ?? "3"), 10) - 1));
        const mapSizeKey = String(options["mapSize"] ?? "Moyenne");
        const mode = (String(options["mode"] ?? "Tron")) as "Tron" | "Snake";
        const gridSize = TRON_GRID_SIZES[mapSizeKey] ?? 30;
        const tickMs = TRON_SPEED_MS[speedIndex] ?? 120;

        const roundCarryOver = this.prevRound;
        this.prevRound = null;
        const currentRound = roundCarryOver?.currentRound ?? 1;
        const maxRounds = roundCarryOver?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number> = { ...(roundCarryOver?.roundPoints ?? {}) };
        const existingPlayerNames: Record<string, string> = roundCarryOver?.playerNames ?? {};

        const gs = gridSize;
        const startPositions: Array<{ x: number; y: number; dir: TronPlayer["dir"] }> = [
            { x: 2,      y: 2,      dir: "right" },
            { x: gs - 3, y: gs - 3, dir: "left" },
            { x: gs - 3, y: 2,      dir: "down" },
            { x: 2,      y: gs - 3, dir: "up" },
        ];

        const playerIds = Array.from(this.state.players.keys())
            .filter(id => !this.state.players.get(id)?.isEliminated);
        const playerOrder: string[] = [];
        const players: Record<string, TronPlayer> = {};
        const playerNames: Record<string, string> = { ...existingPlayerNames };

        const grid = Array(gridSize * gridSize).fill(".");

        this.tronDirs.clear();
        this.snakeTrails.clear();

        playerIds.forEach((sessionId, i) => {
            if (i >= 4) return;
            const sp = startPositions[i]!;
            const lobbyPlayer = this.state.players.get(sessionId);
            playerOrder.push(sessionId);
            playerNames[sessionId] = lobbyPlayer?.username ?? sessionId;

            players[sessionId] = {
                x: sp.x, y: sp.y,
                dir: sp.dir,
                alive: true, eliminated: false,
                color: TRON_COLORS[i]!,
                score: 0,
                eliminatedAt: 0,
            };

            this.tronDirs.set(sessionId, sp.dir);

            if (mode === "Snake") {
                const trail: number[] = [];
                const dxMap = { right: -1, left: 1, up: 0, down: 0 };
                const dyMap = { right: 0, left: 0, up: 1, down: -1 };
                const dx = dxMap[sp.dir];
                const dy = dyMap[sp.dir];
                for (let t = 0; t < 3; t++) {
                    const tx = sp.x + dx * t;
                    const ty = sp.y + dy * t;
                    if (tx >= 0 && tx < gridSize && ty >= 0 && ty < gridSize) {
                        const idx = ty * gridSize + tx;
                        grid[idx] = String(i);
                        trail.push(idx);
                    }
                }
                this.snakeTrails.set(sessionId, trail);
            } else {
                grid[sp.y * gridSize + sp.x] = String(i);
            }
        });

        const apples: { x: number; y: number }[] = [];
        if (mode === "Snake") {
            for (let a = 0; a < SNAKE_APPLE_COUNT; a++) {
                const apple = this.spawnApple(grid, gridSize);
                if (apple) apples.push(apple);
            }
        }

        const gameState: TronGameState = {
            phase: "playing",
            mode,
            gridSize,
            grid: grid.join(""),
            players,
            playerOrder,
            apples,
            playerNames,
            tick: 0,
            currentRound,
            maxRounds,
            roundPoints,
            roundWinnerIds: [],
        };

        this.state.gameStateJson = JSON.stringify(gameState);
        this.gameSimInterval = this.clock.setInterval(() => this.tronTick(), tickMs);
    }

    private spawnApple(grid: string[], gridSize: number): { x: number; y: number } | null {
        const empties: number[] = [];
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === ".") empties.push(i);
        }
        if (empties.length === 0) return null;
        const idx = empties[Math.floor(Math.random() * empties.length)]!;
        return { x: idx % gridSize, y: Math.floor(idx / gridSize) };
    }

    private tronTick() {
        let gs: TronGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as TronGameState;
        } catch { return; }

        if (gs.phase !== "playing") { this.stopGameLoop(); return; }

        gs.tick = (gs.tick ?? 0) + 1;

        const grid = gs.grid.split("");
        const { gridSize, mode } = gs;

        const dirDeltas: Record<string, { dx: number; dy: number }> = {
            up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
        };
        const opposites: Record<string, string> = {
            up: "down", down: "up", left: "right", right: "left",
        };

        const applesEaten = new Set<number>();

        for (const [sessionId, p] of Object.entries(gs.players)) {
            if (!p.alive) continue;

            const pIdx = gs.playerOrder.indexOf(sessionId);
            const pendingDir = this.tronDirs.get(sessionId);
            if (pendingDir && pendingDir !== opposites[p.dir]) {
                p.dir = pendingDir;
            }

            const { dx, dy } = dirDeltas[p.dir] ?? { dx: 1, dy: 0 };
            const nx = p.x + dx;
            const ny = p.y + dy;

            if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize || grid[ny * gridSize + nx] !== ".") {
                p.alive = false;
                p.eliminatedAt = gs.tick;
                continue;
            }

            const newIdx = ny * gridSize + nx;
            grid[newIdx] = String(pIdx);

            if (mode === "Snake") {
                const trail = this.snakeTrails.get(sessionId) ?? [];
                trail.unshift(newIdx);

                let ateApple = false;
                for (let ai = 0; ai < gs.apples.length; ai++) {
                    const apple = gs.apples[ai]!;
                    if (apple.x === nx && apple.y === ny) {
                        p.score++;
                        applesEaten.add(ai);
                        ateApple = true;
                        break;
                    }
                }

                if (!ateApple) {
                    const tail = trail.pop();
                    if (tail !== undefined) grid[tail] = ".";
                }
                this.snakeTrails.set(sessionId, trail);
            }

            p.x = nx;
            p.y = ny;
        }

        if (mode === "Snake" && applesEaten.size > 0) {
            const remaining = gs.apples.filter((_, i) => !applesEaten.has(i));
            gs.apples = remaining;
            for (let i = 0; i < applesEaten.size; i++) {
                const apple = this.spawnApple(grid, gridSize);
                if (apple) gs.apples.push(apple);
            }
        }

        gs.grid = grid.join("");

        this.checkTronRoundEnd(gs);
        this.state.gameStateJson = JSON.stringify(gs);
    }

    // ── Bomberman helpers ────────────────────────────────────────────────────

    private initBomberman() {
        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const lives      = Math.min(5, Math.max(1, parseInt(String(options["lives"]      ?? "1"), 10)));
        const bombCount  = Math.min(3, Math.max(1, parseInt(String(options["bombCount"]  ?? "1"), 10)));
        const bombRange  = Math.min(4, Math.max(1, parseInt(String(options["bombRange"]  ?? "2"), 10)));
        const bombSpeedIndex = Math.min(4, Math.max(0, parseInt(String(options["bombSpeed"] ?? "3"), 10) - 1));
        const bombTickMs = BOMB_TICK_SPEEDS[bombSpeedIndex] ?? 150;
        const bombTickEvery = Math.max(1, Math.round(bombTickMs / GAME_TICK_MS));
        const mapSizeKey = String(options["mapSize"] ?? "Normale");

        const roundCarryOver = this.prevRound;
        this.prevRound = null;
        const currentRound = roundCarryOver?.currentRound ?? 1;
        const maxRounds = roundCarryOver?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number> = { ...(roundCarryOver?.roundPoints ?? {}) };
        const existingPlayerNames: Record<string, string> = roundCarryOver?.playerNames ?? {};

        const MAP_SIZES: Record<string, [number, number]> = {
            Petite:  [13, 11],
            Normale: [17, 13],
            Grande:  [21, 15],
        };
        const [cols, rows] = MAP_SIZES[mapSizeKey] ?? [17, 13];

        const spawnCorners = [[0, 0], [cols - 1, 0], [0, rows - 1], [cols - 1, rows - 1]];

        const grid: string[] = [];

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1 && x % 2 === 0 && y % 2 === 0) {
                    grid.push("1");
                } else {
                    grid.push("0");
                }
            }
        }

        for (const [cx, cy] of spawnCorners) {
            clearSpawnZone(grid, cx!, cy!, cols, rows);
        }

        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === "0" && Math.random() < 0.6) {
                grid[i] = "2";
            }
        }

        // Re-clear after crate placement so spawn zones are always free
        for (const [cx, cy] of spawnCorners) {
            clearSpawnZone(grid, cx!, cy!, cols, rows);
        }

        const bombermanColors = ["#00e5ff", "#ff1744", "#76ff03", "#ff6d00"];
        const playerIds = Array.from(this.state.players.keys())
            .filter(id => !this.state.players.get(id)?.isEliminated);
        const playerOrder: string[] = [];
        const players: Record<string, BombermanPlayer> = {};
        const playerNames: Record<string, string> = { ...existingPlayerNames };

        this.bombermanMovePending.clear();
        this.bombermanBombsPending.clear();
        this.bombIdCounter = 0;

        playerIds.forEach((sessionId, i) => {
            if (i >= 4) return;
            const corner = spawnCorners[i] ?? [0, 0];
            const lobbyPlayer = this.state.players.get(sessionId);
            playerOrder.push(sessionId);
            playerNames[sessionId] = lobbyPlayer?.username ?? sessionId;

            players[sessionId] = {
                x: corner[0]!, y: corner[1]!,
                alive: true, eliminated: false,
                lives,
                score: 0,
                bombsMax: bombCount,
                bombsPlaced: 0,
                range: bombRange,
                shield: false, invincibleTicks: 0,
                color: bombermanColors[i]!,
                eliminatedAt: 0,
            };
        });

        const gs: BombermanGameState = {
            phase: "playing",
            cols, rows,
            grid: grid.join(""),
            players,
            playerOrder,
            bombs: [],
            explosions: [],
            bonuses: [],
            playerNames,
            tick: 0,
            bombTickEvery,
            bombTickMs,
            currentRound,
            maxRounds,
            roundPoints,
            roundWinnerIds: [],
        };

        this.state.gameStateJson = JSON.stringify(gs);
        this.gameSimInterval = this.clock.setInterval(() => this.bombermanTick(), GAME_TICK_MS);
    }

    private bombermanTick() {
        let gs: BombermanGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as BombermanGameState;
        } catch { return; }

        if (gs.phase !== "playing") { this.stopGameLoop(); return; }

        gs.tick = (gs.tick ?? 0) + 1;

        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const powerUps = options["powerUps"] !== false;

        const { cols, rows, bombTickEvery } = gs;
        const runBombTick = gs.tick % (bombTickEvery ?? 1) === 0;
        const grid = gs.grid.split("");

        const dirDeltas: Record<string, { dx: number; dy: number }> = {
            up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
        };

        // ── 1. Movement (one step per keypress, consumed each tick) ──────────
        for (const [sessionId, p] of Object.entries(gs.players)) {
            if (!p.alive) continue;
            const dir = this.bombermanMovePending.get(sessionId);
            if (!dir) continue;

            const { dx, dy } = dirDeltas[dir];
            const nx = p.x + dx;
            const ny = p.y + dy;

            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const cell = grid[ny * cols + nx];
                if (cell !== "1" && cell !== "2" && !gs.bombs.some((b) => b.x === nx && b.y === ny)) {
                    p.x = nx;
                    p.y = ny;
                }
            }
        }
        this.bombermanMovePending.clear();

        // ── 2. Bomb placement (immediate, one per keypress) ──────────────────
        for (const sessionId of this.bombermanBombsPending) {
            const p = gs.players[sessionId];
            if (!p || !p.alive) continue;
            if (p.bombsPlaced >= p.bombsMax) continue;
            const alreadyBomb = gs.bombs.some((b) => b.x === p.x && b.y === p.y);
            if (alreadyBomb) continue;

            gs.bombs.push({
                id: this.bombIdCounter++,
                x: p.x, y: p.y,
                ownerId: sessionId,
                fuseLeft: FUSE_TICKS,
                range: p.range,
            });
            p.bombsPlaced++;
        }
        this.bombermanBombsPending.clear();

        // ── 3–7. Bomb logic (runs every bombTickEvery game ticks) ────────────
        if (runBombTick) {

        // ── 3. Fuse tick & explosions ────────────────────────────────────────
        const newBombs: BombBM[] = [];
        const explodingBombs: BombBM[] = [];

        for (const bomb of gs.bombs) {
            bomb.fuseLeft--;
            if (bomb.fuseLeft <= 0) {
                explodingBombs.push(bomb);
            } else {
                newBombs.push(bomb);
            }
        }

        const toExplode = [...explodingBombs];
        const explodedIds = new Set<number>();

        while (toExplode.length > 0) {
            const bomb = toExplode.shift()!;
            if (explodedIds.has(bomb.id)) continue;
            explodedIds.add(bomb.id);

            const owner = gs.players[bomb.ownerId];
            if (owner) owner.bombsPlaced = Math.max(0, owner.bombsPlaced - 1);

            const cells: { x: number; y: number }[] = [{ x: bomb.x, y: bomb.y }];
            const directions = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

            for (const { dx, dy } of directions) {
                for (let r = 1; r <= bomb.range; r++) {
                    const ex = bomb.x + dx * r;
                    const ey = bomb.y + dy * r;
                    if (ex < 0 || ex >= cols || ey < 0 || ey >= rows) break;
                    const cellIdx = ey * cols + ex;
                    const cell = grid[cellIdx]!;

                    if (cell === "1") break;

                    cells.push({ x: ex, y: ey });

                    if (cell === "2") {
                        grid[cellIdx] = "0";
                        if (powerUps && Math.random() < BONUS_DROP_RATE) {
                            const types: BonusBM["type"][] = ["bomb", "range", "shield"];
                            gs.bonuses.push({
                                x: ex, y: ey,
                                type: types[Math.floor(Math.random() * types.length)]!,
                            });
                        }
                        break;
                    }

                    const chainBomb = newBombs.find((b) => b.x === ex && b.y === ey);
                    if (chainBomb) {
                        newBombs.splice(newBombs.indexOf(chainBomb), 1);
                        toExplode.push(chainBomb);
                    }
                }
            }

            gs.explosions.push({ cells, ticksLeft: EXPLOSION_TICKS });
        }

        gs.bombs = newBombs.filter((b) => !explodedIds.has(b.id));
        gs.grid = grid.join("");

        // ── 4. Explosion damage & cleanup ────────────────────────────────────
        const newExplosions: ExplosionBM[] = [];
        for (const exp of gs.explosions) {
            exp.ticksLeft--;

            for (const [sessionId, p] of Object.entries(gs.players)) {
                if (!p.alive) continue;
                const hit = exp.cells.some((c) => c.x === p.x && c.y === p.y);
                if (!hit) continue;

                if (p.invincibleTicks > 0) continue;

                if (p.shield) {
                    p.shield = false;
                    p.invincibleTicks = INVINCIBLE_TICKS;
                } else {
                    p.lives--;
                    const lp = this.state.players.get(sessionId);
                    if (p.lives <= 0) {
                        p.alive = false;
                        p.eliminated = true;
                        p.eliminatedAt = gs.tick;
                        // Note: LobbyPlayer.isEliminated is intentionally NOT set here.
                        // Normal in-game deaths should not exclude the player from future rounds.
                        // LobbyPlayer.isEliminated is only set by eliminatePlayer() on disconnect.
                    } else {
                        p.invincibleTicks = INVINCIBLE_TICKS;
                        const pi = gs.playerOrder.indexOf(sessionId);
                        const dynamicCorners = [[0, 0], [gs.cols - 1, 0], [0, gs.rows - 1], [gs.cols - 1, gs.rows - 1]];
                        const corner = dynamicCorners[pi] ?? dynamicCorners[0]!;
                        p.x = corner[0]!;
                        p.y = corner[1]!;
                    }
                }
            }

            if (exp.ticksLeft > 0) newExplosions.push(exp);
        }
        gs.explosions = newExplosions;

        // ── 5. Decrement invincibility ────────────────────────────────────────
        for (const p of Object.values(gs.players)) {
            if (p.alive && p.invincibleTicks > 0) p.invincibleTicks--;
        }

        // ── 6. Bonus pickup ──────────────────────────────────────────────────
        const remainingBonuses: BonusBM[] = [];
        for (const bonus of gs.bonuses) {
            let picked = false;
            for (const p of Object.values(gs.players)) {
                if (!p.alive) continue;
                if (p.x === bonus.x && p.y === bonus.y) {
                    if (bonus.type === "bomb") p.bombsMax++;
                    else if (bonus.type === "range") p.range++;
                    else if (bonus.type === "shield") p.shield = true;
                    picked = true;
                    break;
                }
            }
            if (!picked) remainingBonuses.push(bonus);
        }
        gs.bonuses = remainingBonuses;

        // ── 7. Win check ─────────────────────────────────────────────────────
        this.checkBombermanRoundEnd(gs);

        } // end if (runBombTick)

        this.state.gameStateJson = JSON.stringify(gs);
    }

    // ── Messages ────────────────────────────────────────────────────────────
    messages = {
        ready: (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            player.isReady = !player.isReady;
        },

        selectGame: async (client: Client, data: { slug: string }) => {
            if (client.sessionId !== this.state.hostId) return;
            this.state.selectedGameSlug = data.slug ?? "";
            const gm = await prisma.gameMode.findUnique({ where: { slug: data.slug } });
            if (gm?.options && typeof gm.options === "object") {
                const opts = gm.options as Record<string, { default: unknown }>;
                const defaults: Record<string, unknown> = {};
                for (const [key, def] of Object.entries(opts)) {
                    defaults[key] = def.default;
                }
                this.state.gameOptionsJson = JSON.stringify(defaults);
            } else {
                this.state.gameOptionsJson = "{}";
            }
        },

        setOptions: (client: Client, data: { options: Record<string, unknown> }) => {
            if (client.sessionId !== this.state.hostId) return;
            this.state.gameOptionsJson = JSON.stringify(data.options ?? {});
        },

        chat: (client: Client, data: { text: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !data.text?.trim()) return;

            const msg = new ChatMessage();
            msg.username = player.username;
            msg.text = data.text.trim().slice(0, 200);
            msg.timestamp = Date.now();
            this.state.chatHistory.push(msg);

            if (this.state.chatHistory.length > 50) {
                this.state.chatHistory.splice(0, 1);
            }
        },

        returnToLobby: (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (this.state.status !== "game") return;
            try {
                const gs = JSON.parse(this.state.gameStateJson) as { phase?: string };
                if (gs.phase !== "ended") return;
            } catch { return; }

            this.clearTurnTimer();
            this.stopGameLoop();
            this.prevRound = null;
            this.staleSessionByPlayerId.clear();

            // Supprimer les joueurs non connectés (éliminés, déconnectés, spectateurs)
            // — leur WebSocket est fermée, ils ne peuvent pas rejoindre le lobby
            const toRemove: string[] = [];
            this.state.players.forEach((p) => {
                if (p.isEliminated || !p.isConnected || p.isSpectator) {
                    toRemove.push(p.id); // p.id === sessionId (défini dans onJoin)
                }
            });
            for (const sid of toRemove) {
                const playerId = this.sessionToPlayerId.get(sid);
                if (playerId) {
                    this.playerIdMap.delete(playerId);
                    this.sessionToPlayerId.delete(sid);
                }
                this.state.players.delete(sid);
            }

            // Réassigner l'hôte si l'ancien a été supprimé
            if (this.state.players.size > 0 && !this.state.players.has(this.state.hostId)) {
                const nextEntry = this.state.players.entries().next().value as [string, LobbyPlayer] | undefined;
                if (nextEntry) {
                    const [nextId, nextPlayer] = nextEntry;
                    nextPlayer.isHost = true;
                    this.state.hostId = nextId;
                }
            }

            this.state.isStarted = false;
            this.state.status = "lobby";
            this.state.gameStateJson = "{}";
            this.state.players.forEach((p) => {
                p.isReady = false;
                p.isEliminated = false;
                p.isConnected = true;
            });
            this.broadcast("lobby:return", { roomId: this.roomId });
            console.log(`[LobbyRoom ${this.roomId}] host returned everyone to lobby (removed ${toRemove.length} ghost players)`);
        },

        nextRound: async (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (this.state.status !== "game") return;

            let gs: { phase?: string; currentRound?: number; maxRounds?: number; roundPoints?: Record<string, number>; playerNames?: Record<string, string> };
            try {
                gs = JSON.parse(this.state.gameStateJson) as typeof gs;
            } catch { return; }

            if (gs.phase !== "roundEnd") return;

            this.prevRound = {
                currentRound: (gs.currentRound ?? 1) + 1,
                maxRounds: gs.maxRounds ?? 1,
                roundPoints: gs.roundPoints ?? {},
                playerNames: gs.playerNames ?? {},
            };

            this.stopGameLoop();

            const slug = this.state.selectedGameSlug;
            if (slug === "memory") {
                this.clearTurnTimer();
                this.initMemory();
            } else if (slug === "tron") {
                this.initTron();
            } else if (slug === "bomberman") {
                this.initBomberman();
            } else if (slug === "motus") {
                await this.initMotus();
            }
        },

        start: async (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (!this.state.selectedGameSlug) return;
            if (this.state.players.size < 1) return;
            if (this.state.isStarted) return;

            this.prevRound = null;
            this.state.isStarted = true;

            const slug = this.state.selectedGameSlug;
            if (slug === "memory") {
                this.initMemory();
            } else if (slug === "tron") {
                this.initTron();
            } else if (slug === "bomberman") {
                this.initBomberman();
            } else if (slug === "motus") {
                await this.initMotus();
            }

            this.state.status = "game";

            this.broadcast("game:start", {
                roomId: this.roomId,
                gameSlug: slug,
                options: JSON.parse(this.state.gameOptionsJson),
            });
        },

        flipCard: (client: Client, data: { index: number }) => {
            if (this.state.status !== "game") return;

            let gameState: MemoryGameState;
            try {
                gameState = JSON.parse(this.state.gameStateJson) as MemoryGameState;
            } catch {
                return;
            }

            const { phase, currentTurnId, cards } = gameState;

            if (phase === "revealing" || phase === "ended" || phase === "roundEnd") return;
            if (client.sessionId !== currentTurnId) return;

            const index = data.index;
            if (typeof index !== "number" || index < 0 || index >= cards.length) return;

            const card = cards[index];
            if (!card || card.isFlipped || card.isMatched) return;

            if (phase === "picking1") {
                card.isFlipped = true;
                gameState.firstFlippedIndex = index;
                gameState.phase = "picking2";
                this.state.gameStateJson = JSON.stringify(gameState);

            } else if (phase === "picking2") {
                card.isFlipped = true;

                const firstCard = cards[gameState.firstFlippedIndex];
                if (!firstCard) return;

                if (firstCard.value === card.value) {
                    firstCard.isMatched = true;
                    card.isMatched = true;
                    gameState.scores[client.sessionId] = (gameState.scores[client.sessionId] ?? 0) + 1;
                    gameState.firstFlippedIndex = -1;

                    const allMatched = cards.every((c) => c.isMatched);
                    if (allMatched) {
                        this.endMemoryRound(gameState);
                        this.state.gameStateJson = JSON.stringify(gameState);
                    } else {
                        gameState.phase = "picking1";
                        this.state.gameStateJson = JSON.stringify(gameState);
                        this.startTurnTimer(gameState);
                    }

                } else {
                    const cardId = card.id;
                    const firstCardId = firstCard.id;

                    gameState.phase = "revealing";
                    gameState.firstFlippedIndex = -1;
                    this.clearTurnTimer();
                    this.state.gameStateJson = JSON.stringify(gameState);

                    this.clock.setTimeout(() => {
                        let gs: MemoryGameState;
                        try {
                            gs = JSON.parse(this.state.gameStateJson) as MemoryGameState;
                        } catch {
                            return;
                        }
                        if (gs.phase !== "revealing") return;

                        const c1 = gs.cards.find((c) => c.id === cardId);
                        const c2 = gs.cards.find((c) => c.id === firstCardId);
                        if (c1 && !c1.isMatched) c1.isFlipped = false;
                        if (c2 && !c2.isMatched) c2.isFlipped = false;

                        if (this.nextTurn(gs)) {
                            this.endMemoryRound(gs);
                            this.state.gameStateJson = JSON.stringify(gs);
                            return;
                        }

                        gs.phase = "picking1";
                        this.startTurnTimer(gs);
                    }, 1500);
                }
            }
        },

        "motus:guess": async (client: Client, data: { word: string }) => {
            if (this.state.status !== "game") return;

            let gs: MotusGameState;
            try {
                gs = JSON.parse(this.state.gameStateJson) as MotusGameState;
            } catch { return; }

            if (gs.phase !== "playing") return;

            const sessionId = client.sessionId;
            const player = gs.players[sessionId];
            if (!player || player.eliminated) return;

            // Coop: only current turn player
            if (gs.mode === "coop" && sessionId !== gs.currentTurnId) return;

            // VS: player already solved
            if (gs.mode === "vs" && player.solved) return;

            const normalized = this.normalizeMotusWord(data.word ?? "");

            if (normalized.length !== gs.wordLength) return;
            if (normalized[0] !== gs.firstLetter) return;

            // Validate word exists in DB
            const wordExists = await prisma.word.findUnique({ where: { text: normalized } });
            if (!wordExists) {
                client.send("motus:invalid", { reason: "unknown_word" });
                return;
            }

            const result = this.computeMotusResult(this.motusSecret, normalized);
            const isSolved = result.every((r) => r === "correct");

            if (gs.mode === "vs") {
                // Store the real word privately — never written to gameStateJson
                const privateGuesses = this.motusVsGuesses.get(sessionId) ?? [];
                privateGuesses.push({ word: normalized, result });
                this.motusVsGuesses.set(sessionId, privateGuesses);

                // Public state: result only, word hidden
                player.guesses.push({ word: "", result });

                if (isSolved) {
                    player.solved = true;
                    player.solvedAt = Date.now();
                }
                // Check if all non-eliminated players are done
                const allDone = gs.playerOrder.every((id) => {
                    const p = gs.players[id];
                    if (!p || p.eliminated) return true;
                    return this.isMotusPlayerDone(gs, id);
                });
                if (allDone) {
                    this.endMotusRound(gs, null);
                }

                this.state.gameStateJson = JSON.stringify(gs);
                // Send the player their full private guess history
                client.send("motus:myGuesses", privateGuesses);
            } else {
                // Coop: guesses are shared and visible to all
                gs.sharedGuesses.push({ word: normalized, result });
                if (isSolved) {
                    this.endMotusRound(gs, sessionId);
                } else if (gs.maxAttempts > 0 && gs.sharedGuesses.length >= gs.maxAttempts) {
                    this.endMotusRound(gs, null);
                } else {
                    gs.currentTurnId = this.nextCoopPlayer(gs);
                }
                this.state.gameStateJson = JSON.stringify(gs);
            }
        },

        "motus:typing": (client: Client, data: { input: string }) => {
            if (this.state.status !== "game" || this.state.selectedGameSlug !== "motus") return;
            let gs: MotusGameState;
            try { gs = JSON.parse(this.state.gameStateJson) as MotusGameState; } catch { return; }
            if (gs.phase !== "playing" || gs.mode !== "coop") return;
            if (gs.currentTurnId !== client.sessionId) return;
            // Relay to all other clients (spectators see live typing)
            this.broadcast("motus:typing", { input: data.input ?? "" }, { except: client });
        },

        "tron:input": (client: Client, data: { dir: string }) => {
            if (this.state.status !== "game") return;
            const validDirs = ["up", "down", "left", "right"];
            if (!validDirs.includes(data.dir)) return;
            this.tronDirs.set(client.sessionId, data.dir as TronPlayer["dir"]);
        },

        "bomberman:move": (client: Client, data: { dir: string }) => {
            if (this.state.status !== "game") return;
            const validDirs = ["up", "down", "left", "right"];
            if (!validDirs.includes(data.dir)) return;
            this.bombermanMovePending.set(client.sessionId, data.dir as "up" | "down" | "left" | "right");
        },

        "bomberman:bomb": (client: Client) => {
            if (this.state.status !== "game") return;
            this.bombermanBombsPending.add(client.sessionId);
        },
    };
}
