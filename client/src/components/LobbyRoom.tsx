import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState } from "../models/Lobby";

interface LobbyRoomProps {
    room: Room<LobbyState>;
    gameSlug: string;
}

export default function LobbyRoom({ room, gameSlug }: LobbyRoomProps) {
    const navigate = useNavigate();
    const [players, setPlayers] = useState<LobbyPlayer[]>([]);
    const [hostId, setHostId] = useState<string>("");
    const [copied, setCopied] = useState(false);

    const mySessionId = room.sessionId;

    const syncState = useCallback(() => {
        const state = room.state;
        setHostId(state.hostId);
        const list: LobbyPlayer[] = [];
        state.players.forEach((p: LobbyPlayer) => list.push({ ...p }));
        setPlayers(list);
    }, [room]);

    useEffect(() => {
        syncState();

        room.onStateChange(() => syncState());

        room.onMessage("game:start", ({ roomId }: { roomId: string }) => {
            navigate(`/game/${gameSlug}/play/${roomId}`);
        });

        return () => {
            room.removeAllListeners();
        };
    }, [room, gameSlug, navigate, syncState]);

    function handleReady() {
        room.send("ready");
    }

    function handleStart() {
        room.send("start");
    }

    async function handleCopy() {
        await navigator.clipboard.writeText(room.roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const isHost = mySessionId === hostId;
    const me = players.find((p) => p.id === mySessionId);

    return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 flex flex-col gap-6">

                {/* Header */}
                <div>
                    <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Lobby</p>
                    <h1 className="text-2xl font-bold capitalize">{gameSlug}</h1>
                </div>

                {/* Room code */}
                <div className="bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-gray-500 text-xs mb-0.5">Code de la room</p>
                        <p className="font-mono text-lg font-bold tracking-widest text-white">
                            {room.roomId}
                        </p>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                        {copied ? "Copié ✓" : "Copier"}
                    </button>
                </div>

                {/* Players list */}
                <div>
                    <p className="text-gray-400 text-sm mb-3">
                        Joueurs ({players.length})
                    </p>
                    <ul className="flex flex-col gap-2">
                        {players.map((p) => (
                            <li
                                key={p.id}
                                className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2.5"
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-2 h-2 rounded-full ${p.isReady ? "bg-emerald-400" : "bg-gray-500"}`}
                                    />
                                    <span className="font-medium">
                                        {p.username}
                                        {p.id === mySessionId && (
                                            <span className="text-gray-500 text-xs ml-1">(vous)</span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    {p.isHost && (
                                        <span className="bg-indigo-700 text-indigo-200 px-2 py-0.5 rounded-full">
                                            host
                                        </span>
                                    )}
                                    <span className={p.isReady ? "text-emerald-400" : "text-gray-500"}>
                                        {p.isReady ? "prêt" : "en attente"}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleReady}
                        className={`flex-1 py-2.5 rounded-lg font-semibold transition-colors ${
                            me?.isReady
                                ? "bg-emerald-700 hover:bg-emerald-600 text-white"
                                : "bg-gray-700 hover:bg-gray-600 text-white"
                        }`}
                    >
                        {me?.isReady ? "Pas prêt" : "Prêt"}
                    </button>

                    {isHost && (
                        <button
                            onClick={handleStart}
                            className="flex-1 py-2.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                        >
                            Lancer
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
