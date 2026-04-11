import type { GameHandler, RoomContext, RoundCarryOver } from "./GameHandler.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BombermanPlayer {
    x: number; y: number;
    alive: boolean; eliminated: boolean;
    lives: number; score: number;
    bombsMax: number; bombsPlaced: number;
    range: number; shield: boolean; invincibleTicks: number;
    color: string;
    eliminatedAt: number;
}

interface BombBM { id: number; x: number; y: number; ownerId: string; fuseLeft: number; range: number; }
interface ExplosionBM { cells: { x: number; y: number }[]; ticksLeft: number; }
interface BonusBM { x: number; y: number; type: "bomb" | "range" | "shield"; }

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
    bombTickEvery: number;
    bombTickMs: number;
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    roundWinnerIds: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GAME_TICK_MS     = 50;
const BOMB_TICK_SPEEDS = [300, 200, 150, 100, 75];
const FUSE_TICKS       = 20;
const EXPLOSION_TICKS  = 5;
const INVINCIBLE_TICKS = 8;
const BONUS_DROP_RATE  = 0.3;
const COLORS           = ["#00e5ff", "#ff1744", "#76ff03", "#ff6d00"];

const MAP_SIZES: Record<string, [number, number]> = {
    Petite:  [13, 11],
    Normale: [17, 13],
    Grande:  [21, 15],
};

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

// ── Handler ───────────────────────────────────────────────────────────────────

export class BombermanHandler implements GameHandler {
    private ctx: RoomContext;
    private movePending = new Map<string, "up" | "down" | "left" | "right">();
    private bombsPending = new Set<string>();
    private bombIdCounter = 0;
    private interval: { clear(): void } | null = null;

    constructor(ctx: RoomContext) {
        this.ctx = ctx;
    }

