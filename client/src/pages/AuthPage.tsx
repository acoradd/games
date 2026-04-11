import {useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {login, register} from '../services/playerService';

type Tab = 'login' | 'register';


export default function AuthPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const locationState = location.state as { returnTo?: string; gameSlug?: string } | null;
    const returnTo = locationState?.returnTo ?? '/';
    const gameSlug = locationState?.gameSlug;

    const [tab, setTab] = useState<Tab>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (tab === 'register') {
            if (password !== passwordConfirm) {
                setError('Les mots de passe ne correspondent pas');
                return;
            }
            if (password.length < 6) {
                setError('Le mot de passe doit contenir au moins 6 caractères');
                return;
            }
        }

        setLoading(true);
        try {
            if (tab === 'login') {
                await login(username.trim(), password);
            } else {
                await register(username.trim(), password);
            }
            navigate(returnTo, {state: gameSlug ? {gameSlug} : undefined});
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(msg ?? 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    }

    function switchTab(next: Tab) {
        setTab(next);
        setError(null);
        setPassword('');
        setPasswordConfirm('');
    }

    return (
        <div className="h-dvh bg-gray-950 text-white flex">

            {/* ── Panneau gauche : formulaire ── */}
            <div className="flex flex-col justify-center flex-1 lg:flex-none lg:w-[480px] lg:shrink-0 px-8 py-12 h-full overflow-auto">
                <div className="w-full max-w-md mx-auto">

                    <div className="mb-8">
                        <button onClick={() => navigate('/')} className="flex items-center gap-2 mb-8 group">
                            <img
                                src="/favicon.png"
                                alt="home"
                                className="h-7 brightness-150 group-hover:brightness-200 group-hover:scale-110 transition-all"
                            />
                            <span
                                className="text-gray-400 text-sm group-hover:text-white transition-colors">Games</span>
                        </button>

                        <h1 className="text-2xl font-bold text-white mb-1">
                            {tab === 'login' ? 'Connexion' : 'Créer un compte'}
                        </h1>
                        <p className="text-gray-500 text-sm">
                            {tab === 'login'
                                ? 'Connecte-toi pour rejoindre ou créer une partie.'
                                : 'Choisis un pseudo et un mot de passe.'}
                        </p>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-gray-900 rounded-xl p-1 mb-6">
                        {(['login', 'register'] as Tab[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => switchTab(t)}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                    tab === t
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                {t === 'login' ? 'Connexion' : 'Inscription'}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="username" className="text-sm text-gray-400">Pseudo</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="pseudo"
                                maxLength={32}
                                required
                                autoFocus
                                autoComplete="username"
                                className="bg-gray-900 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="password" className="text-sm text-gray-400">Mot de passe</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                                className="bg-gray-900 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                            />
                        </div>

                        {tab === 'register' && (
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="password-confirm" className="text-sm text-gray-400">Confirmer le mot de passe</label>
                                <input
                                    id="password-confirm"
                                    name="password-confirm"
                                    type="password"
                                    value={passwordConfirm}
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                    className="bg-gray-900 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                                />
                            </div>
                        )}

                        {error && (
                            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !username.trim() || !password}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors mt-1"
                        >
                            {loading
                                ? 'Chargement…'
                                : tab === 'login' ? 'Se connecter' : 'Créer le compte'}
                        </button>
                    </form>
                </div>
            </div>

            {/* ── Panneau droit ── */}
            <div className="hidden lg:block relative flex-1 min-w-0 overflow-hidden">
                <img
                    src="/assets/login_right.png"
                    alt=""
                    className="w-full h-full object-cover"
                />
            </div>
        </div>
    );
}
