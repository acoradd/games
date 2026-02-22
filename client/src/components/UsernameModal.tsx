import { useState } from "react";

interface UsernameModalProps {
    onConfirm: (username: string) => void;
    loading?: boolean;
}

export default function UsernameModal({ onConfirm, loading = false }: UsernameModalProps) {
    const [username, setUsername] = useState("");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = username.trim();
        if (trimmed) {
            onConfirm(trimmed);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm">
                <h1 className="text-2xl font-bold text-white mb-2">Bienvenue !</h1>
                <p className="text-gray-400 mb-6 text-sm">
                    Choisissez un pseudo pour commencer à jouer.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Votre pseudo"
                        maxLength={32}
                        autoFocus
                        className="bg-gray-800 border border-gray-600 text-white placeholder-gray-500 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                        type="submit"
                        disabled={!username.trim() || loading}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                        {loading ? "Connexion…" : "Jouer"}
                    </button>
                </form>
            </div>
        </div>
    );
}
