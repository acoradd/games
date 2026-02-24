import { Room, Client, CloseCode, ServerError } from "colyseus";
import { LobbyState, LobbyPlayer, ChatMessage } from "./schema/LobbyState.js";
import { verifyToken } from "../services/player.service.js";

interface JoinOptions {
    username?: string;
    token?: string;
}

interface AuthPayload {
    playerId: number;
    username: string;
}

// ── Memory game types (server-only) ────────────────────────────────────────
interface MemoryCard {
    id: number;
    value: number;
    isFlipped: boolean;
    isMatched: boolean;
}

interface MemoryGameState {
    phase: "picking1" | "picking2" | "revealing" | "ended";
    currentTurnId: string;
    firstFlippedIndex: number;
    cards: MemoryCard[];
    scores: Record<string, number>;
    turnDeadline: number;                   // ms timestamp, 0 = no timer
    playerNames: Record<string, string>;    // sessionId → username (snapshot at start)
}

// ── Tron game types (server-only) ──────────────────────────────────────────
interface TronGameState {
    phase: "playing" | "ended";
    mode: "Tron" | "Snake";
    gridSize: number;
    grid: string;                          // gridSize² chars: '.' or '0'-'3'
    players: Record<string, TronPlayer>;
    playerOrder: string[];                 // sessionIds → indices 0-3
    apples: { x: number; y: number }[];   // Snake only
    playerNames: Record<string, string>;
}
interface TronPlayer {
    x: number; y: number;
    dir: "up" | "down" | "left" | "right";
    alive: boolean; eliminated: boolean;
    color: string; score: number;
}

// ── Bomberman game types (server-only) ─────────────────────────────────────
interface BombermanGameState {
    phase: "playing" | "ended";
    cols: number; rows: number; // 13×11
    grid: string;               // cols*rows chars: '0'=empty, '1'=wall, '2'=block
    players: Record<string, BombermanPlayer>;
    playerOrder: string[];
    bombs: BombBM[];
    explosions: ExplosionBM[];
    bonuses: BonusBM[];
    playerNames: Record<string, string>;
}
interface BombermanPlayer {
    x: number; y: number;
    alive: boolean; eliminated: boolean;
    lives: number; score: number;
    bombsMax: number; bombsPlaced: number;
    range: number;
    shield: boolean; invincibleTicks: number;
    color: string;
}
interface BombBM { id: number; x: number; y: number; ownerId: string; fuseLeft: number; range: number; }
interface ExplosionBM { cells: { x: number; y: number }[]; ticksLeft: number; }
interface BonusBM { x: number; y: number; type: "bomb" | "range" | "shield"; }

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

const BOMB_COLS = 13, BOMB_ROWS = 11;
const BOMB_TICK_MS = 150;
const FUSE_TICKS = 20;
const EXPLOSION_TICKS = 5;
const INVINCIBLE_TICKS = 8;
const BONUS_DROP_RATE = 0.3;
const SPAWN_CORNERS = [[0, 0], [12, 0], [0, 10], [12, 10]];
// offsets safe from each corner (col-offset, row-offset)
const SPAWN_SAFE_OFFSETS = [[1, 0], [0, 1], [1, 1]];

export class LobbyRoom extends Room<{ state: LobbyState }> {
    maxClients = 8;

    // playerId → sessionId (active connections only)
    private playerIdMap = new Map<number, string>();
    // sessionId → playerId (reverse lookup for cleanup)
    private sessionToPlayerId = new Map<string, number>();

    private currentTurnTimer: { clear(): void } | null = null;

    // Tron server-only state
    private tronDirs = new Map<string, "up" | "down" | "left" | "right">();
    private snakeTrails = new Map<string, number[]>();

    // Bomberman server-only state
    private bombermanDirs = new Map<string, "up" | "down" | "left" | "right" | null>();
    private bombermanBombsPending = new Set<string>();
    private bombIdCounter = 0;

    private gameSimInterval: { clear(): void } | null = null;

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

        this.playerIdMap.set(auth.playerId, client.sessionId);
        this.sessionToPlayerId.set(client.sessionId, auth.playerId);

