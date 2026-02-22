import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameMode } from "../models/GameMode";
import { getGameModes } from "../services/gameModeService";
import { createAnonymousPlayer, getStoredPlayer } from "../services/playerService";
import GameCard from "../components/GameCard";
import JoinRoomForm from "../components/JoinRoomForm";
import UsernameModal from "../components/UsernameModal";

export default function HomePage() {
    const [gameModes, setGameModes] = useState<GameMode[]>([]);
    const [loadingGames, setLoadingGames] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [creatingPlayer, setCreatingPlayer] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const stored = getStoredPlayer();
        if (!stored) {
            setShowModal(true);
        }

        getGameModes()
            .then(setGameModes)
            .catch(() => setError("Impossible de charger les jeux. Le serveur est-il démarré ?"))
            .finally(() => setLoadingGames(false));
    }, []);

    async function handleUsernameConfirm(username: string) {
        setCreatingPlayer(true);
        try {
            await createAnonymousPlayer(username);
            setShowModal(false);
        } catch {
            // Keep modal open on error
        } finally {
            setCreatingPlayer(false);
        }
    }

    function handleCreateRoom(slug: string) {
        navigate(`/game/${slug}/new`);
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {showModal && (
                <UsernameModal onConfirm={handleUsernameConfirm} loading={creatingPlayer} />
            )}

            <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">AccorAdd Games</h1>
                {getStoredPlayer() && (
                    <span className="text-gray-400 text-sm">
                        {getStoredPlayer()?.player.username}
                    </span>
                )}
            </header>

            <main className="max-w-5xl mx-auto px-6 py-10">
                <section className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-300 mb-3">Rejoindre une partie</h2>
                    <JoinRoomForm />
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-300 mb-4">Choisir un jeu</h2>

                    {loadingGames && (
                        <p className="text-gray-500 text-sm">Chargement…</p>
                    )}

                    {error && (
                        <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
                            {error}
                        </p>
                    )}

                    {!loadingGames && !error && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {gameModes.map((gm) => (
                                <GameCard
                                    key={gm.id}
                                    gameMode={gm}
                                    onCreateRoom={handleCreateRoom}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
