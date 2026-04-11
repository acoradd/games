import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, MemoryGameState, TronGameState, BombermanGameState, MotusGameState, ChatMsg } from "../models/Lobby";
import { joinLobby } from "../services/lobbyService";
import { getStoredPlayer } from "../services/playerService";
import { getCurrentRoom, setCurrentRoom, clearCurrentRoom } from "../webservices/currentLobbyRoom";
import MemoryGame from "../components/games/MemoryGame";
import TronGame from "../components/games/TronGame";
import BombermanGame from "../components/games/BombermanGame";
import MotusGame from "../components/games/MotusGame";

export default function GamePage() {
    const { slug = "", roomId = "" } = useParams<{ slug: string; roomId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const roomRef = useRef<Room<LobbyState> | null>(null);
    const cancelledRef = useRef(false);
    const returningToLobbyRef = useRef(false);

    const myPlayerId = String(getStoredPlayer()?.player.id ?? "");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [players, setPlayers] = useState<LobbyPlayer[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);

    const [memoryState, setMemoryState] = useState<MemoryGameState | null>(null);
    const [tronState, setTronState] = useState<TronGameState | null>(null);
    const [bombermanState, setBombermanState] = useState<BombermanGameState | null>(null);
    const [motusState, setMotusState] = useState<MotusGameState | null>(null);

    const syncState = useCallback((state: unknown) => {
        if (!state) return;
        const s = state as Record<string, unknown>;

        const list: LobbyPlayer[] = [];
        const playersRaw = s["players"];
        if (playersRaw) {
            if (typeof (playersRaw as Map<string, unknown>).forEach === "function") {
                (playersRaw as Map<string, LobbyPlayer>).forEach((p) =>
                    list.push({ id: p.id, sessionId: p.sessionId ?? "", username: p.username, isHost: p.isHost, isReady: p.isReady,
                                isConnected: p.isConnected ?? true, isEliminated: p.isEliminated ?? false,
                                isSpectator: p.isSpectator ?? false, gravatarUrl: p.gravatarUrl ?? "" })
                );
            } else {
                Object.values(playersRaw as Record<string, LobbyPlayer>).forEach((p) =>
                    list.push({ id: p.id, sessionId: p.sessionId ?? "", username: p.username, isHost: p.isHost, isReady: p.isReady,
                                isConnected: p.isConnected ?? true, isEliminated: p.isEliminated ?? false,
                                isSpectator: p.isSpectator ?? false, gravatarUrl: p.gravatarUrl ?? "" })
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
            } else if (gs["wordLength"] !== undefined && gs["playerOrder"]) {
                setMotusState(gs as unknown as MotusGameState);
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

    const bindRoomHandlers = useCallback((room: Room<LobbyState>, fromCurrentRoom = false) => {
        function redirectToLobby() {
            returningToLobbyRef.current = true;
            navigate(`/lobby/${roomId}`, { state: { fromReturnToLobby: true } });
        }

        if (room.state) {
            const s = room.state as unknown as Record<string, unknown>;
            if ((s["status"] as string) === "lobby" && !fromCurrentRoom && !cancelledRef.current) {
                returningToLobbyRef.current = true;
                clearCurrentRoom();
                room.leave();
                navigate(`/lobby/${roomId}`, { state: { fromReturnToLobby: true } });
                return;
            }
            syncState(room.state as unknown as LobbyState);
        }

        room.onStateChange((state) => {
            const s = state as unknown as Record<string, unknown>;
            if ((s["status"] as string) === "lobby" && !cancelledRef.current) {
                redirectToLobby();
                return;
            }
            syncState(state as unknown as LobbyState);
        });

        room.onLeave(() => {
            if (cancelledRef.current || returningToLobbyRef.current) return;
            navigate("/");
        });

        room.onMessage("lobby:return", () => {
            if (cancelledRef.current) return;
            redirectToLobby();
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncState]);

    useEffect(() => {
        if (!roomId) return;
        cancelledRef.current = false;
        returningToLobbyRef.current = false;

        if (!getStoredPlayer()) {
            navigate("/auth", { state: { returnTo: location.pathname } });
            return;
        }

        async function connect() {
            try {
                let room = getCurrentRoom(roomId);
                const fromCurrentRoom = !!room;

                if (!room) {
                    room = await joinLobby(roomId);
                }

                if (cancelledRef.current) { room.leave(); return; }

                roomRef.current = room;
                setCurrentRoom(room);
                bindRoomHandlers(room, fromCurrentRoom);
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
            if (roomRef.current) {
                if (!returningToLobbyRef.current) {
                    roomRef.current.leave();
                    clearCurrentRoom();
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

    const isSpectator = players.find((p) => p.id === myPlayerId)?.isSpectator ?? false;

    return (
        <>
            {isSpectator && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 bg-gray-800/90 border border-gray-600 text-gray-300 text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
                    Spectateur
                </div>
            )}

            {slug === "memory" && memoryState ? (
                <MemoryGame
                    room={roomRef.current!}
                    sessionId={myPlayerId}
                    gameState={memoryState}
                    players={players}
                    chatMessages={chatMessages}
                />
            ) : slug === "tron" && tronState ? (
                <TronGame
                    room={roomRef.current!}
                    sessionId={myPlayerId}
                    gameState={tronState}
                    players={players}
                    chatMessages={chatMessages}
                />
            ) : slug === "bomberman" && bombermanState ? (
                <BombermanGame
                    room={roomRef.current!}
                    sessionId={myPlayerId}
                    gameState={bombermanState}
                    players={players}
                    chatMessages={chatMessages}
                />
            ) : slug === "motus" && motusState ? (
                <MotusGame
                    room={roomRef.current!}
                    sessionId={myPlayerId}
                    gameState={motusState}
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
