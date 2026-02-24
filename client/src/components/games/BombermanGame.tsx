import { useEffect, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, BombermanGameState, ChatMsg } from "../../models/Lobby";

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: BombermanGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

export default function BombermanGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const { phase, cols, rows, grid, players: gsPlayers, playerOrder, bombs, explosions, bonuses, playerNames } = gameState;

    const isHost = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const playerById = new Map(players.map((p) => [p.id, p]));
    const myPlayer = gsPlayers[sessionId];

    const ranked = [...playerOrder].sort(
        (a, b) => (gsPlayers[b]?.score ?? 0) - (gsPlayers[a]?.score ?? 0)
    );

    // ── Canvas rendering ──────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const cs = Math.min(container.clientWidth / cols, container.clientHeight / rows);
        canvas.width = Math.floor(cs * cols);
        canvas.height = Math.floor(cs * rows);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Grid cells
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const ch = grid[y * cols + x];
                if (ch === "1") {
                    ctx.fillStyle = "#374151";
                } else if (ch === "2") {
                    ctx.fillStyle = "#92400e";
                } else {
                    ctx.fillStyle = "#111827";
                }
                ctx.fillRect(x * cs, y * cs, cs, cs);
                // Cell border
                ctx.strokeStyle = "#1f2937";
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cs, y * cs, cs, cs);
            }
        }

        // Explosions
        ctx.fillStyle = "rgba(249,115,22,0.75)";
        explosions.forEach((exp) => {
            exp.cells.forEach(({ x, y }) => {
                ctx.fillRect(x * cs, y * cs, cs, cs);
            });
        });

        // Bonuses
        bonuses.forEach((b) => {
            const emoji = b.type === "bomb" ? "💣" : b.type === "range" ? "🎯" : "🛡️";
            ctx.font = `${cs * 0.65}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(emoji, (b.x + 0.5) * cs, (b.y + 0.5) * cs);
        });

        // Bombs
        bombs.forEach((b) => {
            ctx.fillStyle = "#111827";
            ctx.beginPath();
            ctx.arc((b.x + 0.5) * cs, (b.y + 0.5) * cs, cs * 0.38, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#4b5563";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Countdown
            const secondsLeft = Math.max(1, Math.ceil(b.fuseLeft / 6.67));
            ctx.fillStyle = secondsLeft <= 1 ? "#ef4444" : "#f9fafb";
            ctx.font = `bold ${cs * 0.38}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(secondsLeft), (b.x + 0.5) * cs, (b.y + 0.5) * cs);
        });

        // Players
        Object.entries(gsPlayers).forEach(([sid, p]) => {
            if (!p.alive) return;

            // Invincibility blink
            const blink = p.invincibleTicks > 0 && Math.floor(Date.now() / 150) % 2 === 0;
            ctx.globalAlpha = blink ? 0.35 : 1.0;

            // Player circle
            ctx.fillStyle = p.color ?? "#888";
            ctx.beginPath();
            ctx.arc((p.x + 0.5) * cs, (p.y + 0.5) * cs, cs * 0.38, 0, Math.PI * 2);
            ctx.fill();

            // Shield ring
            if (p.shield) {
                ctx.strokeStyle = "#a78bfa";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc((p.x + 0.5) * cs, (p.y + 0.5) * cs, cs * 0.45, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Initial letter
            ctx.fillStyle = "#000";
            ctx.font = `bold ${cs * 0.4}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                (playerNames[sid] ?? "?")[0]!.toUpperCase(),
                (p.x + 0.5) * cs,
                (p.y + 0.5) * cs
            );

            ctx.globalAlpha = 1.0;
        });
    }, [gameState]);

    // ── Keyboard input ────────────────────────────────────────────────────
    useEffect(() => {
        const dirMap: Record<string, string> = {
            ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
            w: "up", s: "down", a: "left", d: "right",
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === " ") {
                e.preventDefault();
                room.send("bomberman:bomb");
                return;
            }
            const dir = dirMap[e.key];
            if (dir) {
                e.preventDefault();
                room.send("bomberman:move", { dir });
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            const dir = dirMap[e.key];
            if (dir) {
                room.send("bomberman:move", { dir: null });
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
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

    return (
        <div className="h-dvh bg-gray-950 text-white flex flex-col">

            {/* Header */}
            <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
                <span className="text-xl">💣</span>
                <span className="font-bold text-white">Bomberman</span>
                {myPlayer && (
                    <>
                        <span className="text-gray-600 text-sm">|</span>
                        <span className="flex items-center gap-1 text-sm">
                            <span style={{ color: myPlayer.color }}>●</span>
                            {Array.from({ length: myPlayer.lives }).map((_, i) => (
                                <span key={i} className="text-red-500 text-xs">♥</span>
                            ))}
                            {!myPlayer.alive && (
                                <span className="text-gray-500 ml-1">— éliminé</span>
                            )}
                        </span>
                    </>
                )}
            </header>

            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Canvas area */}
                <main className="flex-1 flex items-center justify-center p-4 min-w-0" ref={containerRef}>
                    <canvas ref={canvasRef} className="block" />
                </main>

                {/* Right panel */}
                <aside className="w-56 shrink-0 border-l border-gray-800 flex flex-col">

                    {/* HUD */}
                    <div className="p-4 border-b border-gray-800 shrink-0">
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Joueurs</p>
                        <ul className="flex flex-col gap-3">
                            {ranked.map((id) => {
                                const name = playerNames[id] ?? id;
                                const gp = gsPlayers[id];
                                const lp = playerById.get(id);
                                const isEliminated = gp?.eliminated ?? lp?.isEliminated ?? false;
                                const isMe = id === sessionId;

                                return (
                                    <li key={id} className={`text-sm ${isEliminated ? "text-gray-600" : "text-gray-200"}`}>
                                        <div className={`flex items-center justify-between gap-1 ${isEliminated ? "line-through" : ""}`}>
                                            <span className="flex items-center gap-1.5 truncate">
                                                {gp && (
                                                    <span
                                                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: gp.color }}
                                                    />
                                                )}
                                                {name}
                                                {isMe && <span className="text-gray-600 text-xs">(vous)</span>}
                                            </span>
                                            <span className="font-bold shrink-0">{gp?.score ?? 0}</span>
                                        </div>
                                        {gp && !isEliminated && (
                                            <div className="flex items-center gap-2 mt-1 ml-4 text-xs text-gray-500">
                                                <span>
                                                    {Array.from({ length: gp.lives }).map((_, i) => (
                                                        <span key={i} className="text-red-500">♥</span>
                                                    ))}
                                                    {Array.from({ length: Math.max(0, 5 - gp.lives) }).map((_, i) => (
                                                        <span key={i} className="text-gray-700">♥</span>
                                                    ))}
                                                </span>
                                                <span title="Bombes">💣 {gp.bombsMax - gp.bombsPlaced}/{gp.bombsMax}</span>
                                                <span title="Portée">🎯 {gp.range}</span>
                                                {gp.shield && <span title="Bouclier">🛡️</span>}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Controls hint */}
                    <div className="px-4 py-2 border-b border-gray-800 shrink-0">
                        <p className="text-xs text-gray-600">↑↓←→ déplacer · Espace bombe</p>
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
                        <p className="text-3xl mb-2">💥</p>
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
