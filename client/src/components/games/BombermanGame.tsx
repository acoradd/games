import { useEffect, useRef, useCallback } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, BombermanGameState, ChatMsg, GenericGameState } from "../../models/Lobby";
import GameShell from "./GameShell";
import DPad, { isTouchDevice } from "./DPad";

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: BombermanGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

export default function BombermanGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const { phase, players: gsPlayers, playerOrder, playerNames } = gameState;
    const myPlayer = gsPlayers[sessionId];

    // ── Canvas ────────────────────────────────────────────────────────────────
    const containerRef  = useRef<HTMLDivElement>(null);
    const canvasRef     = useRef<HTMLCanvasElement>(null);
    const gameStateRef  = useRef(gameState);
    gameStateRef.current = gameState;

    const drawCanvas = useCallback(() => {
        const container = containerRef.current;
        const canvas    = canvasRef.current;
        if (!container || !canvas) return;

        const gs = gameStateRef.current;
        const { cols, rows, grid, explosions, bonuses, bombs, players: gsP } = gs;
        const cs = Math.min(container.clientWidth / cols, container.clientHeight / rows);
        if (cs <= 0) return;

        canvas.width  = Math.floor(cs * cols);
        canvas.height = Math.floor(cs * rows);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const ch = grid[y * cols + x];
                ctx.fillStyle = ch === "1" ? "#374151" : ch === "2" ? "#92400e" : "#111827";
                ctx.fillRect(x * cs, y * cs, cs, cs);
                ctx.strokeStyle = "#1f2937";
                ctx.lineWidth   = 0.5;
                ctx.strokeRect(x * cs, y * cs, cs, cs);
            }
        }

        ctx.fillStyle = "rgba(249,115,22,0.75)";
        explosions.forEach((exp) => {
            exp.cells.forEach(({ x, y }) => ctx.fillRect(x * cs, y * cs, cs, cs));
        });

        bonuses.forEach((b) => {
            const emoji = b.type === "bomb" ? "💣" : b.type === "range" ? "🎯" : "🛡️";
            ctx.font          = `${cs * 0.65}px sans-serif`;
            ctx.textAlign     = "center";
            ctx.textBaseline  = "middle";
            ctx.fillText(emoji, (b.x + 0.5) * cs, (b.y + 0.5) * cs);
        });

        bombs.forEach((b) => {
            ctx.fillStyle = "#111827";
            ctx.beginPath();
            ctx.arc((b.x + 0.5) * cs, (b.y + 0.5) * cs, cs * 0.38, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#4b5563";
            ctx.lineWidth   = 1;
            ctx.stroke();
            const secondsLeft = Math.max(1, Math.ceil(b.fuseLeft * gs.bombTickMs / 1000));
            ctx.fillStyle = secondsLeft <= 1 ? "#ef4444" : "#f9fafb";
            ctx.font      = `bold ${cs * 0.38}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(secondsLeft), (b.x + 0.5) * cs, (b.y + 0.5) * cs);
        });

        Object.entries(gsP).forEach(([sid, p]) => {
            if (!p.alive) return;
            const blink = p.invincibleTicks > 0 && Math.floor(Date.now() / 150) % 2 === 0;
            ctx.globalAlpha = blink ? 0.35 : 1.0;
            ctx.fillStyle   = p.color ?? "#888";
            ctx.beginPath();
            ctx.arc((p.x + 0.5) * cs, (p.y + 0.5) * cs, cs * 0.38, 0, Math.PI * 2);
            ctx.fill();
            if (p.shield) {
                ctx.strokeStyle = "#a78bfa";
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.arc((p.x + 0.5) * cs, (p.y + 0.5) * cs, cs * 0.45, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.fillStyle    = "#000";
            ctx.font         = `bold ${cs * 0.4}px sans-serif`;
            ctx.textAlign    = "center";
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

    // ── Keyboard input ────────────────────────────────────────────────────────
    useEffect(() => {
        const dirMap: Record<string, string> = {
            ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
            w: "up", s: "down", a: "left", d: "right",
            z: "up", q: "left",
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === " ") { e.preventDefault(); if (!e.repeat) room.send("bomberman:bomb"); return; }
            const dir = dirMap[e.key];
            if (dir) { e.preventDefault(); room.send("bomberman:move", { dir }); }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [room]);

    // ── GenericGameState ──────────────────────────────────────────────────────
    const genericState: GenericGameState = {
        phase,
        playerOrder,
        playerNames,
        roundPoints:     gameState.roundPoints,
        roundWinnerIds:  gameState.roundWinnerIds ?? [],
        currentRound:    gameState.currentRound,
        maxRounds:       gameState.maxRounds,
        activePlayerIds: playerOrder.filter(id => gsPlayers[id]?.alive),
        playerData:      Object.fromEntries(
            playerOrder.map(id => {
                const gp = gsPlayers[id];
                return [id, {
                    color:   gp?.color,
                    isAlive: gp?.alive,
                }];
            })
        ),
    };

    return (
        <GameShell
            room={room}
            chatMessages={chatMessages}
            myUsername={playerNames[sessionId] ?? ""}
            playerAvatars={Object.fromEntries(players.map((p) => [p.username, p.gravatarUrl]))}
            genericState={genericState}
            players={players}
            sessionId={sessionId}
            containerRef={containerRef}
            onTabChange={(tab) => { if (tab === "jeu") requestAnimationFrame(() => drawCanvas()); }}
            header={
                <>
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
                    <span className="ml-auto text-xs text-gray-600 hidden lg:block">↑↓←→ déplacer · Espace bombe</span>
                </>
            }
        >
            <div className="relative w-full h-full flex items-center justify-center">
                <canvas ref={canvasRef} className="block" />
                {phase === "playing" && isTouchDevice() && (
                    <div className="absolute bottom-3 left-0 right-0 flex items-end justify-between px-3 pointer-events-none">
                        <div className="pointer-events-auto">
                            <DPad onDir={(dir) => room.send("bomberman:move", { dir })} repeatMs={200} />
                        </div>
                        <button
                            onPointerDown={(e) => { e.preventDefault(); room.send("bomberman:bomb"); }}
                            className="pointer-events-auto w-16 h-16 rounded-full bg-red-800/70 border-2 border-red-500/50 text-3xl flex items-center justify-center active:bg-red-600/70 touch-none select-none mb-1"
                        >
                            💣
                        </button>
                    </div>
                )}
            </div>
        </GameShell>
    );
}
