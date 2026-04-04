import type { GameHandler, RoomContext, RoundCarryOver } from "./GameHandler.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TronPlayer {
    x: number; y: number;
    dir: "up" | "down" | "left" | "right";
    alive: boolean; eliminated: boolean;
    color: string; score: number;
    eliminatedAt: number;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const TRON_SPEED_MS = [200, 150, 120, 80, 50];
const TRON_GRID_SIZES: Record<string, number> = { Petite: 20, Moyenne: 30, Grande: 40 };
const TRON_COLORS = ["#00e5ff", "#ff1744", "#76ff03", "#ff6d00"];
const SNAKE_APPLE_COUNT = 3;

const DIR_DELTAS: Record<string, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
};
const OPPOSITES: Record<string, string> = {
    up: "down", down: "up", left: "right", right: "left",
};

// ── Handler ───────────────────────────────────────────────────────────────────

export class TronHandler implements GameHandler {
    private ctx: RoomContext;
    private dirs    = new Map<string, TronPlayer["dir"]>();
    private trails  = new Map<string, number[]>();
    private interval: { clear(): void } | null = null;

    constructor(ctx: RoomContext) {
        this.ctx = ctx;
    }

    init(options: Record<string, unknown>, prevRound: RoundCarryOver | null): void {
        const speedIndex = Math.min(4, Math.max(0, parseInt(String(options["speed"] ?? "3"), 10) - 1));
        const mapSizeKey = String(options["mapSize"] ?? "Moyenne");
        const mode       = String(options["mode"] ?? "Tron") as "Tron" | "Snake";
        const gridSize   = TRON_GRID_SIZES[mapSizeKey] ?? 30;
        const tickMs     = TRON_SPEED_MS[speedIndex] ?? 120;

        const currentRound = prevRound?.currentRound ?? 1;
        const maxRounds    = prevRound?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number>  = { ...(prevRound?.roundPoints ?? {}) };
        const existingNames: Record<string, string> = prevRound?.playerNames ?? {};

        const startPositions: Array<{ x: number; y: number; dir: TronPlayer["dir"] }> = [
            { x: 2,           y: 2,           dir: "right" },
            { x: gridSize - 3, y: gridSize - 3, dir: "left"  },
            { x: gridSize - 3, y: 2,           dir: "down"  },
            { x: 2,           y: gridSize - 3, dir: "up"    },
        ];

        const playerIds = Array.from(this.ctx.getPlayers().keys())
            .filter(id => !this.ctx.getPlayers().get(id)?.isEliminated);

        const playerOrder: string[] = [];
        const players: Record<string, TronPlayer> = {};
        const playerNames: Record<string, string> = { ...existingNames };
        const grid = Array<string>(gridSize * gridSize).fill(".");

        this.dirs.clear();
        this.trails.clear();

        playerIds.forEach((sessionId, i) => {
            if (i >= 4) return;
            const sp = startPositions[i]!;
            const lp = this.ctx.getPlayers().get(sessionId);
            playerOrder.push(sessionId);
            playerNames[sessionId] = lp?.username ?? sessionId;

            players[sessionId] = {
                x: sp.x, y: sp.y, dir: sp.dir,
                alive: true, eliminated: false,
                color: TRON_COLORS[i]!,
                score: 0,
                eliminatedAt: 0,
            };
            this.dirs.set(sessionId, sp.dir);

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
                this.trails.set(sessionId, trail);
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

        const gs: TronGameState = {
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

        this.ctx.setState(JSON.stringify(gs));
        this.interval = this.ctx.clock.setInterval(() => this.tick(), tickMs);
    }

    onMessage(type: string, sessionId: string, data: unknown): void {
        if (type === "tron:input") {
            const dir = (data as { dir?: string }).dir;
            const valid = ["up", "down", "left", "right"];
            if (dir && valid.includes(dir)) {
                this.dirs.set(sessionId, dir as TronPlayer["dir"]);
            }
        }
    }

    onEliminate(sessionId: string): void {
        let gs: TronGameState;
        try { gs = JSON.parse(this.ctx.getState()) as TronGameState; }
        catch { return; }
        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const p = gs.players[sessionId];
        if (p) { p.alive = false; p.eliminated = true; p.eliminatedAt = gs.tick ?? 0; }

        this.checkRoundEnd(gs);
        this.ctx.setState(JSON.stringify(gs));
    }

    dispose(): void {
        this.interval?.clear();
        this.interval = null;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private tick(): void {
        let gs: TronGameState;
        try { gs = JSON.parse(this.ctx.getState()) as TronGameState; }
        catch { return; }
        if (gs.phase !== "playing") { this.dispose(); return; }

        gs.tick = (gs.tick ?? 0) + 1;
        const grid      = gs.grid.split("");
        const { gridSize, mode } = gs;
        const applesEaten = new Set<number>();

        for (const [sessionId, p] of Object.entries(gs.players)) {
            if (!p.alive) continue;
            const pIdx = gs.playerOrder.indexOf(sessionId);
            const pendingDir = this.dirs.get(sessionId);
            if (pendingDir && pendingDir !== OPPOSITES[p.dir]) p.dir = pendingDir;

            const { dx, dy } = DIR_DELTAS[p.dir] ?? { dx: 1, dy: 0 };
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
                const trail = this.trails.get(sessionId) ?? [];
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
                this.trails.set(sessionId, trail);
            }

            p.x = nx;
            p.y = ny;
        }

        if (mode === "Snake" && applesEaten.size > 0) {
            gs.apples = gs.apples.filter((_, i) => !applesEaten.has(i));
            for (let i = 0; i < applesEaten.size; i++) {
                const apple = this.spawnApple(grid, gridSize);
                if (apple) gs.apples.push(apple);
            }
        }

        gs.grid = grid.join("");
        this.checkRoundEnd(gs);
        this.ctx.setState(JSON.stringify(gs));
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

    private calcWinners(gs: TronGameState): string[] {
        const { players, playerOrder, mode } = gs;
        const alive = playerOrder.filter(id => players[id]?.alive);

        if (alive.length === 1) return alive;
        if (alive.length > 1) {
            if (mode === "Snake") {
                const maxScore = Math.max(...alive.map(id => players[id]?.score ?? 0));
                return alive.filter(id => (players[id]?.score ?? 0) === maxScore);
            }
            return alive;
        }

        const allIds = playerOrder.filter(id => players[id]);
        if (allIds.length === 0) return [];
        const maxElimAt = Math.max(...allIds.map(id => players[id]?.eliminatedAt ?? 0));
        const lastDied  = allIds.filter(id => (players[id]?.eliminatedAt ?? 0) === maxElimAt);

        if (mode === "Snake" && lastDied.length > 1) {
            const maxScore = Math.max(...lastDied.map(id => players[id]?.score ?? 0));
            return lastDied.filter(id => (players[id]?.score ?? 0) === maxScore);
        }
        return lastDied;
    }

    private checkRoundEnd(gs: TronGameState): boolean {
        const aliveCount = Object.values(gs.players).filter(p => p.alive).length;
        if (aliveCount > 1) return false;

        const winners = this.calcWinners(gs);
        gs.roundWinnerIds = winners;
        if (winners.length === 1) {
            const wId = winners[0]!;
            gs.roundPoints[wId] = (gs.roundPoints[wId] ?? 0) + 1;
        }
        gs.phase = gs.currentRound >= gs.maxRounds ? "ended" : "roundEnd";
        if (gs.phase === "ended") this.ctx.onGameEnded(gs.roundPoints);
        this.dispose();
        return true;
    }
}
