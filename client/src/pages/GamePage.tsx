import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, MemoryGameState, TronGameState, BombermanGameState, ChatMsg } from "../models/Lobby";
import { joinLobby } from "../services/lobbyService";
import { getStoredPlayer } from "../services/playerService";
import { getCurrentRoom, setCurrentRoom, clearCurrentRoom } from "../webservices/currentLobbyRoom";
import { colyseusClient } from "../webservices/colyseus";
import MemoryGame from "../components/games/MemoryGame";
import TronGame from "../components/games/TronGame";
import BombermanGame from "../components/games/BombermanGame";

// ── Reconnection token persistence ─────────────────────────────────────────
function tokenKey(roomId: string) { return `reconnect_${roomId}`; }
function loadToken(roomId: string) { return localStorage.getItem(tokenKey(roomId)) ?? ""; }
function saveToken(roomId: string, token: string) { localStorage.setItem(tokenKey(roomId), token); }
function clearToken(roomId: string) { localStorage.removeItem(tokenKey(roomId)); }

// ── Cross-tab detection via BroadcastChannel ────────────────────────────────
function checkOtherTabActive(roomId: string): Promise<boolean> {
    return new Promise((resolve) => {
        const channel = new BroadcastChannel(`room_${roomId}`);
        let resolved = false;

        channel.onmessage = (e) => {
            if (e.data === "active" && !resolved) {
                resolved = true;
                channel.close();
                resolve(true);
            }
        };

        channel.postMessage("check");

        setTimeout(() => {
            if (!resolved) {
                channel.close();
                resolve(false);
            }
        }, 200);
    });
}

