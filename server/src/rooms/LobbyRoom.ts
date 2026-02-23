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
}

const SYMBOLS = [
    "🎮","🎲","🎯","⚽","🏀","🎾","🏆","🚀","🌟","🎪",
    "🎨","🎭","🎰","🎵","🎬","🌈","🍕","🦁","🐬","🌺",
    "🎸","🏄","🚂","🎃","🦊",
];

export class LobbyRoom extends Room<{ state: LobbyState }> {
    maxClients = 8;

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

        if (isFirstPlayer) {
            this.state.hostId = client.sessionId;
        }

        this.state.players.set(client.sessionId, player);
        console.log(`[LobbyRoom ${this.roomId}] ${player.username} joined (host: ${player.isHost})`);
    }

    onLeave(client: Client, _code: CloseCode) {
        const leaving = this.state.players.get(client.sessionId);
        if (!leaving) return;

        console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} left`);
        this.state.players.delete(client.sessionId);

        if (leaving.isHost && this.state.players.size > 0) {
            const nextEntry = this.state.players.entries().next().value;
            if (nextEntry) {
                const [nextId, nextPlayer] = nextEntry;
                nextPlayer.isHost = true;
                this.state.hostId = nextId;
            }
        }
    }

    onDispose() {
        console.log(`[LobbyRoom ${this.roomId}] disposed`);
    }

    // ── Private helpers ─────────────────────────────────────────────────────
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
        this.state.players.forEach((_p, sessionId) => {
            scores[sessionId] = 0;
        });

        const playerIds = Array.from(this.state.players.keys());
        const initialState: MemoryGameState = {
            phase: "picking1",
            currentTurnId: playerIds[0] ?? "",
            firstFlippedIndex: -1,
            cards,
            scores,
        };

        this.state.gameStateJson = JSON.stringify(initialState);
    }

    private nextTurn(state: MemoryGameState) {
        const playerIds = Array.from(this.state.players.keys());
        const idx = playerIds.indexOf(state.currentTurnId);
        state.currentTurnId = playerIds[(idx + 1) % playerIds.length] ?? state.currentTurnId;
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

                    const allMatched = cards.every((c) => c.isMatched);
                    if (allMatched) {
                        gameState.phase = "ended";
                    } else {
                        gameState.phase = "picking1";
                        // Same player gets another turn on match
                    }
                    gameState.firstFlippedIndex = -1;
                    this.state.gameStateJson = JSON.stringify(gameState);

                } else {
                    // No match — reveal briefly then flip back
                    // Capture ids before mutating state
                    const cardId = card.id;
                    const firstCardId = firstCard.id;

                    gameState.phase = "revealing";
                    gameState.firstFlippedIndex = -1;
                    this.state.gameStateJson = JSON.stringify(gameState);

                    this.clock.setTimeout(() => {
                        let gs: MemoryGameState;
                        try {
                            gs = JSON.parse(this.state.gameStateJson) as MemoryGameState;
                        } catch {
                            return;
                        }
                        const c1 = gs.cards.find((c) => c.id === cardId);
                        const c2 = gs.cards.find((c) => c.id === firstCardId);
                        if (c1 && !c1.isMatched) c1.isFlipped = false;
                        if (c2 && !c2.isMatched) c2.isFlipped = false;
                        this.nextTurn(gs);
                        gs.phase = "picking1";
                        this.state.gameStateJson = JSON.stringify(gs);
                    }, 1500);
                }
            }
        },
    };
}
