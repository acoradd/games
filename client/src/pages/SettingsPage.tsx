import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredPlayer } from '../services/playerService';
import { updatePassword } from '../services/profileService';

export default function SettingsPage() {
    const navigate = useNavigate();

    if (!getStoredPlayer()) {
        navigate('/auth', { state: { returnTo: '/settings' } });
        return null;
    }

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (newPassword.length < 6) {
            setError('Le nouveau mot de passe doit contenir au moins 6 caractères');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        setLoading(true);
        try {
            await updatePassword(currentPassword, newPassword);
            setSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(msg ?? 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-dvh bg-gray-950 text-white flex flex-col">
            <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
                <button onClick={() => navigate('/')}>
                    <img src="/favicon.png" alt="home"
                         className="h-8 brightness-150 hover:brightness-200 hover:scale-110 transition-all"/>
                </button>
                <span className="text-gray-700">|</span>
                <button onClick={() => navigate('/profile')} className="text-gray-500 hover:text-white text-sm transition-colors">
                    Mon profil
                </button>
                <span className="text-gray-700">/</span>
                <span className="font-bold text-white">Paramètres</span>
            </header>

            <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-10 flex flex-col gap-8">

                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h2 className="text-base font-semibold text-white mb-1">Changer le mot de passe</h2>
                    <p className="text-sm text-gray-500 mb-5">Ton mot de passe doit contenir au moins 6 caractères.</p>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm text-gray-400">Mot de passe actuel</label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                autoFocus
                                className="bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm text-gray-400">Nouveau mot de passe</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm text-gray-400">Confirmer le nouveau mot de passe</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                            />
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-2.5">
                                {error}
                            </p>
                        )}
                        {success && (
                            <p className="text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-xl px-4 py-2.5">
                                Mot de passe mis à jour.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                            className="self-start bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                        >
                            {loading ? 'Mise à jour…' : 'Mettre à jour'}
                        </button>
                    </form>
                </section>

            </main>
        </div>
    );
}
