import { useState, useEffect } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, MemoryCard, MemoryGameState, ChatMsg } from "../../models/Lobby";
import GameShell from "./GameShell";
import Avatar from "../Avatar";
import {X} from "lucide-react";

const SYMBOLS = [
    "🎮","🎲","🎯","⚽","🏀","🎾","🏆","🚀","🌟","🎪",
    "🎨","🎭","🎰","🎵","🎬","🌈","🍕","🦁","🐬","🌺",
    "🎸","🏄","🚂","🎃","🦊",
];

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: MemoryGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

function CardButton({
    card,
    canFlip,
    onClick,
}: {
    card: MemoryCard;
    canFlip: boolean;
    onClick: () => void;
}) {
    const emoji = SYMBOLS[card.value] ?? "?";

    return (
        <button
            onClick={onClick}
            disabled={!canFlip}
            className={[
                "aspect-square rounded-xl text-2xl sm:text-3xl font-bold transition-all duration-200 flex items-center justify-center select-none",
                card.isMatched
                    ? "bg-emerald-900/40 text-emerald-400 opacity-60 cursor-default"
                    : card.isFlipped
                    ? "bg-violet-700 text-white cursor-default"
                    : canFlip
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-700 hover:text-gray-600 cursor-pointer"
                    : "bg-gray-800 text-gray-800 cursor-not-allowed",
            ].join(" ")}
        >
            {card.isFlipped || card.isMatched ? emoji : ""}
        </button>
    );
}

