import { useEffect, useRef, useCallback } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, BombermanGameState, ChatMsg } from "../../models/Lobby";
import GameShell from "./GameShell";

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: BombermanGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

export default function BombermanGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const { phase, players: gsPlayers, playerOrder, playerNames } = gameState;

    const isHost = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const playerById = new Map(players.map((p) => [p.id, p]));
    const myPlayer = gsPlayers[sessionId];

    const ranked = [...playerOrder].sort(
        (a, b) => (gsPlayers[b]?.score ?? 0) - (gsPlayers[a]?.score ?? 0)
    );
    const rankedByPoints = [...playerOrder].sort(
        (a, b) => (gameState.roundPoints[b] ?? 0) - (gameState.roundPoints[a] ?? 0)
    );

    const roundWinnerIds = gameState.roundWinnerIds ?? [];
    const roundWinnerName = roundWinnerIds.length === 1
        ? (playerNames[roundWinnerIds[0]!] ?? roundWinnerIds[0])
        : null;

    // ── Canvas ────────────────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameStateRef = useRef(gameState);
    gameStateRef.current = gameState;

    const drawCanvas = useCallback(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const gs = gameStateRef.current;
        const { cols, rows, grid, explosions, bonuses, bombs, players: gsP } = gs;
        const cs = Math.min(container.clientWidth / cols, container.clientHeight / rows);
        if (cs <= 0) return;

        canvas.width = Math.floor(cs * cols);
        canvas.height = Math.floor(cs * rows);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const ch = grid[y * cols + x];
                ctx.fillStyle = ch === "1" ? "#374151" : ch === "2" ? "#92400e" : "#111827";
                ctx.fillRect(x * cs, y * cs, cs, cs);
                ctx.strokeStyle = "#1f2937";
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cs, y * cs, cs, cs);
            }
        }

        ctx.fillStyle = "rgba(249,115,22,0.75)";
        explosions.forEach((exp) => {
            exp.cells.forEach(({ x, y }) => ctx.fillRect(x * cs, y * cs, cs, cs));
        });

        bonuses.forEach((b) => {
            const emoji = b.type === "bomb" ? "💣" : b.type === "range" ? "🎯" : "🛡️";
            ctx.font = `${cs * 0.65}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(emoji, (b.x + 0.5) * cs, (b.y + 0.5) * cs);
        });

        bombs.forEach((b) => {
            ctx.fillStyle = "#111827";
            ctx.beginPath();
            ctx.arc((b.x + 0.5) * cs, (b.y + 0.5) * cs, cs * 0.38, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#4b5563";
            ctx.lineWidth = 1;
            ctx.stroke();
            const secondsLeft = Math.max(1, Math.ceil(b.fuseLeft * gs.bombTickMs / 1000));
            ctx.fillStyle = secondsLeft <= 1 ? "#ef4444" : "#f9fafb";
            ctx.font = `bold ${cs * 0.38}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(secondsLeft), (b.x + 0.5) * cs, (b.y + 0.5) * cs);
        });

        Object.entries(gsP).forEach(([sid, p]) => {
            if (!p.alive) return;
            const blink = p.invincibleTicks > 0 && Math.floor(Date.now() / 150) % 2 === 0;
            ctx.globalAlpha = blink ? 0.35 : 1.0;
            ctx.fillStyle = p.color ?? "#888";
            ctx.beginPath();
            ctx.arc((p.x + 0.5) * cs, (p.y + 0.5) * cs, cs * 0.38, 0, Math.PI * 2);
            ctx.fill();
            if (p.shield) {
                ctx.strokeStyle = "#a78bfa";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc((p.x + 0.5) * cs, (p.y + 0.5) * cs, cs * 0.45, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.fillStyle = "#000";
            ctx.font = `bold ${cs * 0.4}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText((gs.playerNames[sid] ?? "?")[0]!.toUpperCase(), (p.x + 0.5) * cs, (p.y + 0.5) * cs);
            ctx.globalAlpha = 1.0;
        });
    }, []);

    useEffect(() => { drawCanvas(); }, [gameState, drawCanvas]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(() => requestAnimationFrame(() => drawCanvas()));
        observer.observe(container);
        return () => observer.disconnect();
    }, [drawCanvas]);

    // ── Keyboard input ────────────────────────────────────────────────────
    useEffect(() => {
        const dirMap: Record<string, string> = {
            ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
            w: "up", s: "down", a: "left", d: "right",
            z: "up", q: "left"
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === " ") { e.preventDefault(); if (!e.repeat) room.send("bomberman:bomb"); return; }
            const dir = dirMap[e.key];
            if (dir) { e.preventDefault(); room.send("bomberman:move", { dir }); }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [room]);

    // ── Overlays helpers ──────────────────────────────────────────────────
    const pointsStandings = (
        <ul className="flex flex-col gap-1 mb-4 text-left">
            {rankedByPoints.map((id) => {
                const gp = gsPlayers[id];
                const pts = gameState.roundPoints[id] ?? 0;
                const isMe = id === sessionId;
                const isWinner = roundWinnerIds.includes(id);
                return (
                    <li key={id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                            {gp && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: gp.color }} />}
                            <span className={isWinner && phase === "roundEnd" ? "text-indigo-300 font-semibold" : "text-gray-300"}>
                                {playerNames[id] ?? id}
                                {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                            </span>
                        </span>
                        <span className="font-bold text-white">{pts} pt{pts !== 1 ? "s" : ""}</span>
                    </li>
                );
            })}
        </ul>
    );

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <GameShell
            room={room}
            chatMessages={chatMessages}
            myUsername={playerNames[sessionId] ?? ""}
            phase={phase}
            isHost={isHost}
            containerRef={containerRef}
            onTabChange={(tab) => { if (tab === "jeu") requestAnimationFrame(() => drawCanvas()); }}
            header={
                <>
                    <span className="text-xl">💣</span>
                    <span className="font-bold">Bomberman</span>
                    {gameState.maxRounds > 1 && (
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                            Manche {gameState.currentRound}/{gameState.maxRounds}
                        </span>
                    )}
                    {myPlayer && (
                        <>
                            <span className="text-gray-600 text-sm">|</span>
                            <span className="flex items-center gap-1 text-sm">
                                <span style={{ color: myPlayer.color }}>●</span>
                                {Array.from({ length: myPlayer.lives }).map((_, i) => (
                                    <span key={i} className="text-red-500 text-xs">♥</span>
                                ))}
                                {!myPlayer.alive && <span className="text-gray-500 ml-1">— éliminé</span>}
                            </span>
                        </>
                    )}
                </>
            }
            scoreboard={
                <>
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Joueurs</p>
                    <ul className="flex flex-col gap-3">
                        {ranked.map((id) => {
                            const name = playerNames[id] ?? id;
                            const gp = gsPlayers[id];
                            const lp = playerById.get(id);
                            const isEliminated = gp?.eliminated ?? lp?.isEliminated ?? false;
                            const isMe = id === sessionId;
                            const pts = gameState.roundPoints[id] ?? 0;
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
                                        {gameState.maxRounds > 1 ? (
                                            <span className="font-bold shrink-0 text-indigo-400">{pts}pt</span>
                                        ) : (
                                            <span className="font-bold shrink-0">{gp?.score ?? 0}</span>
                                        )}
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
                    <p className="text-xs text-gray-600 mt-3 hidden lg:block">↑↓←→ déplacer · Espace bombe</p>
                </>
            }
            roundEndContent={
                <>
                    <p className="text-2xl mb-2">💥</p>
                    <h2 className="text-lg font-bold text-white mb-1">
                        Manche {gameState.currentRound}/{gameState.maxRounds} terminée !
                    </h2>
                    {roundWinnerName ? (
                        <p className="text-indigo-400 font-semibold mb-4">🏆 {roundWinnerName}</p>
                    ) : (
                        <p className="text-gray-400 mb-4">Égalité !</p>
                    )}
                    <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Classement général</p>
                    {pointsStandings}
                </>
            }
            endContent={
                <>
                    <p className="text-3xl mb-2">🏆</p>
                    <h2 className="text-xl font-bold text-white mb-1">Partie terminée !</h2>
                    <p className="text-gray-400 text-sm mb-4">
                        {gameState.maxRounds > 1 ? `${gameState.maxRounds} manches jouées` : "Classement final"}
                    </p>
                    <ul className="flex flex-col gap-2 mb-4">
                        {rankedByPoints.map((id, i) => {
                            const gp = gsPlayers[id];
                            const lp = playerById.get(id);
                            const isEliminated = gp?.eliminated ?? lp?.isEliminated ?? false;
                            const pts = gameState.roundPoints[id] ?? 0;
                            const isMe = id === sessionId;
                            const maxPts = gameState.roundPoints[rankedByPoints[0]!] ?? 0;
                            const isChampion = pts === maxPts && maxPts > 0;
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
                                        <span className={`${isEliminated ? "line-through text-gray-500" : isChampion && i === 0 ? "text-yellow-400 font-bold" : "text-gray-300"}`}>
                                            {playerNames[id] ?? id}
                                            {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                                        </span>
                                    </span>
                                    <span className="font-bold text-white">{pts} pt{pts !== 1 ? "s" : ""}</span>
                                </li>
                            );
                        })}
                    </ul>
                </>
            }
        >
            <canvas ref={canvasRef} className="block" />
        </GameShell>
    );
}
