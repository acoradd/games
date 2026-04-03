import {useEffect, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import GameCard from '../components/GameCard';
import JoinRoomForm from '../components/JoinRoomForm';
import UsernameModal from '../components/UsernameModal';
import type {GameMode} from '../models/GameMode';
import {getGameModes} from '../services/gameModeService';
import {createAnonymousPlayer, getStoredPlayer} from '../services/playerService';
import {changelog} from '../data/changelog';
import type {ChangelogVersion} from '../data/changelog';

export default function HomePage() {
    const [gameModes, setGameModes] = useState<GameMode[]>([]);
    const [loadingGames, setLoadingGames] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [creatingPlayer, setCreatingPlayer] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? null;

    useEffect(() => {
        if (!getStoredPlayer()) setShowModal(true);

        getGameModes()
            .then(setGameModes)
            .catch(() => setError('Impossible de charger les jeux. Le serveur est-il démarré ?'))
            .finally(() => setLoadingGames(false));
    }, []);

    async function handleUsernameConfirm(username: string) {
        setCreatingPlayer(true);
        try {
            await createAnonymousPlayer(username);
            if (returnTo) {
                navigate(returnTo);
            } else {
                setShowModal(false);
            }
        } catch {
            // Keep modal open on error
        } finally {
            setCreatingPlayer(false);
        }
    }

    function handleCreateLobby() {
        navigate('/lobby/new');
    }

    const typeBadge: Record<ChangelogVersion['entries'][number]['type'], string> = {
        feat: 'bg-indigo-900/50 text-indigo-300 border border-indigo-700',
        fix: 'bg-amber-900/40 text-amber-300 border border-amber-700',
        chore: 'bg-gray-800 text-gray-400 border border-gray-700',
    };

    const typeLabel: Record<ChangelogVersion['entries'][number]['type'], string> = {
        feat: 'nouveauté',
        fix: 'correction',
        chore: 'amélioration',
    };

    return (
        <div className="h-dvh bg-gray-950 text-white flex flex-col">
            {showModal && (
                <UsernameModal onConfirm={handleUsernameConfirm} loading={creatingPlayer}/>
            )}

            <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <h1 className="text-xl font-bold tracking-tight flex gap-2 items-center">
                    <img src="/favicon.png"
                         alt="home"
                         className="object-cover h-8 hover:scale-125 transition-all brightness-150 hover:brightness-200"/>
                    Games
                </h1>
                <div className="flex items-center gap-4">
                    {getStoredPlayer() && (
                        <span className="text-gray-400 text-sm">{getStoredPlayer()?.player.username}</span>
                    )}
                    <button
                        onClick={handleCreateLobby}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
                    >
                        + Créer un lobby
                    </button>
                </div>
            </header>

            <main className="flex-auto overflow-y-auto">
                <section className="max-w-5xl mx-auto px-6 py-10 ">
                    <section className="mb-8">
                        <h2 className="text-lg font-semibold text-gray-300 mb-3">Rejoindre une partie</h2>
                        <JoinRoomForm/>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-300 mb-1">Les jeux</h2>
                        <p className="text-gray-600 text-sm mb-4">Créez un lobby et choisissez le jeu une fois à
                            l'intérieur.</p>

                        {loadingGames && <p className="text-gray-500 text-sm">Chargement…</p>}

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
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="mt-12">
                        <h2 className="text-lg font-semibold text-gray-300 mb-4">Historique des modifications</h2>
                        <div className="space-y-6">
                            {changelog.map((version) => (
                                <div key={version.version}
                                     className="border border-gray-800 rounded-xl bg-gray-900/50 overflow-hidden">
                                    <div
                                        className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900">
                                        <span className="text-sm font-bold text-white">v{version.version}</span>
                                        <span className="text-xs text-gray-500">{version.date}</span>
                                    </div>
                                    <ul className="divide-y divide-gray-800/60">
                                        {version.entries.map((entry, i) => (
                                            <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                                                <span
                                                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${typeBadge[entry.type]}`}>
                                                    {typeLabel[entry.type]}
                                                </span>
                                                <span className="text-sm text-gray-300">{entry.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>

                </section>
            </main>
        </div>
    );
}
