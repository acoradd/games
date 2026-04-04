import type { MapSchema } from "@colyseus/schema";
import type { LobbyPlayer } from "../schema/LobbyState.js";

// ── Round carry-over between rounds of the same game session ──────────────────
export interface RoundCarryOver {
    currentRound: number;
    maxRounds: number;
    roundPoints: Record<string, number>;
    playerNames: Record<string, string>;
    playerOrder?: string[];
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
    /** Send a message to a single client by sessionId. */
    sendTo(sessionId: string, type: string, data?: unknown): void;
    /** Broadcast to all clients except the given sessionId. */
    broadcastExcept(exceptSessionId: string, type: string, data?: unknown): void;
    /** Called by the handler when the game (all rounds) has ended. */
    onGameEnded(roundPoints: Record<string, number>, winners?: string[]): void;
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
    onEliminate(sessionId: string): void;

    /**
     * Clean up all timers and intervals.
     * Called before the handler is replaced (nextRound or returnToLobby).
     */
    dispose(): void;
}
