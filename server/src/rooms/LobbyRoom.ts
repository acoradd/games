import {Client, CloseCode, Room, ServerError} from 'colyseus';
import {createHash} from 'crypto';
import {prisma} from '../lib/prisma.js';
import {verifyToken} from '../services/player.service.js';
import {recordGameSessions} from '../services/profile.service.js';
import {BombermanHandler} from './handlers/BombermanHandler.js';
import type {GameHandler, RoomContext, RoundCarryOver} from './handlers/GameHandler.js';
import {MemoryHandler} from './handlers/MemoryHandler.js';
import {MotusHandler} from './handlers/MotusHandler.js';
import {TronHandler} from './handlers/TronHandler.js';
import {ChatMessage, LobbyPlayer, LobbyState} from './schema/LobbyState.js';
import {VoteManager} from './VoteManager.js';

interface JoinOptions {
    username?: string;
    token?: string;
}

interface AuthPayload {
    playerId: number;
    username: string;
    displayName: string;
    gravatarUrl: string;
}

export class LobbyRoom extends Room<{ state: LobbyState }> {
    maxClients = 8;

    private playerIdMap       = new Map<number, string>();   // playerId → active sessionId
    private sessionToPlayerId = new Map<string, number>();   // sessionId → playerId

    private prevRound: RoundCarryOver | null = null;
    private playerIdSnapshot: string[] = [];   // playerIds (strings) active at game start
    private activeHandler: GameHandler | null = null;
    private voteManager: VoteManager | null = null;

    // ── Room lifecycle ────────────────────────────────────────────────────────

