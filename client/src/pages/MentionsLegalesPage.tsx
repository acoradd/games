import {ArrowLeft} from 'lucide-react';
import {useNavigate} from 'react-router-dom';

export default function MentionsLegalesPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-dvh bg-gray-950 text-white flex flex-col">
            <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
                <button
                    onClick={() => navigate('/')}
                    className="text-gray-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold">Mentions légales</h1>
            </header>

            <main className="flex-auto max-w-3xl mx-auto px-6 py-10 space-y-8 text-sm text-gray-300 leading-relaxed">

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Éditeur du site</h2>
                    <p>Thomas DA ROCHA</p>
                    <p>69360 Saint-Symphorien-d'Ozon, France</p>
                    <p>Email : <a href="mailto:contact@thomasdarocha.fr" className="text-indigo-400 hover:text-indigo-300">contact@thomasdarocha.fr</a></p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Hébergement</h2>
                    <p>Le site est hébergé sur un serveur privé géré par l'éditeur.</p>
                    <p className="mt-2">Le trafic transite via le réseau de <strong className="text-white">Cloudflare, Inc.</strong></p>
                    <p>101 Townsend St, San Francisco, CA 94107, États-Unis</p>
                    <p><a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">www.cloudflare.com</a></p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Licence open source</h2>
                    <p>
                        Le code source d'AccoGames est publié sous licence <strong className="text-white">MIT</strong>.
                        Vous êtes libre de l'utiliser, le modifier et le redistribuer selon les termes de cette licence.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Visuels et illustrations</h2>
                    <p>
                        Les visuels présents sur le site ont été générés par <strong className="text-white">Google Gemini</strong> (intelligence artificielle générative).
                        Leur utilisation est soumise aux <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">conditions d'utilisation de Google</a>.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Droit applicable</h2>
                    <p>Le présent site est soumis au droit français. Tout litige sera soumis aux tribunaux compétents de France.</p>
                </section>

            </main>

            <footer className="border-t border-gray-800 px-6 py-4 text-center text-xs text-gray-600">
                AccoGames — Licence MIT — Dernière mise à jour : avril 2026
            </footer>
        </div>
    );
}
