export interface LobbyPlayer {
    id: string;
    username: string;
    isHost: boolean;
    isReady: boolean;
    isConnected: boolean;
    isEliminated: boolean;
}

export interface ChatMsg {
    username: string;
    text: string;
    ts: number;
}

export interface LobbyState {
    hostId: string;
    isStarted: boolean;
    status: string;
    selectedGameSlug: string;
    gameOptionsJson: string;
    gameStateJson: string;
    players: Map<string, LobbyPlayer>;
    chatHistory: ChatMsg[];
}

export interface MemoryCard {
    id: number;
    value: number;
    isFlipped: boolean;
    isMatched: boolean;
}

export interface MemoryGameState {
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

export interface TronPlayer {
    x: number; y: number;
    dir: "up" | "down" | "left" | "right";
    alive: boolean; eliminated: boolean;
    color: string; score: number;
    eliminatedAt: number;
}
export interface TronGameState {
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

export interface BombermanPlayer {
    x: number; y: number;
    alive: boolean; eliminated: boolean;
    lives: number; score: number;
    bombsMax: number; bombsPlaced: number;
    range: number; shield: boolean; invincibleTicks: number;
    color: string;
    eliminatedAt: number;
}
export interface BombBM { id: number; x: number; y: number; ownerId: string; fuseLeft: number; range: number; }
export interface ExplosionBM { cells: { x: number; y: number }[]; ticksLeft: number; }
export interface BonusBM { x: number; y: number; type: "bomb" | "range" | "shield"; }
export interface BombermanGameState {
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
    bombTickMs: number;
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    roundWinnerIds: string[];
}
