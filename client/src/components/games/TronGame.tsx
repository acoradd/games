import { useEffect, useRef, useCallback } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, TronGameState, ChatMsg } from "../../models/Lobby";
import GameShell from "./GameShell";

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: TronGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

export default function TronGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const { phase, players: gsPlayers, playerOrder, playerNames } = gameState;
    const isHost = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const playerById = new Map(players.map((p) => [p.id, p]));
    const myPlayer = gsPlayers[sessionId];
    const modeLabel = gameState.mode === "Snake" ? "Snake" : "Tron";
    const ranked = [...playerOrder].sort((a, b) => (gsPlayers[b]?.score ?? 0) - (gsPlayers[a]?.score ?? 0));

    // ── Canvas ────────────────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameStateRef = useRef(gameState);
    gameStateRef.current = gameState;

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const { gridSize, grid, players: gsP, playerOrder: pOrder, apples } = gameStateRef.current;
        const size = Math.min(container.clientWidth, container.clientHeight);
        if (size <= 0) return;

        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const cs = size / gridSize;

        ctx.fillStyle = "#0d1117";
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = "#1a2030";
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= gridSize; x++) {
            ctx.beginPath(); ctx.moveTo(x * cs, 0); ctx.lineTo(x * cs, size); ctx.stroke();
        }
        for (let y = 0; y <= gridSize; y++) {
            ctx.beginPath(); ctx.moveTo(0, y * cs); ctx.lineTo(size, y * cs); ctx.stroke();
        }

        for (let i = 0; i < grid.length; i++) {
            const ch = grid[i];
            if (!ch || ch === ".") continue;
            const sid = pOrder[parseInt(ch)];
            if (!sid) continue;
            const p = gsP[sid];
            const cx = i % gridSize, cy = Math.floor(i / gridSize);
            ctx.fillStyle = p?.alive ? (p.color ?? "#888") : "#333";
            ctx.globalAlpha = (p && p.x === cx && p.y === cy) ? 1.0 : 0.45;
            ctx.fillRect(cx * cs + 1, cy * cs + 1, cs - 2, cs - 2);
        }
        ctx.globalAlpha = 1.0;

        apples.forEach((a) => {
            ctx.fillStyle = "#ff1744";
            ctx.beginPath();
            ctx.arc((a.x + 0.5) * cs, (a.y + 0.5) * cs, cs * 0.35, 0, Math.PI * 2);
            ctx.fill();
        });

        for (const [, p] of Object.entries(gsP)) {
            if (!p.alive) continue;
            ctx.strokeStyle = p.color ?? "#fff";
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2);
        }
        ctx.globalAlpha = 1.0;
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
        const map: Record<string, string> = {
            ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
            w: "up", s: "down", a: "left", d: "right",
        };
        const onKey = (e: KeyboardEvent) => {
            const dir = map[e.key];
            if (dir) { e.preventDefault(); room.send("tron:input", { dir }); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [room]);

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
                    <span className="text-xl">🏍️</span>
                    <span className="font-bold">{modeLabel}</span>
                    {myPlayer && (
                        <>
                            <span className="text-gray-600 text-sm">|</span>
                            <span className="text-sm" style={{ color: myPlayer.color }}>● Vous</span>
                            {!myPlayer.alive && <span className="text-sm text-gray-500">— éliminé</span>}
                        </>
                    )}
                </>
            }
            scoreboard={
                <>
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Joueurs</p>
                    <ul className="flex flex-col gap-2">
                        {ranked.map((id) => {
                            const gp = gsPlayers[id];
                            const lp = playerById.get(id);
                            const isEliminated = gp?.eliminated ?? lp?.isEliminated ?? false;
                            const isAlive = gp?.alive ?? false;
                            return (
                                <li key={id} className={`flex items-center justify-between gap-2 text-sm ${
                                    isEliminated ? "text-gray-600" : isAlive ? "text-gray-200" : "text-gray-500"
                                }`}>
                                    <span className={`truncate flex items-center gap-1.5 ${isEliminated ? "line-through" : ""}`}>
                                        {gp && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: gp.color }} />}
                                        {playerNames[id] ?? id}
                                        {id === sessionId && <span className="text-gray-600 text-xs">(vous)</span>}
                                        {isEliminated && <span className="text-gray-600 text-xs ml-1">✕</span>}
                                        {!isAlive && !isEliminated && <span className="text-gray-600 text-xs ml-1">mort</span>}
                                    </span>
                                    <span className="font-bold shrink-0">{gp?.score ?? 0}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-xs text-gray-600 mt-3 hidden lg:block">↑↓←→ ou WASD</p>
                </>
            }
            endContent={
                <>
                    <p className="text-3xl mb-2">🏆</p>
                    <h2 className="text-xl font-bold text-white mb-1">Partie terminée !</h2>
                    <p className="text-gray-400 text-sm mb-6">Classement final</p>
                    <ul className="flex flex-col gap-2 mb-4">
                        {ranked.map((id, i) => {
                            const gp = gsPlayers[id];
                            const lp = playerById.get(id);
                            const isEliminated = gp?.eliminated ?? lp?.isEliminated ?? false;
                            return (
                                <li key={id} className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-2">
                                        <span className="text-gray-500 w-4">{i + 1}.</span>
                                        {gp && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: gp.color }} />}
                                        <span className={`${isEliminated ? "line-through text-gray-500" : i === 0 ? "text-yellow-400 font-bold" : "text-gray-300"}`}>
                                            {playerNames[id] ?? id}
                                            {id === sessionId && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                                        </span>
                                    </span>
                                    <span className="font-bold text-white">{gp?.score ?? 0} pts</span>
                                </li>
                            );
                        })}
                    </ul>
                </>
            }
        >
            <canvas ref={canvasRef} className="block" style={{ imageRendering: "pixelated" }} />
        </GameShell>
    );
}
