import { useEffect, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, TronGameState, ChatMsg } from "../../models/Lobby";

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: TronGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

export default function TronGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const { phase, gridSize, grid, players: gsPlayers, playerOrder, apples, playerNames } = gameState;

    const isHost = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const playerById = new Map(players.map((p) => [p.id, p]));

    // Ranked by score
    const ranked = [...playerOrder].sort(
        (a, b) => (gsPlayers[b]?.score ?? 0) - (gsPlayers[a]?.score ?? 0)
    );

    // ── Canvas rendering ──────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const size = Math.min(container.clientWidth, container.clientHeight);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const cs = size / gridSize;

        // Background
        ctx.fillStyle = "#0d1117";
        ctx.fillRect(0, 0, size, size);

        // Subtle grid lines
        ctx.strokeStyle = "#1a2030";
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= gridSize; x++) {
            ctx.beginPath(); ctx.moveTo(x * cs, 0); ctx.lineTo(x * cs, size); ctx.stroke();
        }
        for (let y = 0; y <= gridSize; y++) {
            ctx.beginPath(); ctx.moveTo(0, y * cs); ctx.lineTo(size, y * cs); ctx.stroke();
        }

        // Trail cells
        for (let i = 0; i < grid.length; i++) {
            const ch = grid[i];
            if (!ch || ch === ".") continue;
            const pIdx = parseInt(ch);
            const sid = playerOrder[pIdx];
            if (!sid) continue;
            const p = gsPlayers[sid];
            const cx = i % gridSize;
            const cy = Math.floor(i / gridSize);
            const isHead = p && p.x === cx && p.y === cy;
            ctx.fillStyle = p?.alive ? (p.color ?? "#888") : "#333";
            ctx.globalAlpha = isHead ? 1.0 : 0.45;
            ctx.fillRect(cx * cs + 1, cy * cs + 1, cs - 2, cs - 2);
        }
        ctx.globalAlpha = 1.0;

        // Apples (Snake mode)
        apples.forEach((a) => {
            ctx.fillStyle = "#ff1744";
            ctx.beginPath();
            ctx.arc((a.x + 0.5) * cs, (a.y + 0.5) * cs, cs * 0.35, 0, Math.PI * 2);
            ctx.fill();
        });

        // Player heads — draw a bright border
        for (const [, p] of Object.entries(gsPlayers)) {
            if (!p.alive) continue;
            ctx.strokeStyle = p.color ?? "#fff";
            ctx.lineWidth = 2;
            ctx.globalAlpha = 1.0;
            ctx.strokeRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2);
        }
        ctx.globalAlpha = 1.0;
    }, [gameState]);

    // ── Keyboard input ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const map: Record<string, string> = {
                ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
                w: "up", s: "down", a: "left", d: "right",
            };
            const dir = map[e.key];
            if (dir) {
                e.preventDefault();
                room.send("tron:input", { dir });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [room]);

    // ── Chat ──────────────────────────────────────────────────────────────
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);
    const myUsername = playerNames[sessionId] ?? "";

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    function handleChat(e: React.FormEvent) {
        e.preventDefault();
        if (!chatInput.trim()) return;
        room.send("chat", { text: chatInput.trim() });
        setChatInput("");
    }

    const myPlayer = gsPlayers[sessionId];
    const modeLabel = gameState.mode === "Snake" ? "Snake" : "Tron";

    return (
        <div className="h-dvh bg-gray-950 text-white flex flex-col">

            {/* Header */}
            <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
                <span className="text-xl">🏍️</span>
                <span className="font-bold text-white">{modeLabel}</span>
                {myPlayer && (
                    <>
                        <span className="text-gray-600 text-sm">|</span>
                        <span className="text-sm" style={{ color: myPlayer.color }}>
                            ● Vous
                        </span>
                        {!myPlayer.alive && (
                            <span className="text-sm text-gray-500">— éliminé</span>
                        )}
                    </>
                )}
            </header>

            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Canvas area */}
                <main className="flex-1 flex items-center justify-center p-4 min-w-0" ref={containerRef}>
                    <canvas
                        ref={canvasRef}
                        className="block"
                        style={{ imageRendering: "pixelated" }}
                    />
                </main>

                {/* Right panel */}
                <aside className="w-56 shrink-0 border-l border-gray-800 flex flex-col">

                    {/* Scoreboard */}
                    <div className="p-4 border-b border-gray-800 shrink-0">
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Joueurs</p>
                        <ul className="flex flex-col gap-2">
                            {ranked.map((id) => {
                                const name = playerNames[id] ?? id;
                                const gp = gsPlayers[id];
                                const lp = playerById.get(id);
                                const isEliminated = gp?.eliminated ?? lp?.isEliminated ?? false;
                                const isAlive = gp?.alive ?? false;
                                const isMe = id === sessionId;

                                return (
                                    <li
                                        key={id}
                                        className={`flex items-center justify-between gap-2 text-sm ${
                                            isEliminated ? "text-gray-600" : isAlive ? "text-gray-200" : "text-gray-500"
                                        }`}
                                    >
                                        <span className={`truncate flex items-center gap-1.5 ${isEliminated ? "line-through" : ""}`}>
                                            {gp && (
                                                <span
                                                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: gp.color }}
                                                />
                                            )}
                                            {name}
                                            {isMe && <span className="text-gray-600 text-xs">(vous)</span>}
                                            {isEliminated && <span className="text-gray-600 text-xs ml-1">✕</span>}
                                            {!isAlive && !isEliminated && <span className="text-gray-600 text-xs ml-1">mort</span>}
                                        </span>
                                        <span className="font-bold shrink-0">{gp?.score ?? 0}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Controls hint */}
                    <div className="px-4 py-2 border-b border-gray-800 shrink-0">
                        <p className="text-xs text-gray-600">↑↓←→ ou WASD</p>
                    </div>

                    {/* Chat */}
                    <div className="flex flex-col flex-1 min-h-0">
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold px-4 pt-3 pb-2 shrink-0">Chat</p>
                        <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-2 min-h-0">
                            {chatMessages.length === 0 && (
                                <p className="text-gray-700 text-xs text-center mt-4">Aucun message.</p>
                            )}
                            {chatMessages.map((msg, i) => {
                                const isMine = msg.username === myUsername;
                                return (
                                    <div key={i} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                                        {!isMine && (
                                            <span className="text-xs text-gray-500 px-1">{msg.username}</span>
                                        )}
                                        <div className={`max-w-[90%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                                            isMine
                                                ? "bg-indigo-600 text-white rounded-tr-sm"
                                                : "bg-gray-700 text-gray-100 rounded-tl-sm"
                                        }`}>
                                            {msg.text}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={handleChat} className="flex gap-2 p-3 border-t border-gray-800 shrink-0">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Message…"
                                maxLength={200}
                                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim()}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors text-sm"
                            >
                                ↑
                            </button>
                        </form>
                    </div>
                </aside>
            </div>

            {/* End overlay */}
            {phase === "ended" && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
                        <p className="text-3xl mb-2">🏆</p>
                        <h2 className="text-xl font-bold text-white mb-1">Partie terminée !</h2>
                        <p className="text-gray-400 text-sm mb-6">Classement final</p>
                        <ul className="flex flex-col gap-2 mb-6">
                            {ranked.map((id, i) => {
                                const name = playerNames[id] ?? id;
                                const gp = gsPlayers[id];
                                const lp = playerById.get(id);
                                const isEliminated = gp?.eliminated ?? lp?.isEliminated ?? false;
                                const isMe = id === sessionId;
                                return (
                                    <li key={id} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2">
                                            <span className="text-gray-500 w-4">{i + 1}.</span>
                                            {gp && (
                                                <span
                                                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: gp.color }}
                                                />
                                            )}
                                            <span className={`${isEliminated ? "line-through text-gray-500" : i === 0 ? "text-yellow-400 font-bold" : "text-gray-300"}`}>
                                                {name}
                                                {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                                            </span>
                                        </span>
                                        <span className="font-bold text-white">{gp?.score ?? 0} pts</span>
                                    </li>
                                );
                            })}
                        </ul>
                        {isHost ? (
                            <button
                                onClick={() => room.send("returnToLobby")}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
                            >
                                Retour au lobby →
                            </button>
                        ) : (
                            <p className="text-gray-500 text-sm">En attente du retour au lobby…</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