    init(options: Record<string, unknown>, prevRound: RoundCarryOver | null): void {
        const lives          = Math.min(5, Math.max(1, parseInt(String(options["lives"]      ?? "1"), 10)));
        const bombCount      = Math.min(3, Math.max(1, parseInt(String(options["bombCount"]  ?? "1"), 10)));
        const bombRange      = Math.min(4, Math.max(1, parseInt(String(options["bombRange"]  ?? "2"), 10)));
        const bombSpeedIndex = Math.min(4, Math.max(0, parseInt(String(options["bombSpeed"]  ?? "3"), 10) - 1));
        const bombTickMs     = BOMB_TICK_SPEEDS[bombSpeedIndex] ?? 150;
        const bombTickEvery  = Math.max(1, Math.round(bombTickMs / GAME_TICK_MS));
        const mapSizeKey     = String(options["mapSize"] ?? "Normale");

        const currentRound = prevRound?.currentRound ?? 1;
        const maxRounds    = prevRound?.maxRounds ?? parseInt(String(options["rounds"] ?? "1"), 10);
        const roundPoints: Record<string, number>  = { ...(prevRound?.roundPoints ?? {}) };
        const existingNames: Record<string, string> = prevRound?.playerNames ?? {};

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
        for (const [cx, cy] of spawnCorners) clearSpawnZone(grid, cx!, cy!, cols, rows);
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === "0" && Math.random() < 0.6) grid[i] = "2";
        }
        for (const [cx, cy] of spawnCorners) clearSpawnZone(grid, cx!, cy!, cols, rows);

        const playerIds = Array.from(this.ctx.getPlayers().keys())
            .filter(id => !this.ctx.getPlayers().get(id)?.isEliminated);

        const playerOrder: string[] = [];
        const players: Record<string, BombermanPlayer> = {};
        const playerNames: Record<string, string> = { ...existingNames };

        this.movePending.clear();
        this.bombsPending.clear();
        this.bombIdCounter = 0;

        playerIds.forEach((playerId, i) => {
            if (i >= 4) return;
            const corner = spawnCorners[i] ?? [0, 0];
            const lp = this.ctx.getPlayers().get(playerId);
            playerOrder.push(playerId);
            playerNames[playerId] = lp?.username ?? playerId;
            players[playerId] = {
                x: corner[0]!, y: corner[1]!,
                alive: true, eliminated: false,
                lives,
                score: 0,
                bombsMax: bombCount, bombsPlaced: 0,
                range: bombRange,
                shield: false, invincibleTicks: 0,
                color: COLORS[i]!,
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

        this.ctx.setState(JSON.stringify(gs));
        this.interval = this.ctx.clock.setInterval(() => this.tick(), GAME_TICK_MS);
    }

    onMessage(type: string, playerId: string, data: unknown): void {
        if (type === "bomberman:move") {
            const dir = (data as { dir?: string }).dir;
            const valid = ["up", "down", "left", "right"];
            if (dir && valid.includes(dir)) {
                this.movePending.set(playerId, dir as "up" | "down" | "left" | "right");
            }
        } else if (type === "bomberman:bomb") {
            this.bombsPending.add(playerId);
        }
    }

    onEliminate(playerId: string): void {
        let gs: BombermanGameState;
        try { gs = JSON.parse(this.ctx.getState()) as BombermanGameState; }
        catch { return; }
        if (gs.phase === "ended" || gs.phase === "roundEnd") return;

        const p = gs.players[playerId];
        if (p) { p.lives = 0; p.alive = false; p.eliminated = true; p.eliminatedAt = gs.tick ?? 0; }

        this.checkRoundEnd(gs);
        this.ctx.setState(JSON.stringify(gs));
    }

    dispose(): void {
        this.interval?.clear();
        this.interval = null;
        this.movePending.clear();
        this.bombsPending.clear();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private tick(): void {
        let gs: BombermanGameState;
        try { gs = JSON.parse(this.ctx.getState()) as BombermanGameState; }
        catch { return; }
        if (gs.phase !== "playing") { this.dispose(); return; }

        gs.tick = (gs.tick ?? 0) + 1;

        // TODO: read powerUps option — stored at init to avoid re-parsing each tick
        const runBombTick = gs.tick % (gs.bombTickEvery ?? 1) === 0;
        const { cols, rows } = gs;
        const grid = gs.grid.split("");

        const DIR_DELTAS: Record<string, { dx: number; dy: number }> = {
            up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
        };

        // 1. Movement
        for (const [playerId, p] of Object.entries(gs.players)) {
            if (!p.alive) continue;
            const dir = this.movePending.get(playerId);
            if (!dir) continue;
            const { dx, dy } = DIR_DELTAS[dir];
            const nx = p.x + dx;
            const ny = p.y + dy;
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const cell = grid[ny * cols + nx];
                if (cell !== "1" && cell !== "2" && !gs.bombs.some((b) => b.x === nx && b.y === ny)) {
                    p.x = nx; p.y = ny;
                }
            }
        }
        this.movePending.clear();

        // 2. Bomb placement
        for (const playerId of this.bombsPending) {
            const p = gs.players[playerId];
            if (!p || !p.alive) continue;
            if (p.bombsPlaced >= p.bombsMax) continue;
            if (gs.bombs.some((b) => b.x === p.x && b.y === p.y)) continue;
            gs.bombs.push({ id: this.bombIdCounter++, x: p.x, y: p.y, ownerId: playerId, fuseLeft: FUSE_TICKS, range: p.range });
            p.bombsPlaced++;
        }
        this.bombsPending.clear();

        if (runBombTick) {
            // 3. Fuse tick & chain explosions
            const newBombs: BombBM[] = [];
            const explodingBombs: BombBM[] = [];
            for (const bomb of gs.bombs) {
                bomb.fuseLeft--;
                if (bomb.fuseLeft <= 0) explodingBombs.push(bomb);
                else newBombs.push(bomb);
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
                        const cell    = grid[cellIdx]!;
                        if (cell === "1") break;
                        cells.push({ x: ex, y: ey });
                        if (cell === "2") {
                            grid[cellIdx] = "0";
                            if (Math.random() < BONUS_DROP_RATE) {
                                const types: BonusBM["type"][] = ["bomb", "range", "shield"];
                                gs.bonuses.push({ x: ex, y: ey, type: types[Math.floor(Math.random() * types.length)]! });
                            }
                            break;
                        }
                        const chainBomb = newBombs.find((b) => b.x === ex && b.y === ey);
                        if (chainBomb) { newBombs.splice(newBombs.indexOf(chainBomb), 1); toExplode.push(chainBomb); }
                    }
                }
                gs.explosions.push({ cells, ticksLeft: EXPLOSION_TICKS });
            }
            gs.bombs = newBombs.filter((b) => !explodedIds.has(b.id));
            gs.grid  = grid.join("");

            // 4. Explosion damage & cleanup
            const newExplosions: ExplosionBM[] = [];
            for (const exp of gs.explosions) {
                exp.ticksLeft--;
                for (const [playerId, p] of Object.entries(gs.players)) {
                    if (!p.alive || p.invincibleTicks > 0) continue;
                    if (!exp.cells.some((c) => c.x === p.x && c.y === p.y)) continue;
                    if (p.shield) {
                        p.shield = false;
                        p.invincibleTicks = INVINCIBLE_TICKS;
                    } else {
                        p.lives--;
                        if (p.lives <= 0) {
                            p.alive = false; p.eliminated = true; p.eliminatedAt = gs.tick;
                        } else {
                            p.invincibleTicks = INVINCIBLE_TICKS;
                            const pi = gs.playerOrder.indexOf(playerId);
                            const dynamicCorners = [[0, 0], [gs.cols - 1, 0], [0, gs.rows - 1], [gs.cols - 1, gs.rows - 1]];
                            const corner = dynamicCorners[pi] ?? dynamicCorners[0]!;
                            p.x = corner[0]!; p.y = corner[1]!;
                        }
                    }
                }
                if (exp.ticksLeft > 0) newExplosions.push(exp);
            }
            gs.explosions = newExplosions;

            // 5. Decrement invincibility
            for (const p of Object.values(gs.players)) {
                if (p.alive && p.invincibleTicks > 0) p.invincibleTicks--;
            }

            // 6. Bonus pickup
            const remainingBonuses: BonusBM[] = [];
            for (const bonus of gs.bonuses) {
                let picked = false;
                for (const p of Object.values(gs.players)) {
                    if (!p.alive || p.x !== bonus.x || p.y !== bonus.y) continue;
                    if (bonus.type === "bomb") p.bombsMax++;
                    else if (bonus.type === "range") p.range++;
                    else if (bonus.type === "shield") p.shield = true;
                    picked = true;
                    break;
                }
                if (!picked) remainingBonuses.push(bonus);
            }
            gs.bonuses = remainingBonuses;

            // 7. Win check
            this.checkRoundEnd(gs);
        }

        this.ctx.setState(JSON.stringify(gs));
    }

    private checkRoundEnd(gs: BombermanGameState): boolean {
        const aliveCount = Object.values(gs.players).filter(p => p.alive).length;
        if (aliveCount > 1) return false;

        const alive = gs.playerOrder.filter(id => gs.players[id]?.alive);
        let winners: string[];
        if (alive.length >= 1) {
            winners = alive;
        } else {
            const maxElimAt = Math.max(...gs.playerOrder.map(id => gs.players[id]?.eliminatedAt ?? 0));
            winners = gs.playerOrder.filter(id => (gs.players[id]?.eliminatedAt ?? 0) === maxElimAt);
        }

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
