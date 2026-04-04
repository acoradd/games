import { useState, useEffect } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, MemoryCard, MemoryGameState, ChatMsg, GenericGameState } from "../../models/Lobby";
import GameShell from "./GameShell";

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

function CardButton({ card, canFlip, onClick }: { card: MemoryCard; canFlip: boolean; onClick: () => void }) {
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
    const isMyTurn    = sessionId === currentTurnId;
    const canInteract = isMyTurn && phase !== "revealing" && phase !== "ended" && phase !== "roundEnd";

    // Turn countdown
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    useEffect(() => {
        if (!turnDeadline) { setTimeLeft(null); return; }
        const tick = () => setTimeLeft(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [turnDeadline]);

    function handleFlip(index: number) {
        if (!canInteract) return;
        room.send("flipCard", { index });
    }

    // Build GenericGameState
    const participantIds = Object.keys(playerNames ?? {});
    const genericState: GenericGameState = {
        phase,
        playerOrder:    participantIds,
        playerNames,
        roundPoints:    gameState.roundPoints,
        roundWinnerIds: gameState.roundWinnerIds ?? [],
        currentRound:   gameState.currentRound,
        maxRounds:      gameState.maxRounds,
        activePlayerIds: [currentTurnId],
        playerData:     Object.fromEntries(
            participantIds.map(id => [id, {
                roundScore:     scores[id] ?? 0,
                roundScoreUnit: "paires",
            }])
        ),
        roundWinnerSubtitle: gameState.roundWinnerIds?.length === 1
            ? (() => {
                const n = scores[gameState.roundWinnerIds[0]!] ?? 0;
                return `${n} paire${n > 1 ? "s" : ""} trouvée${n > 1 ? "s" : ""}`;
            })()
            : undefined,
    };

    const colsClass = cards.length > 16 ? "grid-cols-6" : "grid-cols-4";
    const currentPlayerName = playerNames[currentTurnId] ?? "…";

    return (
        <GameShell
            room={room}
            chatMessages={chatMessages}
            myUsername={playerNames[sessionId] ?? ""}
            playerAvatars={Object.fromEntries(players.map((p) => [p.username, p.gravatarUrl]))}
            genericState={genericState}
            players={players}
            sessionId={sessionId}
            gameScrollable
            header={
                <>
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
                                : <span>Tour de <span className="text-white font-medium">{currentPlayerName}</span></span>
                            }
                            {timeLeft !== null && (
                                <span className={`font-mono font-bold text-sm ${timeLeft <= 5 ? "text-red-400" : "text-gray-400"}`}>
                                    {timeLeft}s
                                </span>
                            )}
                        </span>
                    )}
                    <span className="ml-auto text-xs text-gray-600">
                        {cards.filter((c) => c.isMatched).length / 2} / {cards.length / 2} paires
                    </span>
                </>
            }
        >
            <div className={`grid ${colsClass} gap-2 w-full max-w-xl`}>
                {cards.map((card, index) => (
                    <CardButton
                        key={card.id}
                        card={card}
                        canFlip={canInteract && !card.isFlipped && !card.isMatched}
                        onClick={() => handleFlip(index)}
                    />
                ))}
            </div>
        </GameShell>
    );
}