export default function MemoryGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const { phase, currentTurnId, cards, scores, turnDeadline, playerNames } = gameState;

    const isMyTurn = sessionId === currentTurnId;
    const canInteract = isMyTurn && phase !== "revealing" && phase !== "ended" && phase !== "roundEnd";
    const isHost = players.find((p) => p.id === sessionId)?.isHost ?? false;

    // ── Turn countdown ──────────────────────────────────────────────────────
    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!turnDeadline) {
            setTimeLeft(null);
            return;
        }
        const tick = () => setTimeLeft(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [turnDeadline]);

    function handleFlip(index: number) {
        if (!canInteract) return;
        room.send("flipCard", { index });
    }

    const colsClass = cards.length > 16 ? "grid-cols-6" : "grid-cols-4";

    // All participant IDs (from playerNames snapshot, includes eliminated)
    const participantIds = Object.keys(playerNames ?? {});
    // Current round scoreboard: sorted by pairs found
    const ranked = [...participantIds].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    // Final standings: sorted by roundPoints
    const rankedByPoints = [...participantIds].sort(
        (a, b) => (gameState.roundPoints[b] ?? 0) - (gameState.roundPoints[a] ?? 0)
    );

    const currentPlayer = players.find((p) => p.id === currentTurnId);
    const playerById = new Map(players.map((p) => [p.id, p]));

    const roundWinnerIds = gameState.roundWinnerIds ?? [];
    const roundWinnerName = roundWinnerIds.length === 1
        ? (playerNames[roundWinnerIds[0]!] ?? roundWinnerIds[0])
        : null;

    const pointsStandings = (
        <ul className="flex flex-col gap-1 mb-4 text-left">
            {rankedByPoints.map((id) => {
                const p = playerById.get(id);
                const pts = gameState.roundPoints[id] ?? 0;
                const isMe = id === sessionId;
                const isEliminated = p?.isEliminated ?? false;
                const isWinner = roundWinnerIds.includes(id);
                return (
                    <li key={id} className="flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-1 ${isEliminated ? "line-through text-gray-600" : ""}`}>
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
            playerAvatars={Object.fromEntries(players.map((p) => [p.username, p.gravatarUrl]))}
            phase={phase}
            isHost={isHost}
            spectatorCount={players.filter((p) => p.isSpectator).length}
            gameScrollable
            header={
                <>
                    <span className="text-xl">🃏</span>
                    <span className="font-bold text-white">Memory</span>
                    {gameState.maxRounds > 1 && (
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                            Manche {gameState.currentRound}/{gameState.maxRounds}
                        </span>
                    )}
                    <span className="text-gray-600 text-sm">|</span>
                    {phase !== "ended" && phase !== "roundEnd" && (
                        <span className="text-sm text-gray-400 flex items-center gap-2">
                            {isMyTurn
                                ? <span className="text-violet-400 font-semibold">Votre tour</span>
                                : <span>Tour de <span className="text-white font-medium">{currentPlayer?.username ?? "…"}</span></span>
                            }
                            {timeLeft !== null && (
                                <span className={`font-mono font-bold text-sm ${timeLeft <= 5 ? "text-red-400" : "text-gray-400"}`}>
                                    {timeLeft}s
                                </span>
                            )}
                        </span>
                    )}
                </>
            }
            scoreboard={
                <>
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                        {gameState.maxRounds > 1 ? "Points" : "Scores"}
                    </p>
                    <ul className="flex flex-col gap-2">
                        {ranked.map((id) => {
                            const name = playerNames[id] ?? id;
                            const p = playerById.get(id);
                            const isCurrentTurn = id === currentTurnId;
                            const isEliminated = p?.isEliminated ?? false;
                            const isConnected = p?.isConnected ?? true;
                            const isMe = id === sessionId;
                            const pts = gameState.roundPoints[id] ?? 0;

                            return (
                                <li
                                    key={id}
                                    className={`flex items-center justify-between gap-2 text-sm ${
                                        isEliminated
                                            ? "text-gray-600"
                                            : isCurrentTurn
                                            ? "text-violet-300"
                                            : "text-gray-300"
                                    }`}
                                >
                                    <span className={`truncate flex items-center gap-2 ${isEliminated ? "line-through" : ""}`}>
                                        <Avatar username={name} gravatarUrl={p?.gravatarUrl || null} size="sm" />
                                        <span className="flex items-center gap-1 truncate">
                                            {isCurrentTurn && !isEliminated && <span className="text-violet-400">▶</span>}
                                            {!isConnected && !isEliminated && <span title="Reconnexion…">🔴</span>}
                                            <span className="truncate">{name}</span>
                                            {isMe && <span className="text-gray-600 text-xs shrink-0">(vous)</span>}
                                            {isEliminated && <span className="text-gray-600 text-xs ml-1 shrink-0">(éliminé)</span>}
                                            {!isConnected && !isEliminated && <span className="text-gray-500 text-xs ml-1 shrink-0">(reconnexion…)</span>}
                                        </span>
                                        {isHost && !isConnected && !isEliminated && (
                                            <button onClick={() => room.send("kick", {sessionId: id})} title="Expulser" className="shrink-0 text-gray-600 hover:text-red-400 transition-colors ml-auto">
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </span>
                                    {gameState.maxRounds > 1 ? (
                                        <span className="font-bold shrink-0 text-indigo-400">{pts}pt</span>
                                    ) : (
                                        <span className="font-bold shrink-0">{scores[id] ?? 0}</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-xs text-gray-600 mt-3">
                        {cards.filter((c) => c.isMatched).length / 2} / {cards.length / 2} paires
                    </p>
                </>
            }
            roundEndContent={
                <>
                    <p className="text-2xl mb-2">🃏</p>
                    <h2 className="text-lg font-bold text-white mb-1">
                        Manche {gameState.currentRound}/{gameState.maxRounds} terminée !
                    </h2>
                    {roundWinnerName ? (
                        <>
                            <p className="text-indigo-400 font-semibold">🏆 {roundWinnerName}</p>
                            <p className="text-gray-500 text-xs mb-4">
                                {scores[roundWinnerIds[0]!] ?? 0} paire{(scores[roundWinnerIds[0]!] ?? 0) > 1 ? "s" : ""} trouvée{(scores[roundWinnerIds[0]!] ?? 0) > 1 ? "s" : ""}
                            </p>
                        </>
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
                            const p = playerById.get(id);
                            const isEliminated = p?.isEliminated ?? false;
                            const pts = gameState.roundPoints[id] ?? 0;
                            const isMe = id === sessionId;
                            const maxPts = gameState.roundPoints[rankedByPoints[0]!] ?? 0;
                            const isChampion = pts === maxPts && maxPts > 0;
                            return (
                                <li key={id} className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-2">
                                        <span className="text-gray-500 w-4">{i + 1}.</span>
                                        <span className={`${isEliminated ? "line-through text-gray-500" : isChampion && i === 0 ? "text-yellow-400 font-bold" : "text-gray-300"}`}>
                                            {playerNames[id] ?? id}
                                            {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                                            {isEliminated && <span className="text-gray-600 text-xs ml-1">(éliminé)</span>}
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
            <div className={`grid ${colsClass} gap-2 w-full max-w-xl`}>
                {cards.map((card, index) => {
                    const isFlippable = canInteract && !card.isFlipped && !card.isMatched;
                    return (
                        <CardButton
                            key={card.id}
                            card={card}
                            canFlip={isFlippable}
                            onClick={() => handleFlip(index)}
                        />
                    );
                })}
            </div>
        </GameShell>
    );
}