        this.state.players.set(client.sessionId, player);
        console.log(`[LobbyRoom ${this.roomId}] ${player.username} joined (host: ${player.isHost})`);
    }

    async onLeave(client: Client, code: CloseCode) {
        const leaving = this.state.players.get(client.sessionId);
        if (!leaving) return;

        console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} left (code: ${code})`);

        if (this.state.isStarted && code !== CloseCode.CONSENTED) {
            // Unexpected disconnect during game → attempt reconnection
            leaving.isConnected = false;
            try {
                await this.allowReconnection(client, 30);
                // Successfully reconnected
                leaving.isConnected = true;
                console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} reconnected`);
            } catch {
                // Timeout — eliminate player
                console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} reconnection timed out, eliminating`);
                this.eliminatePlayer(client.sessionId);
            }
        } else if (this.state.isStarted && code === CloseCode.CONSENTED) {
            // Voluntary leave during game → eliminate immediately
            this.eliminatePlayer(client.sessionId);
        } else {
            // Lobby phase — standard removal
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

        // Free the playerId slot so the player can potentially rejoin as spectator
        const playerId = this.sessionToPlayerId.get(sessionId);
        if (playerId) {
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
        }
    }

    private eliminatePlayerMemory(sessionId: string) {
        let gs: MemoryGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as MemoryGameState;
        } catch {
            return;
        }

        if (gs.phase === "ended") return;

        const wasTheirTurn = gs.currentTurnId === sessionId;

        if (wasTheirTurn) {
            gs.cards.forEach((c) => {
                if (c.isFlipped && !c.isMatched) c.isFlipped = false;
            });
            gs.firstFlippedIndex = -1;
            this.nextTurn(gs);

            if ((gs as MemoryGameState).phase === "ended") {
                this.clearTurnTimer();
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
            gs.phase = "ended";
            this.clearTurnTimer();
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
        if (gs.phase === "ended") return;

        const p = gs.players[sessionId];
        if (p) {
            p.alive = false;
            p.eliminated = true;
        }

        const aliveCount = Object.values(gs.players).filter((pl) => pl.alive).length;
        if (aliveCount <= 1) {
            gs.phase = "ended";
            this.stopGameLoop();
        }
        this.state.gameStateJson = JSON.stringify(gs);
    }

    private eliminatePlayerBomberman(sessionId: string) {
        let gs: BombermanGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as BombermanGameState;
        } catch {
            return;
        }
        if (gs.phase === "ended") return;

        const p = gs.players[sessionId];
        if (p) {
            p.lives = 0;
            p.alive = false;
            p.eliminated = true;
        }

        const aliveCount = Object.values(gs.players).filter((pl) => pl.alive).length;
        if (aliveCount <= 1) {
            gs.phase = "ended";
            this.stopGameLoop();
        }
        this.state.gameStateJson = JSON.stringify(gs);
    }

    // ── Memory helpers ───────────────────────────────────────────────────────

    private nextTurn(state: MemoryGameState) {
        const playerIds = Object.keys(state.scores).filter((id) => {
            const p = this.state.players.get(id);
            return p && !p.isEliminated;
        });

        if (playerIds.length === 0) {
            state.phase = "ended";
            return;
        }

        const idx = playerIds.indexOf(state.currentTurnId);
        state.currentTurnId = playerIds[(idx + 1) % playerIds.length] ?? playerIds[0];
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

            if (gs.phase === "ended") return;

            gs.cards.forEach((c) => {
                if (c.isFlipped && !c.isMatched) c.isFlipped = false;
            });
            gs.firstFlippedIndex = -1;
            this.nextTurn(gs);

            if ((gs as MemoryGameState).phase === "ended") {
                this.clearTurnTimer();
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

        const symbolIndices = Array.from({ length: SYMBOLS.length }, (_, i) => i);
        const shuffled = symbolIndices.sort(() => Math.random() - 0.5).slice(0, pairs);
        const deck = [...shuffled, ...shuffled].sort(() => Math.random() - 0.5);

        const cards: MemoryCard[] = deck.map((value, id) => ({
            id, value, isFlipped: false, isMatched: false,
        }));

        const scores: Record<string, number> = {};
        const playerNames: Record<string, string> = {};
        this.state.players.forEach((p, sessionId) => {
            scores[sessionId] = 0;
            playerNames[sessionId] = p.username;
        });

        const playerIds = Array.from(this.state.players.keys());
        const initialState: MemoryGameState = {
            phase: "picking1",
            currentTurnId: playerIds[0] ?? "",
            firstFlippedIndex: -1,
            cards,
            scores,
            playerNames,
            turnDeadline: 0,
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

        const gs = gridSize;
        const startPositions: Array<{ x: number; y: number; dir: TronPlayer["dir"] }> = [
            { x: 2,      y: 2,      dir: "right" },
            { x: gs - 3, y: gs - 3, dir: "left" },
            { x: gs - 3, y: 2,      dir: "down" },
            { x: 2,      y: gs - 3, dir: "up" },
        ];

        const playerIds = Array.from(this.state.players.keys());
        const playerOrder: string[] = [];
        const players: Record<string, TronPlayer> = {};
        const playerNames: Record<string, string> = {};

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
            };

            this.tronDirs.set(sessionId, sp.dir);

            if (mode === "Snake") {
                // Initial trail: 3 cells behind the starting position
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
                // Tron: just mark starting cell
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

        if (gs.phase === "ended") { this.stopGameLoop(); return; }

        const grid = gs.grid.split("");
        const { gridSize, mode } = gs;

        const dirDeltas: Record<string, { dx: number; dy: number }> = {
            up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
        };
        const opposites: Record<string, string> = {
            up: "down", down: "up", left: "right", right: "left",
        };

        const applesEaten = new Set<number>(); // apple indices eaten this tick

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
                continue;
            }

            // Move
            const newIdx = ny * gridSize + nx;
            grid[newIdx] = String(pIdx);

            if (mode === "Snake") {
                const trail = this.snakeTrails.get(sessionId) ?? [];
                trail.unshift(newIdx);

                // Check apple
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

        // Respawn eaten apples (Snake)
        if (mode === "Snake" && applesEaten.size > 0) {
            const remaining = gs.apples.filter((_, i) => !applesEaten.has(i));
            gs.apples = remaining;
            for (let i = 0; i < applesEaten.size; i++) {
                const apple = this.spawnApple(grid, gridSize);
                if (apple) gs.apples.push(apple);
            }
        }

        gs.grid = grid.join("");

        const aliveCount = Object.values(gs.players).filter((p) => p.alive).length;
        if (aliveCount <= 1) {
            gs.phase = "ended";
            this.stopGameLoop();
        }

        this.state.gameStateJson = JSON.stringify(gs);
    }

    // ── Bomberman helpers ────────────────────────────────────────────────────

    private initBomberman() {
        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const lives      = Math.min(5, Math.max(1, parseInt(String(options["lives"]      ?? "3"), 10)));
        const bombCount  = Math.min(3, Math.max(1, parseInt(String(options["bombCount"]  ?? "1"), 10)));
        const bombRange  = Math.min(4, Math.max(1, parseInt(String(options["bombRange"]  ?? "2"), 10)));
        const powerUps   = options["powerUps"] !== false;
        const mapSizeKey = String(options["mapSize"] ?? "Normale");

        const MAP_SIZES: Record<string, [number, number]> = {
            Petite:  [11, 9],
            Normale: [13, 11],
            Grande:  [17, 13],
        };
        const [cols, rows] = MAP_SIZES[mapSizeKey] ?? [13, 11];

        // Spawn corners dynamic (always the 4 actual corners)
        const spawnCorners = [[0, 0], [cols - 1, 0], [0, rows - 1], [cols - 1, rows - 1]];

        const grid: string[] = [];

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                // Fixed walls at even interior positions
                if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1 && x % 2 === 0 && y % 2 === 0) {
                    grid.push("1");
                } else {
                    grid.push("0");
                }
            }
        }

        // Force spawn zones clear (corner + adjacent cells)
        for (const [cx, cy] of spawnCorners) {
            const cornerIdx = cy! * cols + cx!;
            grid[cornerIdx] = "0";
            for (const [ox, oy] of SPAWN_SAFE_OFFSETS) {
                const sx = cx! + ox!;
                const sy = cy! + oy!;
                if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
                    grid[sy * cols + sx] = "0";
                }
            }
        }

        // Fill destructible blocks (60% of remaining empty cells)
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === "0" && Math.random() < 0.6) {
                grid[i] = "2";
            }
        }

        // Force spawn corners clear again after random fill
        for (const [cx, cy] of spawnCorners) {
            const cornerIdx = cy! * cols + cx!;
            grid[cornerIdx] = "0";
            for (const [ox, oy] of SPAWN_SAFE_OFFSETS) {
                const sx = cx! + ox!;
                const sy = cy! + oy!;
                if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
                    grid[sy * cols + sx] = "0";
                }
            }
        }

        const bombermanColors = ["#00e5ff", "#ff1744", "#76ff03", "#ff6d00"];
        const playerIds = Array.from(this.state.players.keys());
        const playerOrder: string[] = [];
        const players: Record<string, BombermanPlayer> = {};
        const playerNames: Record<string, string> = {};

        this.bombermanDirs.clear();
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
            };
            this.bombermanDirs.set(sessionId, null);
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
        };

        this.state.gameStateJson = JSON.stringify(gs);
        this.gameSimInterval = this.clock.setInterval(() => this.bombermanTick(), BOMB_TICK_MS);
    }

    private bombermanTick() {
        let gs: BombermanGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as BombermanGameState;
        } catch { return; }

        if (gs.phase === "ended") { this.stopGameLoop(); return; }

        const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
        const powerUps = options["powerUps"] !== false;

        const { cols, rows } = gs;
        const grid = gs.grid.split("");

        // ── 1. Movement ──────────────────────────────────────────────────────
        for (const [sessionId, p] of Object.entries(gs.players)) {
            if (!p.alive) continue;
            const dir = this.bombermanDirs.get(sessionId);
            if (!dir) continue;

            const dirDeltas: Record<string, { dx: number; dy: number }> = {
                up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
                left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
            };
            const { dx, dy } = dirDeltas[dir] ?? { dx: 0, dy: 0 };
            const nx = p.x + dx;
            const ny = p.y + dy;

            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            const cell = grid[ny * cols + nx];
            if (cell === "1" || cell === "2") continue;
            // Check if a bomb is blocking
            const bombBlocking = gs.bombs.some((b) => b.x === nx && b.y === ny);
            if (bombBlocking) continue;

            p.x = nx;
            p.y = ny;
        }

        // ── 2. Bomb placement ────────────────────────────────────────────────
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

        // ── 3. Bomb fuse tick & explosions ───────────────────────────────────
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

        // Process explosions (chain reactions included)
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

                    if (cell === "1") break; // solid wall stops blast

                    cells.push({ x: ex, y: ey });

                    if (cell === "2") {
                        // Destroy block
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

                    // Check chain reaction — trigger other bombs in blast radius
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
                        if (lp) { lp.isEliminated = true; lp.isConnected = false; }
                    } else {
                        p.invincibleTicks = INVINCIBLE_TICKS;
                        // Respawn at player's corner (derived from map size)
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
        const aliveCount = Object.values(gs.players).filter((p) => p.alive).length;
        if (aliveCount <= 1) {
            // Award win point to survivor
            for (const p of Object.values(gs.players)) {
                if (p.alive) p.score++;
            }
            gs.phase = "ended";
            this.stopGameLoop();
        }

        this.state.gameStateJson = JSON.stringify(gs);
    }

    // ── Messages ────────────────────────────────────────────────────────────
    messages = {
        ready: (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            player.isReady = !player.isReady;
        },

        selectGame: (client: Client, data: { slug: string }) => {
            if (client.sessionId !== this.state.hostId) return;
            this.state.selectedGameSlug = data.slug ?? "";
            this.state.gameOptionsJson = "{}";
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
            this.state.isStarted = false;
            this.state.status = "lobby";
            this.state.gameStateJson = "{}";
            this.state.players.forEach((p) => {
                p.isReady = false;
                p.isEliminated = false;
                p.isConnected = true;
            });
            this.broadcast("lobby:return", { roomId: this.roomId });
            console.log(`[LobbyRoom ${this.roomId}] host returned everyone to lobby`);
        },

        start: (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (!this.state.selectedGameSlug) return;
            if (this.state.players.size < 1) return;
            if (this.state.isStarted) return;

            this.state.isStarted = true;

            const slug = this.state.selectedGameSlug;
            if (slug === "memory") {
                this.initMemory();
            } else if (slug === "tron") {
                this.initTron();
            } else if (slug === "bomberman") {
                this.initBomberman();
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

            if (phase === "revealing" || phase === "ended") return;
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
                        gameState.phase = "ended";
                        this.clearTurnTimer();
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
                        this.nextTurn(gs);

                        if ((gs as MemoryGameState).phase === "ended") {
                            this.state.gameStateJson = JSON.stringify(gs);
                            return;
                        }

                        gs.phase = "picking1";
                        this.startTurnTimer(gs);
                    }, 1500);
                }
            }
        },

        "tron:input": (client: Client, data: { dir: string }) => {
            if (this.state.status !== "game") return;
            const validDirs = ["up", "down", "left", "right"];
            if (!validDirs.includes(data.dir)) return;
            this.tronDirs.set(client.sessionId, data.dir as TronPlayer["dir"]);
        },

        "bomberman:move": (client: Client, data: { dir: string | null }) => {
            if (this.state.status !== "game") return;
            const validDirs = ["up", "down", "left", "right", null];
            if (!validDirs.includes(data.dir)) return;
            this.bombermanDirs.set(client.sessionId, data.dir as ("up" | "down" | "left" | "right" | null));
        },

        "bomberman:bomb": (client: Client) => {
            if (this.state.status !== "game") return;
            this.bombermanBombsPending.add(client.sessionId);
        },
    };
}
