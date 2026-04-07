import { Room, Client, CloseCode, ServerError } from "colyseus";
import { LobbyState, LobbyPlayer, ChatMessage } from "./schema/LobbyState.js";
import { verifyToken } from "../services/player.service.js";
import { createHash } from "crypto";
import { prisma } from "../lib/prisma.js";
import { recordGameSessions } from "../services/profile.service.js";
import type { GameHandler, RoomContext, RoundCarryOver } from "./handlers/GameHandler.js";
import { MemoryHandler }    from "./handlers/MemoryHandler.js";
import { TronHandler }      from "./handlers/TronHandler.js";
import { BombermanHandler } from "./handlers/BombermanHandler.js";
import { MotusHandler }     from "./handlers/MotusHandler.js";

interface JoinOptions {
    username?: string;
    token?: string;
}

interface AuthPayload {
    playerId: number;
    username: string;
    gravatarUrl: string;
}

export class LobbyRoom extends Room<LobbyState> {
    maxClients = 8;

    private playerIdMap         = new Map<number, string>();
    private sessionToPlayerId   = new Map<string, number>();
    private staleSessionByPlayerId = new Map<number, string>();
    private replacedSessions    = new Set<string>();

    private prevRound: RoundCarryOver | null = null;
    private playerIdSnapshot: Record<string, number> = {};
    private activeHandler: GameHandler | null = null;

    // ── Room lifecycle ────────────────────────────────────────────────────────

    onCreate(_options: Record<string, unknown>) {
        this.setState(new LobbyState());
        this.autoDispose = true;

        // ── Generic lobby messages ────────────────────────────────────────────
        this.onMessage("ready", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            player.isReady = !player.isReady;
        });

        this.onMessage("selectGame", async (client: Client, data: { slug: string }) => {
            if (client.sessionId !== this.state.hostId) return;
            this.state.selectedGameSlug = data.slug ?? "";
            const gm = await prisma.gameMode.findUnique({ where: { slug: data.slug } });
            if (gm?.options && typeof gm.options === "object") {
                const opts = gm.options as Record<string, { default: unknown }>;
                const defaults: Record<string, unknown> = {};
                for (const [key, def] of Object.entries(opts)) defaults[key] = def.default;
                this.state.gameOptionsJson = JSON.stringify(defaults);
            } else {
                this.state.gameOptionsJson = "{}";
            }
        });

        this.onMessage("setOptions", (client: Client, data: { options: Record<string, unknown> }) => {
            if (client.sessionId !== this.state.hostId) return;
            this.state.gameOptionsJson = JSON.stringify(data.options ?? {});
        });

        this.onMessage("chat", (client: Client, data: { text: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !data.text?.trim()) return;
            const msg = new ChatMessage();
            msg.username  = player.username;
            msg.text      = data.text.trim().slice(0, 200);
            msg.timestamp = Date.now();
            this.state.chatHistory.push(msg);
            if (this.state.chatHistory.length > 50) this.state.chatHistory.splice(0, 1);
        });

        this.onMessage("kick", (client: Client, data: { sessionId: string }) => {
            if (client.sessionId !== this.state.hostId) return;
            const target = data?.sessionId;
            if (!target || target === client.sessionId) return;
            const targetPlayer = this.state.players.get(target);
            if (!targetPlayer) return;
            if (this.state.status === "game") {
                if (targetPlayer.isConnected || targetPlayer.isEliminated) return;
                this.eliminatePlayer(target);
            } else {
                const targetClient = this.clients.find((c) => c.sessionId === target);
                if (!targetClient) return;
                targetClient.send("kicked");
                targetClient.leave(4001);
            }
        });

        this.onMessage("start", async (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (!this.state.selectedGameSlug) return;
            if (this.state.players.size < 1) return;
            if (this.state.isStarted) return;

            this.prevRound = null;
            this.state.isStarted = true;

            this.playerIdSnapshot = {};
            this.sessionToPlayerId.forEach((playerId, sessionId) => {
                this.playerIdSnapshot[sessionId] = playerId;
            });

            const slug    = this.state.selectedGameSlug;
            const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;

            this.activeHandler = this.createHandler(slug);
            await this.activeHandler.init(options, null);

            this.state.status = "game";
            this.broadcast("game:start", { roomId: this.roomId, gameSlug: slug, options });
        });

        this.onMessage("nextRound", async (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (this.state.status !== "game") return;

            let gs: { phase?: string; currentRound?: number; maxRounds?: number; roundPoints?: Record<string, number>; playerNames?: Record<string, string>; playerOrder?: string[] };
            try { gs = JSON.parse(this.state.gameStateJson) as typeof gs; }
            catch { return; }
            if (gs.phase !== "roundEnd") return;

            this.prevRound = {
                currentRound: (gs.currentRound ?? 1) + 1,
                maxRounds:    gs.maxRounds ?? 1,
                roundPoints:  gs.roundPoints ?? {},
                playerNames:  gs.playerNames ?? {},
                playerOrder:  gs.playerOrder,
            };

            this.activeHandler?.dispose();

            const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
            await this.activeHandler?.init(options, this.prevRound);
        });

