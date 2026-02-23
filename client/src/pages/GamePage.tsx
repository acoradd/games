import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, MemoryGameState } from "../models/Lobby";
import { joinLobby } from "../services/lobbyService";
import { getStoredPlayer } from "../services/playerService";
import { getCurrentRoom, clearCurrentRoom } from "../webservices/currentLobbyRoom";
import MemoryGame from "../components/games/MemoryGame";

export default function GamePage() {
    const { slug = "", roomId = "" } = useParams<{ slug: string; roomId: string }>();
    const navigate = useNavigate();

    const roomRef = useRef<Room<LobbyState> | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [sessionId, setSessionId] = useState("");
    const [players, setPlayers] = useState<LobbyPlayer[]>([]);
    const [gameState, setGameState] = useState<MemoryGameState | null>(null);

    const syncState = useCallback((state: unknown) => {
        if (!state) return;
        const s = state as Record<string, unknown>;

        const list: LobbyPlayer[] = [];
        const playersRaw = s["players"];
        if (playersRaw) {
            if (typeof (playersRaw as Map<string, unknown>).forEach === "function") {
                (playersRaw as Map<string, LobbyPlayer>).forEach((p) =>
                    list.push({ id: p.id, username: p.username, isHost: p.isHost, isReady: p.isReady })
                );
            } else {
                Object.values(playersRaw as Record<string, LobbyPlayer>).forEach((p) =>
                    list.push({ id: p.id, username: p.username, isHost: p.isHost, isReady: p.isReady })
                );
            }
        }
        setPlayers(list);

        try {
            const gs = JSON.parse((s["gameStateJson"] as string) ?? "{}") as MemoryGameState;
            if (gs.cards) setGameState(gs);
        } catch {
            // ignore parse errors
        }
    }, []);

    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;

        if (!getStoredPlayer()) {
            navigate("/");
            return;
        }

        async function connect() {
            try {
                let room = getCurrentRoom(roomId);
                if (!room) {
                    room = await joinLobby(roomId);
                }
                if (cancelled) { room.leave(); return; }

                roomRef.current = room;
                setSessionId(room.sessionId);

                if (room.state) {
                    syncState(room.state as unknown as LobbyState);
                }

                room.onStateChange((state) => {
                    syncState(state as unknown as LobbyState);
                });

                setLoading(false);
            } catch (err: unknown) {
                console.error("[GamePage] connect error:", err);
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setError(`Erreur de connexion — ${msg}`);
                    setLoading(false);
                }
            }
        }

        connect();

        return () => {
            cancelled = true;
            if (roomRef.current) {
                roomRef.current.leave();
                clearCurrentRoom();
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

    if (slug === "memory" && gameState) {
        return (
            <MemoryGame
                room={roomRef.current!}
                sessionId={sessionId}
                gameState={gameState}
                players={players}
                roomId={roomId}
            />
        );
    }

    return (
        <div className="h-dvh bg-gray-950 text-white flex items-center justify-center">
            <p className="text-gray-400">Jeu "{slug}" — en cours de développement.</p>
        </div>
    );
}
