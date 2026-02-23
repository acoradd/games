import { useNavigate } from "react-router-dom";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, MemoryCard, MemoryGameState } from "../../models/Lobby";

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
    roomId: string;
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

export default function MemoryGame({ room, sessionId, gameState, players, roomId }: Props) {
    const navigate = useNavigate();
    const { phase, currentTurnId, cards, scores } = gameState;

    const isMyTurn = sessionId === currentTurnId;
    const canInteract = isMyTurn && phase !== "revealing" && phase !== "ended";

    function handleFlip(index: number) {
        if (!canInteract) return;
        room.send("flipCard", { index });
    }

    const colsClass = cards.length > 16 ? "grid-cols-6" : "grid-cols-4";

    // Sort players by score descending for scoreboard
    const ranked = [...players].sort(
        (a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)
    );

    const currentPlayer = players.find((p) => p.id === currentTurnId);

    return (
        <div className="h-dvh bg-gray-950 text-white flex flex-col">

            {/* Header */}
            <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
                <span className="text-xl">🃏</span>
                <span className="font-bold text-white">Memory</span>
                <span className="text-gray-600 text-sm">|</span>
                {phase !== "ended" && (
                    <span className="text-sm text-gray-400">
                        {isMyTurn
                            ? <span className="text-violet-400 font-semibold">Votre tour</span>
                            : <span>Tour de <span className="text-white font-medium">{currentPlayer?.username ?? "…"}</span></span>
                        }
                    </span>
                )}
            </header>

            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Game grid */}
                <main className="flex-1 overflow-y-auto p-4 flex items-start justify-center">
                    <div className={`grid ${colsClass} gap-2 w-full max-w-xl`}>
                        {cards.map((card, index) => {
                            const isFlippable =
                                canInteract &&
                                !card.isFlipped &&
                                !card.isMatched;
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
                </main>

                {/* Scoreboard sidebar */}
                <aside className="w-44 shrink-0 border-l border-gray-800 p-4 flex flex-col gap-3 overflow-y-auto">
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Scores</p>
                    <ul className="flex flex-col gap-2">
                        {ranked.map((p) => (
                            <li
                                key={p.id}
                                className={`flex items-center justify-between gap-2 text-sm ${
                                    p.id === currentTurnId ? "text-violet-300" : "text-gray-300"
                                }`}
                            >
                                <span className="truncate flex items-center gap-1">
                                    {p.id === currentTurnId && <span className="text-violet-400">▶</span>}
                                    {p.username}
                                    {p.id === sessionId && <span className="text-gray-600 text-xs">(vous)</span>}
                                </span>
                                <span className="font-bold shrink-0">{scores[p.id] ?? 0}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-gray-600 mt-auto">
                        {cards.filter((c) => c.isMatched).length / 2} / {cards.length / 2} paires
                    </p>
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
                            {ranked.map((p, i) => (
                                <li key={p.id} className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-2">
                                        <span className="text-gray-500 w-4">{i + 1}.</span>
                                        <span className={i === 0 ? "text-yellow-400 font-bold" : "text-gray-300"}>
                                            {p.username}
                                            {p.id === sessionId && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                                        </span>
                                    </span>
                                    <span className="font-bold text-white">{scores[p.id] ?? 0} pts</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={() => navigate(`/lobby/${roomId}`)}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
                        >
                            Retour au lobby
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
