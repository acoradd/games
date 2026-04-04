import { useEffect, useRef, useCallback } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, TronGameState, ChatMsg, GenericGameState } from "../../models/Lobby";
import GameShell from "./GameShell";
import DPad, { isTouchDevice } from "./DPad";

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: TronGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

export default function TronGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const { phase, players: gsPlayers, playerOrder, playerNames } = gameState;
    const myPlayer  = gsPlayers[sessionId];
    const modeLabel = gameState.mode === "Snake" ? "Snake" : "Tron";

    // ── Canvas ────────────────────────────────────────────────────────────────
    const containerRef  = useRef<HTMLDivElement>(null);
    const canvasRef     = useRef<HTMLCanvasElement>(null);
    const gameStateRef  = useRef(gameState);
    gameStateRef.current = gameState;

    const drawCanvas = useCallback(() => {
        const canvas    = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const { gridSize, grid, players: gsP, playerOrder: pOrder, apples } = gameStateRef.current;
        const size = Math.min(container.clientWidth, container.clientHeight);
        if (size <= 0) return;

        canvas.width  = size;
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
            const p  = gsP[sid];
            const cx = i % gridSize, cy = Math.floor(i / gridSize);
            ctx.fillStyle   = p?.alive ? (p.color ?? "#888") : "#333";
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
            ctx.lineWidth   = 2;
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

    // ── Keyboard input ────────────────────────────────────────────────────────
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
            playerOrder.map(id => [id, {
                color:      gsPlayers[id]?.color,
                isAlive:    gsPlayers[id]?.alive,
                roundScore: gameState.mode === "Snake" ? (gsPlayers[id]?.score ?? 0) : undefined,
            }])
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
                    <span className="font-bold">{modeLabel}</span>
                    {gameState.maxRounds > 1 && (
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                            Manche {gameState.currentRound}/{gameState.maxRounds}
                        </span>
                    )}
                    {myPlayer && (
                        <>
                            <span className="text-gray-600 text-sm">|</span>
                            <span className="text-sm" style={{ color: myPlayer.color }}>● Vous</span>
                            {!myPlayer.alive && <span className="text-sm text-gray-500">— éliminé</span>}
                        </>
                    )}
                    <span className="ml-auto text-xs text-gray-600 hidden lg:block">↑↓←→ ou WASD</span>
                </>
            }
        >
            <div className="relative w-full h-full flex items-center justify-center">
                <canvas ref={canvasRef} className="block" style={{ imageRendering: "pixelated" }} />
                {phase === "playing" && isTouchDevice() && (
                    <div className="absolute bottom-3 left-3">
                        <DPad onDir={(dir) => room.send("tron:input", { dir })} />
                    </div>
                )}
            </div>
        </GameShell>
    );
}
