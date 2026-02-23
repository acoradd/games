import { Room, Client, CloseCode } from "colyseus";
import { LobbyState, LobbyPlayer, ChatMessage } from "./schema/LobbyState.js";

interface JoinOptions {
    username?: string;
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

const SYMBOLS = [
    "🎮","🎲","🎯","⚽","🏀","🎾","🏆","🚀","🌟","🎪",
    "🎨","🎭","🎰","🎵","🎬","🌈","🍕","🦁","🐬","🌺",
    "🎸","🏄","🚂","🎃","🦊",
];

export class LobbyRoom extends Room<{ state: LobbyState }> {
    maxClients = 8;

    private currentTurnTimer: { clear(): void } | null = null;

    onCreate(_options: Record<string, unknown>) {
        this.setState(new LobbyState());
        this.autoDispose = true;
    }

    onJoin(client: Client, options: JoinOptions) {
        const isFirstPlayer = this.state.players.size === 0;

        const player = new LobbyPlayer();
        player.id = client.sessionId;
        player.username = options.username?.trim().slice(0, 32) ?? "Anonyme";
        player.isHost = isFirstPlayer;
        player.isReady = false;
        player.isConnected = true;
        player.isEliminated = false;

        if (isFirstPlayer) {
            this.state.hostId = client.sessionId;
        }

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
        console.log(`[LobbyRoom ${this.roomId}] disposed`);
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private removePlayer(sessionId: string, leaving: LobbyPlayer) {
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

        if (this.state.status !== "game") return;

        let gs: MemoryGameState;
        try {
            gs = JSON.parse(this.state.gameStateJson) as MemoryGameState;
        } catch {
            return;
        }

        if (gs.phase === "ended") return;

        const wasTheirTurn = gs.currentTurnId === sessionId;

        if (wasTheirTurn) {
            // Unflip any non-matched flipped cards (handles picking2 and revealing phases)
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
            // startTurnTimer serializes gs (with updated turnDeadline)
            this.startTurnTimer(gs);
            return;
        }

        // Not their turn — check if active players remain
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

            // Unflip all non-matched flipped cards
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

        // Build shuffled deck
        const symbolIndices = Array.from({ length: SYMBOLS.length }, (_, i) => i);
        const shuffled = symbolIndices.sort(() => Math.random() - 0.5).slice(0, pairs);
        const deck = [...shuffled, ...shuffled].sort(() => Math.random() - 0.5);

        const cards: MemoryCard[] = deck.map((value, id) => ({
            id,
            value,
            isFlipped: false,
            isMatched: false,
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

        // startTurnTimer serializes initialState into gameStateJson
        this.startTurnTimer(initialState);
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

            if (this.state.selectedGameSlug === "memory") {
                this.initMemory();
            }

            this.state.status = "game";

            this.broadcast("game:start", {
                roomId: this.roomId,
                gameSlug: this.state.selectedGameSlug,
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
                    // Match
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
                        // Same player gets another turn on match
                        gameState.phase = "picking1";
                        this.state.gameStateJson = JSON.stringify(gameState);
                        this.startTurnTimer(gameState);
                    }

                } else {
                    // No match — reveal briefly then flip back
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
                        // Guard: if eliminatePlayer already advanced the turn
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
    };
}