        this.onMessage("returnToLobby", (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (this.state.status !== "game") return;
            try {
                const gs = JSON.parse(this.state.gameStateJson) as { phase?: string };
                if (gs.phase !== "ended") return;
            } catch { return; }

            this.activeHandler?.dispose();
            this.activeHandler = null;
            this.prevRound = null;
            this.staleSessionByPlayerId.clear();

            const toRemove: string[] = [];
            this.state.players.forEach((p) => {
                if (p.isEliminated || !p.isConnected || p.isSpectator) toRemove.push(p.id);
            });
            for (const sid of toRemove) {
                const playerId = this.sessionToPlayerId.get(sid);
                if (playerId) {
                    this.playerIdMap.delete(playerId);
                    this.sessionToPlayerId.delete(sid);
                }
                this.state.players.delete(sid);
            }

            if (this.state.players.size > 0 && !this.state.players.has(this.state.hostId)) {
                const nextEntry = this.state.players.entries().next().value as [string, LobbyPlayer] | undefined;
                if (nextEntry) {
                    const [nextId, nextPlayer] = nextEntry;
                    nextPlayer.isHost = true;
                    this.state.hostId = nextId;
                }
            }

            this.state.isStarted = false;
            this.state.status    = "lobby";
            this.state.gameStateJson = "{}";
            this.state.players.forEach((p) => {
                p.isReady = false; p.isEliminated = false; p.isConnected = true;
            });
            this.broadcast("lobby:return", { roomId: this.roomId });
            console.log(`[LobbyRoom ${this.roomId}] host returned everyone to lobby (removed ${toRemove.length} ghost players)`);
        });

