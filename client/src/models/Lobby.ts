export interface LobbyPlayer {
    id: string;         // DB playerId (stable)
    sessionId: string;  // current Colyseus session
    username: string;
    gravatarUrl: string;
    isHost: boolean;
    isReady: boolean;
    isConnected: boolean;
    isEliminated: boolean;
    isSpectator: boolean;
    isMuted: boolean;
    wantsToPlay: boolean;
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

// ── Generic game state (shared shell) ─────────────────────────────────────

export interface GenericPlayerData {
    /** Color dot for canvas games (Tron, Bomberman). */
    color?: string;
    /** Whether the player is alive this round (Tron, Bomberman). */
    isAlive?: boolean;
    /** Score for the current round (pairs in Memory, apples in Snake). */
    roundScore?: number;
    /** Unit label for roundScore (e.g. "paires"). */
    roundScoreUnit?: string;
}

export interface GenericGameState {
    phase: string;
    playerOrder: string[];
    playerNames: Record<string, string>;
    roundPoints: Record<string, number>;
    roundWinnerIds: string[];
    currentRound: number;
    maxRounds: number;
    /** IDs of players that are currently "active" (alive, or taking a turn). */
    activePlayerIds?: string[];
    /** Per-player optional extras used by the generic scoreboard. */
    playerData?: Record<string, GenericPlayerData>;
    /** Optional subtitle shown under the winner name in the round-end overlay. */
    roundWinnerSubtitle?: string;
    /** If true, players are displayed in playerOrder order instead of sorted by points. */
    preserveOrder?: boolean;
}

// ── Motus ──────────────────────────────────────────────────────────────────

export type MotusLetterResult = 'correct' | 'misplaced' | 'absent';

export interface MotusGuess {
    word:       string;
    result:     MotusLetterResult[];
    guesserId?: string;
}

export interface MotusPlayerState {
    guesses:    MotusGuess[];
    solved:     boolean;
    solvedAt:   number;
    eliminated: boolean;
}

// ── Vote system ────────────────────────────────────────────────────────────

export type VoteType = 'word_quality' | 'skip_turn' | 'mute_player' | 'unmute_player';

export interface VoteState {
    voteId: string;
    type: VoteType;
    question: string;
    yesLabel: string;
    noLabel: string;
    targetPlayerId?: string;
    targetUsername?: string;
    deadline: number;
    yesCount: number;
    noCount: number;
    eligibleCount: number;
    myChoice: boolean | null; // null = not yet voted
    queueLength: number;      // votes waiting after the current one
}

export interface MotusGameState {
    phase:         'playing' | 'roundEnd' | 'ended';
    mode:          'vs' | 'coop';
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
    playerAvatars:  Record<string, { username: string; gravatarUrl: string }>;
    currentRound:   number;
    maxRounds:      number;
    roundPoints:    Record<string, number>;
    roundWinnerIds: string[];
    roundStartedAt: number;
}
