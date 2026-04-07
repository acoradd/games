import {Loader2} from 'lucide-react';
import type {GameMode} from '../models/GameMode';

interface GameCardProps {
    gameMode: GameMode;
    onPlay?: () => void;
    loading?: boolean;
}

export default function GameCard({gameMode, onPlay, loading}: GameCardProps) {
    const thumbnailUrl = `/assets/games/${gameMode.slug}/thumbnail.png`;
    return (
        <div className="bg-gray-800 rounded-xl overflow-hidden flex flex-col border border-gray-700 hover:border-indigo-500 transition-colors">
            <img
                src={thumbnailUrl}
                alt={gameMode.name}
                className="w-full h-36 object-cover"
            />
            <div className="flex flex-col flex-1 gap-3 p-4">
                <div className="flex-1">
                    <h2 className="text-base font-bold text-white">{gameMode.name}</h2>
                    {gameMode.description && (
                        <p className="text-gray-400 text-xs mt-1 line-clamp-2">{gameMode.description}</p>
                    )}
                    <p className="text-gray-600 text-xs mt-2">
                        {gameMode.minPlayers}–{gameMode.maxPlayers} joueurs
                    </p>
                </div>
                {onPlay && (
                    <button
                        onClick={onPlay}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</> : 'Jouer →'}
                    </button>
                )}
            </div>
        </div>
    );
}