        // ── Game-specific messages → delegate to active handler ───────────────
        const gameMsgs = [
            "flipCard",
            "tron:input",
            "bomberman:move",
            "bomberman:bomb",
            "motus:guess",
            "motus:typing",
            "forceEndRound",
        ];
        for (const type of gameMsgs) {
            this.onMessage(type, (client: Client, data: unknown) => {
                if (this.state.status !== "game" || !this.activeHandler) return;
                // forceEndRound: host-only check here so handlers don't need to know about hostId
                if (type === "forceEndRound" && client.sessionId !== this.state.hostId) return;
                void this.activeHandler.onMessage(type, client.sessionId, data);
            });
        }
    }

    async onAuth(_client: Client, options: JoinOptions): Promise<AuthPayload> {
        if (!options.token) throw new ServerError(401, "Token manquant");

        let payload: { playerId: number; username: string };
        try { payload = verifyToken(options.token) as { playerId: number; username: string }; }
        catch { throw new ServerError(401, "Token invalide"); }

        const dbPlayer = await prisma.player.findUnique({
            where: { id: payload.playerId },
            select: { email: true },
        });
        const email      = dbPlayer?.email ?? null;
        const gravatarUrl = email
            ? `https://www.gravatar.com/avatar/${createHash("md5").update(email.trim().toLowerCase()).digest("hex")}?d=retro&s=128`
            : "";

        return { ...payload, gravatarUrl };
    }

    onJoin(client: Client, _options: JoinOptions, auth: AuthPayload) {
        const staleSessionId = this.staleSessionByPlayerId.get(auth.playerId);
        if (staleSessionId) {
            this.state.players.delete(staleSessionId);
            this.staleSessionByPlayerId.delete(auth.playerId);
        }

        // Session takeover: if the player is already connected, kick the old session
        const existingSessionId = this.playerIdMap.get(auth.playerId);
        let inheritedPlayer: LobbyPlayer | undefined;
        if (existingSessionId) {
            inheritedPlayer = this.state.players.get(existingSessionId);
            this.replacedSessions.add(existingSessionId);
            this.playerIdMap.delete(auth.playerId);
            this.sessionToPlayerId.delete(existingSessionId);
            this.state.players.delete(existingSessionId);
            // Rename old sessionId to new one everywhere in the game state JSON
            if (this.state.status === "game" && this.state.gameStateJson) {
                this.state.gameStateJson = this.state.gameStateJson
                    .replaceAll(existingSessionId, client.sessionId);
            }
            const oldClient = this.clients.find(c => c.sessionId === existingSessionId);
            if (oldClient) {
                oldClient.send("kicked", { reason: "session_replaced" });
                oldClient.leave(4000);
            }
            console.log(`[LobbyRoom ${this.roomId}] ${auth.username} took over session ${existingSessionId}`);
        }

        const isFirstPlayer = this.state.players.size === 0;
        const player        = new LobbyPlayer();
        player.id           = client.sessionId;
        player.username     = auth.username.trim().slice(0, 32);
        player.gravatarUrl  = auth.gravatarUrl;
        player.isConnected  = true;

        if (inheritedPlayer) {
            player.isHost       = inheritedPlayer.isHost;
            player.isReady      = inheritedPlayer.isReady;
            player.isEliminated = inheritedPlayer.isEliminated;
            player.isSpectator  = inheritedPlayer.isSpectator;
            if (inheritedPlayer.isHost) this.state.hostId = client.sessionId;
        } else {
            player.isHost       = isFirstPlayer;
            player.isReady      = false;
            player.isEliminated = false;
            if (isFirstPlayer) this.state.hostId = client.sessionId;
            if (this.state.status === "game") {
                player.isSpectator = true;
                player.isReady     = true;
            }
        }

        this.playerIdMap.set(auth.playerId, client.sessionId);
        this.sessionToPlayerId.set(client.sessionId, auth.playerId);
        this.state.players.set(client.sessionId, player);
        console.log(`[LobbyRoom ${this.roomId}] ${player.username} joined (host: ${player.isHost}, spectator: ${player.isSpectator})`);
    }

    async onLeave(client: Client, code: CloseCode) {
        if (this.replacedSessions.has(client.sessionId)) {
            this.replacedSessions.delete(client.sessionId);
            return;
        }
        const leaving = this.state.players.get(client.sessionId);
        if (!leaving) return;
        console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} left (code: ${code})`);

        if (this.state.isStarted && !leaving.isSpectator && code !== CloseCode.CONSENTED) {
            // Unexpected disconnect during game → allow reconnection window
            leaving.isConnected = false;
            const allowRecon = await this.allowReconnection(client, 30);

            // Check if any active (non-spectator, non-eliminated) players remain
            let hasConnectedActive = false;
            let hasDisconnectedActive = false;
            this.state.players.forEach((p) => {
                if (!p.isSpectator && !p.isEliminated) {
                    if (p.isConnected) hasConnectedActive = true;
                    else hasDisconnectedActive = true;
                }
            });

            if (!hasConnectedActive && hasDisconnectedActive) {
                // All active players disconnected → end game
                const toEliminate: string[] = [];
                this.state.players.forEach((p) => {
                    if (!p.isSpectator && !p.isEliminated) toEliminate.push(p.id);
                });
                for (const sid of toEliminate) this.eliminatePlayer(sid);
                return;
            }

            try { await allowRecon; }
            catch { this.eliminatePlayer(client.sessionId); }
        } else if (this.state.isStarted && !leaving.isSpectator && code === CloseCode.CONSENTED) {
            this.eliminatePlayer(client.sessionId);
        } else {
            this.removePlayer(client.sessionId, leaving);
        }
    }

    onDispose() {
        this.activeHandler?.dispose();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private removePlayer(sessionId: string, leaving: LobbyPlayer) {
        const playerId = this.sessionToPlayerId.get(sessionId);
        if (playerId) {
            this.playerIdMap.delete(playerId);
            this.sessionToPlayerId.delete(sessionId);
        }
        this.state.players.delete(sessionId);
        if (leaving.isHost && this.state.players.size > 0) {
            const nextEntry = this.state.players.entries().next().value as [string, LobbyPlayer] | undefined;
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
        player.isConnected  = false;

        const playerId = this.sessionToPlayerId.get(sessionId);
        if (playerId) {
            this.staleSessionByPlayerId.set(playerId, sessionId);
            this.playerIdMap.delete(playerId);
            this.sessionToPlayerId.delete(sessionId);
        }

        if (this.state.status === "game" && this.activeHandler) {
            this.activeHandler.onEliminate(sessionId);
        }
    }

    private createHandler(slug: string): GameHandler {
        const ctx = this.makeContext(slug);
        switch (slug) {
            case "memory":    return new MemoryHandler(ctx);
            case "tron":      return new TronHandler(ctx);
            case "bomberman": return new BombermanHandler(ctx);
            case "motus":     return new MotusHandler(ctx);
            default: throw new Error(`Unknown game slug: ${slug}`);
        }
    }

    private makeContext(slug: string): RoomContext {
        const snapshot = { ...this.playerIdSnapshot };
        return {
            clock:        this.clock,
            getPlayers:   () => this.state.players,
            getState:     () => this.state.gameStateJson,
            setState:     (v) => { this.state.gameStateJson = v; },
            sendTo:       (sessionId, type, data) => {
                const c = this.clients.find(cl => cl.sessionId === sessionId);
                c?.send(type, data);
            },
            broadcastExcept: (exceptSessionId, type, data) => {
                const except = this.clients.find(cl => cl.sessionId === exceptSessionId);
                this.broadcast(type, data, except ? { except } : undefined);
            },
            onGameEnded:  (roundPoints, winners) => {
                void recordGameSessions(slug, snapshot, roundPoints, winners);
            },
        };
    }
}