export default function GamePage() {
    const { slug = "", roomId = "" } = useParams<{ slug: string; roomId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const roomRef = useRef<Room<LobbyState> | null>(null);
    const reconnectionTokenRef = useRef<string>("");
    const cancelledRef = useRef(false);
    const returningToLobbyRef = useRef(false);
    const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reconnecting, setReconnecting] = useState(false);

    const [sessionId, setSessionId] = useState("");
    const [players, setPlayers] = useState<LobbyPlayer[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);

    const [memoryState, setMemoryState] = useState<MemoryGameState | null>(null);
    const [tronState, setTronState] = useState<TronGameState | null>(null);
    const [bombermanState, setBombermanState] = useState<BombermanGameState | null>(null);

    function openBroadcastChannel(id: string) {
        broadcastChannelRef.current?.close();
        const channel = new BroadcastChannel(`room_${id}`);
        channel.onmessage = (e) => {
            if (e.data === "check") channel.postMessage("active");
        };
        broadcastChannelRef.current = channel;
    }

    const syncState = useCallback((state: unknown) => {
        if (!state) return;
        const s = state as Record<string, unknown>;

        const list: LobbyPlayer[] = [];
        const playersRaw = s["players"];
        if (playersRaw) {
            if (typeof (playersRaw as Map<string, unknown>).forEach === "function") {
                (playersRaw as Map<string, LobbyPlayer>).forEach((p) =>
                    list.push({ id: p.id, username: p.username, isHost: p.isHost, isReady: p.isReady,
                                isConnected: p.isConnected ?? true, isEliminated: p.isEliminated ?? false })
                );
            } else {
                Object.values(playersRaw as Record<string, LobbyPlayer>).forEach((p) =>
                    list.push({ id: p.id, username: p.username, isHost: p.isHost, isReady: p.isReady,
                                isConnected: p.isConnected ?? true, isEliminated: p.isEliminated ?? false })
                );
            }
        }
        setPlayers(list);

        try {
            const gs = JSON.parse((s["gameStateJson"] as string) ?? "{}") as Record<string, unknown>;
            if (gs["cards"]) {
                setMemoryState(gs as unknown as MemoryGameState);
            } else if (gs["gridSize"] !== undefined && gs["playerOrder"]) {
                setTronState(gs as unknown as TronGameState);
            } else if (gs["cols"] !== undefined && gs["bombs"]) {
                setBombermanState(gs as unknown as BombermanGameState);
            }
        } catch {
            // ignore parse errors
        }

        const chat: ChatMsg[] = [];
        const historyRaw = s["chatHistory"];
        if (historyRaw) {
            const iter = typeof (historyRaw as { forEach?: unknown }).forEach === "function"
                ? historyRaw as Iterable<{ username: string; text: string; timestamp: number }>
                : Object.values(historyRaw as object) as { username: string; text: string; timestamp: number }[];
            for (const m of iter as { username: string; text: string; timestamp: number }[]) {
                chat.push({ username: m.username, text: m.text, ts: m.timestamp });
            }
        }
        setChatMessages(chat);
    }, []);

    const bindRoomHandlers = useCallback((room: Room<LobbyState>) => {
        if (room.state) {
            syncState(room.state as unknown as LobbyState);
        }

        room.onStateChange((state) => {
            syncState(state as unknown as LobbyState);
        });

        room.onLeave((code) => {
            if (code === 4000 || code === 1000) return;
            if (cancelledRef.current) return;
            setReconnecting(true);
            attemptReconnect(reconnectionTokenRef.current);
        });

        room.onMessage("lobby:return", () => {
            if (cancelledRef.current) return;
            clearToken(roomId);
            returningToLobbyRef.current = true;
            navigate(`/lobby/${roomId}`);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncState]);

    async function attemptReconnect(token: string) {
        const MAX_ATTEMPTS = 3;
        const DELAY_MS = 3000;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            if (cancelledRef.current) return;
            if (attempt > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
            }
            try {
                const newRoom = await colyseusClient.reconnect<LobbyState>(token);
                if (cancelledRef.current) { newRoom.leave(); return; }

                reconnectionTokenRef.current = newRoom.reconnectionToken;
                saveToken(roomId, newRoom.reconnectionToken);
                roomRef.current = newRoom;
                setCurrentRoom(newRoom);
                setSessionId(newRoom.sessionId);
                bindRoomHandlers(newRoom);
                openBroadcastChannel(roomId);
                setReconnecting(false);
                return;
            } catch (err) {
                console.warn(`[GamePage] reconnect attempt ${attempt + 1} failed:`, err);
            }
        }

        clearToken(roomId);
        if (!cancelledRef.current) {
            navigate("/");
        }
    }

    useEffect(() => {
        if (!roomId) return;
        cancelledRef.current = false;
        returningToLobbyRef.current = false;

        if (!getStoredPlayer()) {
            navigate("/", { state: { returnTo: location.pathname } });
            return;
        }

        async function connect() {
            try {
                let room = getCurrentRoom(roomId);

                if (!room) {
                    const storedToken = loadToken(roomId);
                    if (storedToken) {
                        const anotherTabActive = await checkOtherTabActive(roomId);
                        if (!anotherTabActive) {
                            try {
                                room = await colyseusClient.reconnect<LobbyState>(storedToken);
                            } catch {
                                clearToken(roomId);
                                room = await joinLobby(roomId);
                            }
                        } else {
                            room = await joinLobby(roomId);
                        }
                    } else {
                        room = await joinLobby(roomId);
                    }
                }

                if (cancelledRef.current) { room.leave(); return; }

                reconnectionTokenRef.current = room.reconnectionToken;
                saveToken(roomId, room.reconnectionToken);
                roomRef.current = room;
                setCurrentRoom(room);
                setSessionId(room.sessionId);
                bindRoomHandlers(room);
                openBroadcastChannel(roomId);
                setLoading(false);
            } catch (err: unknown) {
                console.error("[GamePage] connect error:", err);
                if (!cancelledRef.current) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setError(`Erreur de connexion — ${msg}`);
                    setLoading(false);
                }
            }
        }

        connect();

        return () => {
            cancelledRef.current = true;
            broadcastChannelRef.current?.close();
            broadcastChannelRef.current = null;
            if (roomRef.current) {
                if (!returningToLobbyRef.current) {
                    roomRef.current.leave();
                    clearCurrentRoom();
                    clearToken(roomId);
                }
                roomRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId]);

    if (loading) {
        return (
            <div className="h-dvh bg-gray-950 text-white flex items-center justify-center">
                <p className="text-gray-400">Chargement du jeu…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-dvh bg-gray-950 text-white flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white underline text-sm">
                        Retour à l'accueil
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            {reconnecting && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl px-8 py-6 text-center">
                        <p className="text-white font-semibold mb-1">Reconnexion…</p>
                        <p className="text-gray-400 text-sm">Tentative de reconnexion au serveur</p>
                    </div>
                </div>
            )}

            {slug === "memory" && memoryState ? (
                <MemoryGame
                    room={roomRef.current!}
                    sessionId={sessionId}
                    gameState={memoryState}
                    players={players}
                    chatMessages={chatMessages}
                />
            ) : slug === "tron" && tronState ? (
                <TronGame
                    room={roomRef.current!}
                    sessionId={sessionId}
                    gameState={tronState}
                    players={players}
                    chatMessages={chatMessages}
                />
            ) : slug === "bomberman" && bombermanState ? (
                <BombermanGame
                    room={roomRef.current!}
                    sessionId={sessionId}
                    gameState={bombermanState}
                    players={players}
                    chatMessages={chatMessages}
                />
            ) : (
                <div className="h-dvh bg-gray-950 text-white flex items-center justify-center">
                    <p className="text-gray-400">Chargement…</p>
                </div>
            )}
        </>
    );
}
