import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredPlayer, updateStoredPlayerGravatarUrl } from '../services/playerService';
import { fetchProfile, updatePassword, updateEmail, deleteAccount } from '../services/profileService';
import { clearStoredPlayer } from '../services/playerService';
import Avatar from '../components/Avatar';
import type { Player } from '../models/Player';

export default function SettingsPage() {
    const navigate = useNavigate();
    const stored = getStoredPlayer();

    if (!stored) {
        navigate('/auth', { state: { returnTo: '/settings' } });
        return null;
    }

    const [player, setPlayer] = useState<Player | null>(null);

    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwError, setPwError] = useState<string | null>(null);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwLoading, setPwLoading] = useState(false);

    // Delete account
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Email
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [emailSuccess, setEmailSuccess] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);

    useEffect(() => {
        fetchProfile().then((p) => {
            setPlayer(p);
            setEmail(p.email ?? '');
        });
    }, []);

    async function handlePasswordSubmit(e: React.FormEvent) {
        e.preventDefault();
        setPwError(null);
        setPwSuccess(false);

        if (newPassword.length < 6) {
            setPwError('Le nouveau mot de passe doit contenir au moins 6 caractères');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPwError('Les mots de passe ne correspondent pas');
            return;
        }

        setPwLoading(true);
        try {
            await updatePassword(currentPassword, newPassword);
            setPwSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setPwError(msg ?? 'Une erreur est survenue');
        } finally {
            setPwLoading(false);
        }
    }

    async function handleDeleteAccount() {
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await deleteAccount();
            clearStoredPlayer();
            navigate('/');
        } catch {
            setDeleteError('Une erreur est survenue. Réessaie plus tard.');
            setDeleteLoading(false);
        }
    }

    async function handleEmailSubmit(e: React.FormEvent) {
        e.preventDefault();
        setEmailError(null);
        setEmailSuccess(false);

        setEmailLoading(true);
        try {
            await updateEmail(email.trim() || null);
            setEmailSuccess(true);
            // Refresh avatar
            const updated = await fetchProfile();
            setPlayer(updated);
            updateStoredPlayerGravatarUrl(updated.gravatarUrl ?? null);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setEmailError(msg ?? 'Une erreur est survenue');
        } finally {
            setEmailLoading(false);
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

                {/* Avatar / Email */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h2 className="text-base font-semibold text-white mb-1">Avatar</h2>
                    <p className="text-sm text-gray-500 mb-5">
                        Renseigne ton adresse email pour afficher ton{' '}
                        <a href="https://gravatar.com" target="_blank" rel="noopener noreferrer"
                           className="text-indigo-400 hover:text-indigo-300 underline">Gravatar</a>.
                    </p>

                    <div className="flex items-center gap-4 mb-5">
                        {player && (
                            <Avatar
                                username={player.username}
                                gravatarUrl={player.gravatarUrl}
                                size="lg"
                            />
                        )}
                        <div>
                            <p className="text-sm font-medium text-white">{player?.username}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {player?.email ? player.email : 'Aucun email renseigné'}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4 max-w-sm">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm text-gray-400">Adresse email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="toi@exemple.com"
                                className="bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                            />
                        </div>

                        {emailError && (
                            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-2.5">
                                {emailError}
                            </p>
                        )}
                        {emailSuccess && (
                            <p className="text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-xl px-4 py-2.5">
                                Avatar mis à jour.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={emailLoading}
                            className="self-start bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                        >
                            {emailLoading ? 'Mise à jour…' : 'Enregistrer'}
                        </button>
                    </form>
                </section>

                {/* Mot de passe */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h2 className="text-base font-semibold text-white mb-1">Changer le mot de passe</h2>
                    <p className="text-sm text-gray-500 mb-5">Ton mot de passe doit contenir au moins 6 caractères.</p>

                    <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4 max-w-sm">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm text-gray-400">Mot de passe actuel</label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="••••••••"
                                required
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

                        {pwError && (
                            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-2.5">
                                {pwError}
                            </p>
                        )}
                        {pwSuccess && (
                            <p className="text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-xl px-4 py-2.5">
                                Mot de passe mis à jour.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
                            className="self-start bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                        >
                            {pwLoading ? 'Mise à jour…' : 'Mettre à jour'}
                        </button>
                    </form>
                </section>

                {/* Suppression du compte */}
                <section className="bg-gray-900 border border-red-900/40 rounded-2xl p-6">
                    <h2 className="text-base font-semibold text-red-400 mb-1">Supprimer mon compte</h2>
                    <p className="text-sm text-gray-500 mb-5">
                        Cette action est irréversible. Toutes tes données (pseudo, email, historique de parties) seront définitivement supprimées.
                    </p>

                    {!deleteConfirm ? (
                        <button
                            onClick={() => setDeleteConfirm(true)}
                            className="bg-red-900/30 hover:bg-red-900/60 border border-red-800 text-red-400 hover:text-red-300 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                        >
                            Supprimer mon compte
                        </button>
                    ) : (
                        <div className="flex flex-col gap-3 max-w-sm">
                            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
                                Es-tu sûr ? Cette action ne peut pas être annulée.
                            </p>
                            {deleteError && (
                                <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-2.5">
                                    {deleteError}
                                </p>
                            )}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleDeleteAccount}
                                    disabled={deleteLoading}
                                    className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                                >
                                    {deleteLoading ? 'Suppression…' : 'Oui, supprimer'}
                                </button>
                                <button
                                    onClick={() => { setDeleteConfirm(false); setDeleteError(null); }}
                                    disabled={deleteLoading}
                                    className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}
                </section>

            </main>
        </div>
    );
}