    onCreate(_options: Record<string, unknown>) {
        this.setState(new LobbyState());
        this.autoDispose = true;

        // Initialise VoteManager
        this.voteManager = new VoteManager(
            (type, data) => this.broadcast(type, data),
            (fn, delay) => this.clock.setTimeout(fn, delay),
            (text) => {
                const msg = new ChatMessage();
                msg.username  = "Vote";
                msg.text      = text;
                msg.timestamp = Date.now();
                this.state.chatHistory.push(msg);
                if (this.state.chatHistory.length > 50) this.state.chatHistory.splice(0, 1);
            },
        );

        // ── Generic lobby messages ────────────────────────────────────────────

        this.onMessage("ready", (client: Client) => {
            const playerIdStr = this.getPlayerIdStr(client.sessionId);
            const player = playerIdStr ? this.state.players.get(playerIdStr) : undefined;
            if (!player) return;
            player.isReady = !player.isReady;
        });

        this.onMessage("selectGame", async (client: Client, data: { slug: string }) => {
            if (!this.isHost(client.sessionId)) return;
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
            if (!this.isHost(client.sessionId)) return;
            this.state.gameOptionsJson = JSON.stringify(data.options ?? {});
        });

        this.onMessage("chat", (client: Client, data: { text: string }) => {
            const playerIdStr = this.getPlayerIdStr(client.sessionId);
            const player = playerIdStr ? this.state.players.get(playerIdStr) : undefined;
            if (!player || !data.text?.trim()) return;
            if (player.isMuted) return;
            const msg = new ChatMessage();
            msg.username  = player.username;
            msg.text      = data.text.trim().slice(0, 200);
            msg.timestamp = Date.now();
            this.state.chatHistory.push(msg);
            if (this.state.chatHistory.length > 50) this.state.chatHistory.splice(0, 1);
        });

        this.onMessage("kick", (client: Client, data: { playerId: string }) => {
            if (!this.isHost(client.sessionId)) return;
            const target = data?.playerId;
            if (!target || target === this.state.hostId) return;
            const targetPlayer = this.state.players.get(target);
            if (!targetPlayer) return;

            if (this.state.status === "game") {
                if (targetPlayer.isConnected || targetPlayer.isEliminated) return;
                this.eliminatePlayer(target);
            } else {
                const targetNumericId = parseInt(target, 10);
                const targetSessionId = this.playerIdMap.get(targetNumericId);
                const targetClient = targetSessionId
                    ? this.clients.find((c) => c.sessionId === targetSessionId)
                    : undefined;
                if (!targetClient) return;
                targetClient.send("kicked");
                targetClient.leave(4001);
            }
        });

        this.onMessage("start", async (client: Client) => {
            if (!this.isHost(client.sessionId)) return;
            if (!this.state.selectedGameSlug) return;
            if (this.state.players.size < 1) return;
            if (this.state.isStarted) return;

            this.prevRound = null;
            this.state.isStarted = true;

            // Snapshot: list of active playerIds at game start
            this.playerIdSnapshot = [];
            this.state.players.forEach((p, playerIdStr) => {
                if (!p.isSpectator && !p.isEliminated) this.playerIdSnapshot.push(playerIdStr);
            });

            const slug    = this.state.selectedGameSlug;
            const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;

            this.activeHandler = this.createHandler(slug);
            await this.activeHandler.init(options, null);

            this.state.status = "game";
            this.broadcast("game:start", { roomId: this.roomId, gameSlug: slug, options });
        });

        this.onMessage("nextRound", async (client: Client) => {
            if (!this.isHost(client.sessionId)) return;
            if (this.state.status !== "game") return;

            let gs: { phase?: string; currentRound?: number; maxRounds?: number; roundPoints?: Record<string, number>; playerNames?: Record<string, string>; playerAvatars?: Record<string, { username: string; gravatarUrl: string }>; playerOrder?: string[]; roundWinnerIds?: string[]; currentTurnId?: string };
            try { gs = JSON.parse(this.state.gameStateJson) as typeof gs; }
            catch { return; }
            if (gs.phase !== "roundEnd") return;

            this.prevRound = {
                currentRound:    (gs.currentRound ?? 1) + 1,
                maxRounds:       gs.maxRounds ?? 1,
                roundPoints:     gs.roundPoints ?? {},
                playerNames:     gs.playerNames ?? {},
                playerAvatars:   gs.playerAvatars,
                playerOrder:     gs.playerOrder,
                roundWinnerIds:  gs.roundWinnerIds ?? [],
                lastTurnPlayerId: gs.currentTurnId,
            };

            this.activeHandler?.dispose();

            const options = JSON.parse(this.state.gameOptionsJson) as Record<string, unknown>;
            await this.activeHandler?.init(options, this.prevRound);
        });

        this.onMessage("returnToLobby", (client: Client) => {
            if (!this.isHost(client.sessionId)) return;
            if (this.state.status !== "game") return;
            try {
                const gs = JSON.parse(this.state.gameStateJson) as { phase?: string };
                if (gs.phase !== "ended") return;
            } catch { return; }
            this.doReturnToLobby();
        });

        this.onMessage("forceReturnToLobby", (client: Client) => {
            if (!this.isHost(client.sessionId)) return;
            if (this.state.status !== "game") return;
            this.doReturnToLobby();
        });

        this.onMessage("forfeit", (client: Client) => {
            if (this.state.status !== "game") return;
            const playerIdStr = this.getPlayerIdStr(client.sessionId);
            if (!playerIdStr) return;
            const player = this.state.players.get(playerIdStr);
            if (!player || player.isEliminated || player.isSpectator) return;
            this.eliminatePlayer(playerIdStr);
        });

        this.onMessage("spectator:set", (client: Client, data: { spectator: boolean }) => {
            if (this.state.status !== "game") return;
            if (!this.activeHandler?.allowsReconnection?.()) return;
            const playerIdStr = this.getPlayerIdStr(client.sessionId);
            if (!playerIdStr) return;
            const player = this.state.players.get(playerIdStr);
            if (!player || player.isEliminated) return;

            if (data.spectator && !player.isSpectator) {
                // Active player → spectator (soft exit from game)
                player.isSpectator = true;
                this.activeHandler.onPlayerDisconnect?.(playerIdStr);
            } else if (!data.spectator && player.isSpectator) {
                // Spectator → active player
                player.isSpectator = false;
                this.activeHandler.onPlayerJoin?.(playerIdStr);
            }
        });

        // ── Vote messages ─────────────────────────────────────────────────────

        this.onMessage("vote:sync", (client: Client) => {
            this.voteManager?.resyncTo((type, data) => client.send(type, data));
        });

        this.onMessage("vote:cast", (client: Client, data: { voteId: string; choice: boolean }) => {
            if (!this.voteManager) return;
            const playerIdStr = this.getPlayerIdStr(client.sessionId);
            if (!playerIdStr) return;
            this.voteManager.cast(playerIdStr, data.choice);
        });

        this.onMessage("vote:initiate", (client: Client, data: { type: "skip_turn" | "mute_player" | "unmute_player"; targetPlayerId: string }) => {
            // skip_turn requires an active game
            if (data.type === "skip_turn" && this.state.status !== "game") return;
            const initiatorIdStr = this.getPlayerIdStr(client.sessionId);
            if (!initiatorIdStr) return;
            const initiator = this.state.players.get(initiatorIdStr);
            if (!initiator || !initiator.isConnected) return;

            const target = this.state.players.get(data.targetPlayerId);
            if (!target || !target.isConnected) return;
            if (data.targetPlayerId === initiatorIdStr) return;

            const eligible = [...this.state.players.entries()]
                .filter(([id, p]) => p.isConnected && id !== data.targetPlayerId)
                .map(([id]) => id);

            const u = target.username;
            // Block duplicate: same type + same target already active or queued
            if (this.voteManager!.hasPending(data.type, data.targetPlayerId)) return;

            if (data.type === "skip_turn") {
                if (!this.activeHandler?.allowsReconnection?.()) return;
                this.voteManager!.start(
                    {
                        type: "skip_turn",
                        question: `Passer le tour de ${u} ?`,
                        yesLabel: "Passer",
                        noLabel: "Garder",
                        targetPlayerId: data.targetPlayerId,
                        targetUsername: u,
                        resultMessage: (r) => r.passed
                            ? `Le tour de ${u} a été passé`
                            : `${u} garde son tour`,
                    },
                    eligible,
                    (result) => {
                        if (result.passed) this.activeHandler?.skipTurn?.(data.targetPlayerId);
                    },
                );
            } else if (data.type === "mute_player") {
                if (target.isMuted) return;
                this.voteManager!.start(
                    {
                        type: "mute_player",
                        question: `Muter ${u} ?`,
                        yesLabel: "Bloquer",
                        noLabel: "Laisser",
                        targetPlayerId: data.targetPlayerId,
                        targetUsername: u,
                        resultMessage: (r) => r.passed
                            ? `${u} ne peut plus parler`
                            : `${u} n'est pas muté`,
                    },
                    eligible,
                    (result) => {
                        if (result.passed) {
                            const p = this.state.players.get(data.targetPlayerId);
                            if (p) p.isMuted = true;
                        }
                    },
                );
            } else {
                // unmute_player
                if (!target.isMuted) return;
                this.voteManager!.start(
                    {
                        type: "unmute_player",
                        question: `Démuté ${u} ?`,
                        yesLabel: "Débloquer",
                        noLabel: "Garder bloqué",
                        targetPlayerId: data.targetPlayerId,
                        targetUsername: u,
                        resultMessage: (r) => r.passed
                            ? `${u} peut de nouveau parler`
                            : `${u} reste muté`,
                    },
                    eligible,
                    (result) => {
                        if (result.passed) {
                            const p = this.state.players.get(data.targetPlayerId);
                            if (p) p.isMuted = false;
                        }
                    },
                );
            }
        });

        // ── Game-specific messages → delegate to active handler ───────────────
        const gameMsgs = [
            "flipCard",
            "tron:input",
            "bomberman:move",
            "bomberman:bomb",
            "motus:guess",
            "motus:typing",
            "motus:requestGuesses",
            "forceEndRound",
        ];
        for (const type of gameMsgs) {
            this.onMessage(type, (client: Client, data: unknown) => {
                if (this.state.status !== "game" || !this.activeHandler) return;
                const playerIdStr = this.getPlayerIdStr(client.sessionId);
                if (!playerIdStr) return;
                if (type === "forceEndRound" && !this.isHost(client.sessionId)) return;
                void this.activeHandler.onMessage(type, playerIdStr, data);
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
            select: { email: true, displayName: true },
        });
        const email      = dbPlayer?.email ?? null;
        const gravatarUrl = email
            ? `https://www.gravatar.com/avatar/${createHash("md5").update(email.trim().toLowerCase()).digest("hex")}?d=retro&s=128`
            : "";
        const displayName = dbPlayer?.displayName ?? payload.username;

        return { ...payload, displayName, gravatarUrl };
    }

    onJoin(client: Client, _options: JoinOptions, auth: AuthPayload) {
        const playerIdStr = String(auth.playerId);
        const existing    = this.state.players.get(playerIdStr);

        const reconnectionAllowed = this.activeHandler?.allowsReconnection?.() ?? false;

        if (existing) {
            // Returning player — update session and connection status
            const oldSession = existing.sessionId;
            if (oldSession) this.sessionToPlayerId.delete(oldSession);

            existing.sessionId   = client.sessionId;
            existing.isConnected = true;
            existing.username    = auth.displayName.trim().slice(0, 32);
            existing.gravatarUrl = auth.gravatarUrl;
            if (this.state.status === "game") existing.isReady = true;

            if (this.state.isStarted
                && reconnectionAllowed
                && !existing.isEliminated
                && !existing.isSpectator
            ) {
                this.activeHandler?.onPlayerJoin?.(playerIdStr);
            }

            // Kick old session if still alive
            const oldClient = this.clients.find(c => c.sessionId === oldSession);
            if (oldClient) {
                oldClient.send("kicked", { reason: "session_replaced" });
                oldClient.leave(4000);
            }

            console.log(`[LobbyRoom ${this.roomId}] ${auth.displayName} rejoined (session updated)`);
        } else {
            // Brand-new player — add to roster
            const isFirst = this.state.players.size === 0;
            const player  = new LobbyPlayer();
            player.id          = playerIdStr;
            player.sessionId   = client.sessionId;
            player.username    = auth.displayName.trim().slice(0, 32);
            player.gravatarUrl = auth.gravatarUrl;
            player.isConnected = true;
            player.isHost      = isFirst;
            player.isReady     = false;
            player.isEliminated = false;
            // Spectator only if game is running
            player.isSpectator  = this.state.isStarted;
            if (isFirst) this.state.hostId = playerIdStr;

            // Notify handler of new participant
            if (this.state.isStarted) {
                player.isReady = true;
            }

            this.state.players.set(playerIdStr, player);
        }

        this.playerIdMap.set(auth.playerId, client.sessionId);
        this.sessionToPlayerId.set(client.sessionId, auth.playerId);
        console.log(`[LobbyRoom ${this.roomId}] ${existing?.username ?? auth.displayName} joined (host: ${existing?.isHost ?? this.state.players.get(playerIdStr)?.isHost}, spectator: ${existing?.isSpectator ?? this.state.players.get(playerIdStr)?.isSpectator})`);
    }

    async onLeave(client: Client, code: CloseCode) {
        const playerId = this.sessionToPlayerId.get(client.sessionId);
        if (!playerId) return;
        const playerIdStr = String(playerId);
        const leaving = this.state.players.get(playerIdStr);
        if (!leaving) return;

        // Clean up session maps
        this.sessionToPlayerId.delete(client.sessionId);
        this.playerIdMap.delete(playerId);
        leaving.isConnected = false;
        leaving.sessionId   = "";

        console.log(`[LobbyRoom ${this.roomId}] ${leaving.username} left (code: ${code})`);

        if (this.state.isStarted && !leaving.isSpectator) {
            if (this.activeHandler?.allowsReconnection?.()) {
                // Game allows reconnection — don't eliminate, let handler manage turn
                this.activeHandler.onPlayerDisconnect?.(playerIdStr);
                // Re-elect host if needed (reconnectable or not, host role must stay active)
                if (leaving.isHost) {
                    leaving.isHost = false;
                    const next = [...this.state.players.entries()]
                        .find(([id, p]) => id !== playerIdStr && p.isConnected);
                    if (next) {
                        next[1].isHost    = true;
                        this.state.hostId = next[0];
                    }
                }
            } else {
                const wasHost = leaving.isHost;
                leaving.isHost       = false;

                // Re-elect host if needed — any connected player qualifies (host role ≠ game participation)
                if (wasHost) {
                    const next = [...this.state.players.entries()]
                        .find(([id, p]) => id !== playerIdStr && p.isConnected);
                    if (next) {
                        next[1].isHost    = true;
                        this.state.hostId = next[0];
                    }
                }

                this.eliminatePlayer(playerIdStr);
            }
        } else if (!this.state.isStarted) {
            // In lobby: remove from roster
            this.removePlayer(playerIdStr, leaving);
        }
        // Spectator disconnect: stays in roster with isConnected=false
    }

    onDispose() {
        this.voteManager?.cancel();
        this.activeHandler?.dispose();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private getPlayerIdStr(sessionId: string): string | undefined {
        const id = this.sessionToPlayerId.get(sessionId);
        return id !== undefined ? String(id) : undefined;
    }

    private isHost(sessionId: string): boolean {
        const playerIdStr = this.getPlayerIdStr(sessionId);
        return !!playerIdStr && playerIdStr === this.state.hostId;
    }

    private removePlayer(playerIdStr: string, leaving: LobbyPlayer) {
        const wasHost = leaving.isHost;   // capture before delete — schema object may be cleared
        this.state.players.delete(playerIdStr);
        if (wasHost && this.state.players.size > 0) {
            const nextEntry = this.state.players.entries().next().value as [string, LobbyPlayer] | undefined;
            if (nextEntry) {
                const [nextId, nextPlayer] = nextEntry;
                nextPlayer.isHost = true;
                this.state.hostId = nextId;
            }
        }
    }


    private eliminatePlayer(playerIdStr: string) {
        const player = this.state.players.get(playerIdStr);
        if (!player) return;

        player.isEliminated = true;

        if (this.state.status === "game" && this.activeHandler) {
            this.activeHandler.onEliminate(playerIdStr);
        }
    }

    private doReturnToLobby() {
        this.activeHandler?.dispose();
        this.activeHandler = null;
        this.prevRound = null;

        // Remove only truly disconnected players
        const toRemove: string[] = [];
        this.state.players.forEach((p, playerIdStr) => {
            if (!p.isConnected) toRemove.push(playerIdStr);
        });
        for (const playerIdStr of toRemove) {
            const numericId = parseInt(playerIdStr, 10);
            const sid = this.playerIdMap.get(numericId);
            if (sid) this.sessionToPlayerId.delete(sid);
            this.playerIdMap.delete(numericId);
            this.state.players.delete(playerIdStr);
        }

        this.state.players.forEach((p) => {
            p.isReady      = false;
            p.isEliminated = false;
            p.isSpectator  = false;
            p.isHost       = false;
            p.isMuted      = false;
        });

        const firstEntry = this.state.players.entries().next().value as [string, LobbyPlayer] | undefined;
        if (firstEntry) {
            firstEntry[1].isHost = true;
            this.state.hostId    = firstEntry[0];
        }

        this.state.isStarted     = false;
        this.state.status        = "lobby";
        this.state.gameStateJson = "{}";
        this.broadcast("lobby:return", { roomId: this.roomId });
        console.log(`[LobbyRoom ${this.roomId}] returned to lobby (removed ${toRemove.length} ghost players)`);
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
        const snapshotPlayerIds = [...this.playerIdSnapshot];
        return {
            clock:      this.clock,
            getPlayers: () => this.state.players,
            getState:   () => this.state.gameStateJson,
            setState:   (v) => { this.state.gameStateJson = v; },

            sendTo: (playerIdStr, type, data) => {
                const sid = this.playerIdMap.get(parseInt(playerIdStr, 10));
                if (!sid) return;
                this.clients.find(c => c.sessionId === sid)?.send(type, data);
            },

            broadcastExcept: (exceptPlayerIdStr, type, data) => {
                const sid = this.playerIdMap.get(parseInt(exceptPlayerIdStr, 10));
                const except = sid ? this.clients.find(c => c.sessionId === sid) : undefined;
                this.broadcast(type, data, except ? { except } : undefined);
            },

            getPlayerDbId: (playerId) => playerId,  // identity — already a playerId

            onGameEnded: (roundPoints, winners) => {
                void recordGameSessions(slug, snapshotPlayerIds, roundPoints, winners);
            },

            startVote: (config, eligiblePlayerIds, onEnd) => {
                this.voteManager!.start(config, eligiblePlayerIds, onEnd);
            },
        };
    }
}
