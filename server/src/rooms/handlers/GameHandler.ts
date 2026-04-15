import type { MapSchema } from "@colyseus/schema";
import type { LobbyPlayer } from "../schema/LobbyState.js";
import type { VoteConfig, VoteResult } from "../types/vote.js";

// ── Round carry-over between rounds of the same game session ──────────────────
export interface RoundCarryOver {
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    playerNames: Record<string, string>;
    playerOrder?: string[];
    playerAvatars?: Record<string, { username: string; gravatarUrl: string }>;
    roundWinnerIds?: string[];
    lastTurnPlayerId?: string;
}

// ── Dependencies injected by LobbyRoom into each handler ─────────────────────
export interface RoomContext {
    clock: {
        setTimeout(fn: () => void, delay: number): { clear(): void };
        setInterval(fn: () => void, delay: number): { clear(): void };
    };
    /** Live player map from LobbyState. */
    getPlayers(): MapSchema<LobbyPlayer>;
    /** Current gameStateJson string. */
    getState(): string;
    /** Write updated gameStateJson. */
    setState(json: string): void;
    /** Send a message to a single client by playerId. */
    sendTo(playerId: string, type: string, data?: unknown): void;
    /** Broadcast to all clients except the given playerId. */
    broadcastExcept(exceptPlayerId: string, type: string, data?: unknown): void;
    /** Returns the playerId as-is (identity — kept for compatibility). */
    getPlayerDbId(playerId: string): string | undefined;
    /** Called by the handler when the game (all rounds) has ended. */
    onGameEnded(roundPoints: Record<string, number>, winners?: string[]): void;
    /** Start a vote session visible to all clients. */
    startVote(config: VoteConfig, eligiblePlayerIds: string[], onEnd: (result: VoteResult) => void): void;
}

// ── Interface every game handler must implement ───────────────────────────────
export interface GameHandler {
    /**
     * Start a round. Called on first start and on each nextRound.
     * prevRound is null on the very first round.
     */
    init(options: Record<string, unknown>, prevRound: RoundCarryOver | null): Promise<void> | void;

    /**
     * Handle a game-specific message from a client.
     * type, sessionId, and raw data are forwarded from LobbyRoom.
     */
    onMessage(type: string, sessionId: string, data: unknown): Promise<void> | void;

    /**
     * Called when a player disconnects permanently during a game.
     * The handler should update the game state accordingly (skip turn, check end, etc.)
     */
    onEliminate(playerId: string): void;

    /**
     * If true, disconnecting during a game does NOT immediately eliminate the player.
     * The player stays in the roster with isConnected=false and can reconnect.
     * New players joining mid-game are added as active participants, not spectators.
     */
    allowsReconnection?(): boolean;

    /**
     * Called when a player (re)joins during an ongoing game (only when allowsReconnection=true).
     * The handler should add them to the game state if not already present,
     * or restore their active status if they were previously disconnected.
     */
    onPlayerJoin?(playerId: string): void;

    /**
     * Called when a player disconnects during a game that allows reconnection.
     * The handler should advance turns / update state as needed.
     */
    onPlayerDisconnect?(playerId: string): void;

    /**
     * Clean up all timers and intervals.
     * Called before the handler is replaced (nextRound or returnToLobby).
     */
    dispose(): void;

    /**
     * Skip the current turn for the given player (vote result).
     * Only implemented by handlers that support turn-skipping (e.g. Motus coop).
     */
    skipTurn?(targetPlayerId: string): void;
}
