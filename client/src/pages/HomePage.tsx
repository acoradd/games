import {useEffect, useRef, useState} from 'react';
import {User, Settings, LogOut, ChevronDown} from 'lucide-react';
import Avatar from '../components/Avatar';
import {useNavigate, useLocation} from 'react-router-dom';
import GameCard from '../components/GameCard';
import JoinRoomForm from '../components/JoinRoomForm';
import type {GameMode} from '../models/GameMode';
import {getGameModes} from '../services/gameModeService';
import {createLobby} from '../services/lobbyService';
import {clearStoredPlayer, getStoredPlayer} from '../services/playerService';
import {setCurrentRoom} from '../webservices/currentLobbyRoom';
import {changelog} from '../data/changelog';
import type {ChangelogVersion} from '../data/changelog';

export default function HomePage() {
    const [gameModes, setGameModes] = useState<GameMode[]>([]);
    const [loadingGames, setLoadingGames] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [launchingSlug, setLaunchingSlug] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const wasKicked = (location.state as Record<string, unknown> | null)?.kicked === true;
    const storedPlayer = getStoredPlayer();

    useEffect(() => {
        getGameModes()
            .then(setGameModes)
            .catch(() => setError('Impossible de charger les jeux. Le serveur est-il démarré ?'))
            .finally(() => setLoadingGames(false));
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function handleCreateLobby() {
        if (!storedPlayer) {
            navigate('/auth', {state: {returnTo: '/lobby/new'}});
            return;
        }
        navigate('/lobby/new');
    }

    async function handlePlayGame(slug: string) {
        if (!storedPlayer) {
            navigate('/auth', {state: {returnTo: '/lobby/new', gameSlug: slug}});
            return;
        }
        setLaunchingSlug(slug);
        try {
            const room = await createLobby();
            room.send('selectGame', {slug});
            setCurrentRoom(room);
            navigate(`/lobby/${room.roomId}`, {replace: true});
        } catch {
            setLaunchingSlug(null);
        }
    }

    function handleLogout() {
        clearStoredPlayer();
        setMenuOpen(false);
        navigate('/');
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
            <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <h1 className="text-xl font-bold tracking-tight flex gap-2 items-center">
                    <img src="/favicon.png"
                         alt="home"
                         className="object-cover h-8 hover:scale-125 transition-all brightness-150 hover:brightness-200"/>
                    Games
                </h1>

                <div className="flex items-center gap-3">
                    {storedPlayer ? (
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen((o) => !o)}
                                className="flex items-center gap-2.5 hover:bg-gray-800 rounded-xl px-3 py-2 transition-colors"
                            >
                                <Avatar username={storedPlayer.player.displayName ?? storedPlayer.player.username} gravatarUrl={storedPlayer.player.gravatarUrl ?? null} size="sm" />
                                <span className="text-sm text-gray-300 font-medium">{storedPlayer.player.displayName ?? storedPlayer.player.username}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {menuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-44 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
                                    <button
                                        onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-2.5"
                                    >
                                        <User className="w-4 h-4 text-gray-500" />
                                        Mon profil
                                    </button>
                                    <button
                                        onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-2.5"
                                    >
                                        <Settings className="w-4 h-4 text-gray-500" />
                                        Paramètres
                                    </button>
                                    <div className="border-t border-gray-800"/>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors flex items-center gap-2.5"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Déconnexion
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => navigate('/auth')}
                            className="text-gray-300 hover:text-white text-sm transition-colors px-3 py-2"
                        >
                            Se connecter
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-auto overflow-y-auto">
                <section className="max-w-5xl mx-auto px-6 py-10">

                    {wasKicked && (
                        <p className="mb-6 text-sm text-amber-400 bg-amber-900/20 border border-amber-800 rounded-xl px-4 py-3">
                            Tu as été expulsé du lobby par l'hôte.
                        </p>
                    )}

                    <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
                            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Rejoindre</p>
                            <JoinRoomForm/>
                        </div>

                        <button
                            onClick={handleCreateLobby}
                            className="group relative bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/60 hover:border-indigo-600 rounded-2xl p-5 flex flex-col justify-between text-left transition-all overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-transparent pointer-events-none"/>
                            <p className="text-sm font-semibold text-indigo-400 uppercase tracking-widest">Créer</p>
                            <div>
                                <p className="text-xl font-bold text-white">Nouveau lobby</p>
                                <p className="text-sm text-gray-400 mt-1">Lance une partie et invite tes amis.</p>
                            </div>
                        </button>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-300 mb-1">Les jeux</h2>
                        <p className="text-gray-600 text-sm mb-4">Créez un lobby et choisissez le jeu une fois à l'intérieur.</p>

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
                                        onPlay={() => handlePlayGame(gm.slug)}
                                        loading={launchingSlug === gm.slug}
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
                                    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900">
                                        <span className="text-sm font-bold text-white">v{version.version}</span>
                                        <span className="text-xs text-gray-500">{version.date}</span>
                                    </div>
                                    <ul className="divide-y divide-gray-800/60">
                                        {version.entries.map((entry, i) => (
                                            <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                                                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${typeBadge[entry.type]}`}>
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

            <footer className="border-t border-gray-800 px-6 py-4 text-center text-xs text-gray-600 flex flex-wrap justify-center gap-4">
                <span>Accoradd Games — Projet open source</span>
                <a href="/mentions-legales" className="hover:text-gray-400 transition-colors">Mentions légales</a>
                <a href="/confidentialite" className="hover:text-gray-400 transition-colors">Politique de confidentialité</a>
                <a href="/cgu" className="hover:text-gray-400 transition-colors">CGU</a>
            </footer>
        </div>
    );
}
