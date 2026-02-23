import { Room, Client, CloseCode } from "colyseus";
import { LobbyState, LobbyPlayer, ChatMessage } from "./schema/LobbyState.js";

interface JoinOptions {
    username?: string;
}

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
            this.broadcast("game:start", {
                roomId: this.roomId,
                gameSlug: this.state.selectedGameSlug,
                options: JSON.parse(this.state.gameOptionsJson),
            });
        },
    };
}
