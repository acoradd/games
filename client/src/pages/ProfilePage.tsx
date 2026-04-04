import { useEffect, useState } from 'react';
import { Settings, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStoredPlayer } from '../services/playerService';
import { fetchProfile, fetchGameSessions } from '../services/profileService';
import type { GameSession } from '../services/profileService';
import type { Player } from '../models/Player';
import Avatar from '../components/Avatar';

const GAME_LABELS: Record<string, string> = {
    memory: 'Memory',
    tron: 'Tron',
    bomberman: 'Bomberman',
    motus: 'Motus',
};


interface GameStats {
    slug: string;
    played: number;
    wins: number;
    bestScore: number;
}

function computeGameStats(sessions: GameSession[]): GameStats[] {
    const map = new Map<string, GameStats>();
    for (const s of sessions) {
        const existing = map.get(s.gameModeSlug) ?? { slug: s.gameModeSlug, played: 0, wins: 0, bestScore: 0 };
        existing.played++;
        if (s.result === 'win') existing.wins++;
        if (s.score > existing.bestScore) existing.bestScore = s.score;
        map.set(s.gameModeSlug, existing);
    }
    return [...map.values()].sort((a, b) => b.played - a.played);
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

export default function ProfilePage() {
    const navigate = useNavigate();
    const stored = getStoredPlayer();

    const [player, setPlayer] = useState<Player | null>(null);
    const [sessions, setSessions] = useState<GameSession[]>([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingSessions, setLoadingSessions] = useState(true);

    const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

    useEffect(() => {
        if (!stored) {
            navigate('/auth', { state: { returnTo: '/profile' } });
            return;
        }
        fetchProfile()
            .then(setPlayer)
            .finally(() => setLoadingProfile(false));
        fetchGameSessions()
            .then(setSessions)
            .finally(() => setLoadingSessions(false));
    }, []);

    const wins = sessions.filter((s) => s.result === 'win').length;
    const losses = sessions.filter((s) => s.result === 'loss').length;
    const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : null;
    const gameStats = computeGameStats(sessions);

    return (
        <div className="min-h-dvh bg-gray-950 text-white flex flex-col">
            <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
                <button onClick={() => navigate('/')}>
                    <img src="/favicon.png" alt="home"
                         className="h-8 brightness-150 hover:brightness-200 hover:scale-110 transition-all"/>
                </button>
                <span className="text-gray-700">|</span>
                <span className="font-bold text-white">Mon profil</span>
                <button
                    onClick={() => navigate('/settings')}
                    className="ml-auto text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1.5"
                >
                    <Settings className="w-4 h-4" /> Paramètres
                </button>
            </header>

            <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10 flex flex-col gap-8">

                {/* Infos */}
                {!loadingProfile && player && (
                    <section className="flex items-center gap-4">
                        <Avatar username={player.username} gravatarUrl={player.gravatarUrl} size="lg" />
                        <div>
                            <p className="text-xl font-bold">{player.username}</p>
                            <p className="text-sm text-gray-500">
                                Membre depuis {new Date(player.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </section>
                )}

                <section>
                    {!loadingSessions && sessions.length > 0 && (
                        <div className="flex gap-6 mb-5 flex-wrap">
                            <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 text-center">
                                <p className="text-2xl font-bold text-white">{sessions.length}</p>
                                <p className="text-xs text-gray-500 mt-0.5">parties</p>
                            </div>
                            <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 text-center">
                                <p className="text-2xl font-bold text-emerald-400">{wins}</p>
                                <p className="text-xs text-gray-500 mt-0.5">victoires</p>
                            </div>
                            <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 text-center">
                                <p className="text-2xl font-bold text-red-400">{losses}</p>
                                <p className="text-xs text-gray-500 mt-0.5">défaites</p>
                            </div>
                            {winRate !== null && (
                                <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 text-center">
                                    <p className="text-2xl font-bold text-indigo-400">{winRate}%</p>
                                    <p className="text-xs text-gray-500 mt-0.5">win rate</p>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* Stats par jeu */}
                {!loadingSessions && gameStats.length > 0 && (
                    <section>
                        <h2 className="text-base font-semibold text-white mb-4">Stats par jeu</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {gameStats.map((gs) => {
                                const wr = Math.round((gs.wins / gs.played) * 100);
                                return (
                                    <div key={gs.slug} className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 flex flex-col gap-3">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`/assets/games/${gs.slug}/icon.png`}
                                                alt={gs.slug}
                                                className="w-10 h-10 rounded-lg object-cover shrink-0"
                                            />
                                            <span className="font-bold text-white">{GAME_LABELS[gs.slug] ?? gs.slug}</span>
                                        </div>
                                        <div className="flex gap-4 text-sm">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-white text-lg">{gs.played}</span>
                                                <span className="text-gray-500 text-xs">parties</span>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-emerald-400 text-lg">{gs.wins}</span>
                                                <span className="text-gray-500 text-xs">victoires</span>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-indigo-400 text-lg">{wr}%</span>
                                                <span className="text-gray-500 text-xs">win rate</span>
                                            </div>
                                            {gs.bestScore > 0 && (
                                                <div className="flex flex-col items-center">
                                                    <span className="font-bold text-yellow-400 text-lg">{gs.bestScore}</span>
                                                    <span className="text-gray-500 text-xs">meilleur score</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="w-full bg-gray-800 rounded-full h-1.5">
                                            <div
                                                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                                                style={{ width: `${wr}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Historique */}
                <section>
                    <h2 className="text-base font-semibold text-white mb-4">Historique des parties</h2>

                    {loadingSessions && <p className="text-gray-500 text-sm">Chargement…</p>}

                    {!loadingSessions && sessions.length === 0 && (
                        <p className="text-gray-600 text-sm">Aucune partie jouée pour l'instant.</p>
                    )}

                    {!loadingSessions && sessions.length > 0 && (
                        <div className="border border-gray-800 rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-800 bg-gray-900">
                                        <th className="text-left px-5 py-3 text-gray-500 font-medium">Jeu</th>
                                        <th className="text-left px-5 py-3 text-gray-500 font-medium">Résultat</th>
                                        <th className="text-left px-5 py-3 text-gray-500 font-medium">Score</th>
                                        <th className="text-left px-5 py-3 text-gray-500 font-medium">Date</th>
                                        <th/>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map((s) => {
                                        const isOpen = expandedGameId === s.gameId;
                                        const allPlayers = [
                                            { username: player?.username ?? '…', result: s.result, score: s.score, gravatarUrl: player?.gravatarUrl ?? null, isMe: true },
                                            ...s.coPlayers.map((cp) => ({ ...cp, gravatarUrl: cp.gravatarUrl ?? null, isMe: false })),
                                        ].sort((a, b) => b.score - a.score);

                                        return (
                                            <>
                                                <tr
                                                    key={s.id}
                                                    onClick={() => setExpandedGameId(isOpen ? null : s.gameId)}
                                                    className={`border-t border-gray-800/60 cursor-pointer transition-colors ${isOpen ? 'bg-gray-900/60' : 'hover:bg-gray-900/40'}`}
                                                >
                                                    <td className="px-5 py-3 text-white font-medium">
                                                        {GAME_LABELS[s.gameModeSlug] ?? s.gameModeSlug}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                                            s.result === 'win'
                                                                ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
                                                                : 'bg-red-900/30 text-red-400 border border-red-900'
                                                        }`}>
                                                            {s.result === 'win' ? 'Victoire' : 'Défaite'}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-gray-300">{s.score}</td>
                                                    <td className="px-5 py-3 text-gray-500">{formatDate(s.playedAt)}</td>
                                                    <td className="px-5 py-3 text-gray-600 text-right">
                                                        <ChevronDown className={`w-4 h-4 inline-block transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                    </td>
                                                </tr>
                                                {isOpen && (
                                                    <tr key={`${s.id}-detail`} className="border-t border-gray-800/40 bg-gray-900/30">
                                                        <td colSpan={5} className="px-5 py-3">
                                                            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2">Joueurs</p>
                                                            <ul className="flex flex-col gap-1.5">
                                                                {allPlayers.map((p, i) => (
                                                                    <li key={i} className="flex items-center justify-between gap-4 text-sm">
                                                                        <span className={`flex items-center gap-2 ${p.isMe ? 'text-white font-semibold' : 'text-gray-300'}`}>
                                                                            <Avatar username={p.username} gravatarUrl={p.gravatarUrl} size="sm" />
                                                                            {p.username}{p.isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                                                                        </span>
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="text-gray-500 tabular-nums">{p.score} pts</span>
                                                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                                                p.result === 'win'
                                                                                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
                                                                                    : 'bg-red-900/30 text-red-400 border border-red-900'
                                                                            }`}>
                                                                                {p.result === 'win' ? 'Victoire' : 'Défaite'}
                                                                            </span>
                                                                        </div>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

            </main>
        </div>
    );
}
