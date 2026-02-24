import type { GameMode } from "../models/GameMode";

interface GameCardProps {
    gameMode: GameMode;
    onCreateRoom: (slug: string) => void;
}

export default function GameCard({ gameMode, onCreateRoom }: GameCardProps) {
    const thumbnailUrl = `/assets/games/${gameMode.slug}/thumbnail.png`;
    return (
        <div className="bg-gray-800 rounded-xl p-6 flex flex-col gap-4 border border-gray-700 hover:border-indigo-500 transition-colors">
            <img
                src={thumbnailUrl}
                alt={gameMode.name}
                className="w-full h-36 object-cover rounded-lg"
            />
            <div className="flex-1">
                <h2 className="text-xl font-bold text-white">{gameMode.name}</h2>
                {gameMode.description && (
                    <p className="text-gray-400 text-sm mt-1">{gameMode.description}</p>
                )}
                <p className="text-gray-500 text-xs mt-2">
                    {gameMode.minPlayers}–{gameMode.maxPlayers} joueurs
                </p>
            </div>

            <button
                onClick={() => onCreateRoom(gameMode.slug)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded-lg transition-colors"
            >
                Créer une partie
            </button>
        </div>
    );
}
