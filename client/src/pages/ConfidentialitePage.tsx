import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function ConfidentialitePage() {
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
                <h1 className="text-lg font-bold">Politique de confidentialité</h1>
            </header>

            <main className="flex-auto max-w-3xl mx-auto px-6 py-10 space-y-8 text-sm text-gray-300 leading-relaxed">

                <p className="text-xs text-gray-500">Dernière mise à jour : avril 2026</p>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Responsable du traitement</h2>
                    <p>Thomas DA ROCHA — <a href="mailto:contact@thomasdarocha.fr" className="text-indigo-400 hover:text-indigo-300">contact@thomasdarocha.fr</a></p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Données collectées</h2>
                    <p className="mb-2">La création d'un compte est nécessaire pour accéder au service. Les données suivantes sont collectées et stockées en base de données :</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong className="text-white">Pseudo</strong> — choisi librement lors de l'inscription.</li>
                        <li><strong className="text-white">Adresse email</strong> — utilisée uniquement pour récupérer l'avatar Gravatar associé au compte. Elle n'est pas utilisée pour l'authentification ni pour vous contacter.</li>
                        <li><strong className="text-white">Mot de passe</strong> — haché côté client puis côté serveur avant stockage. Le mot de passe en clair n'est jamais conservé.</li>
                        <li><strong className="text-white">Résultats de parties</strong> — présence dans une partie, victoires et défaites.</li>
                    </ul>
                    <p className="mt-3">Les adresses IP ne sont pas enregistrées. Aucun cookie de traçage n'est utilisé.</p>
                    <p className="mt-2">L'adresse email est transmise sous forme hashée (MD5) au service <strong className="text-white">Gravatar</strong> (Automattic, Inc.) pour récupérer l'avatar associé. Consultez la <a href="https://automattic.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">politique de confidentialité d'Automattic</a> pour plus d'informations.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Finalité et base légale</h2>
                    <p>Les données sont traitées dans le seul but de faire fonctionner le service de jeu en ligne (base légale : exécution du contrat). Aucune donnée n'est vendue ni transmise à des tiers, à l'exception du hash MD5 de l'email transmis à Gravatar.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Durée de conservation</h2>
                    <p>Les données sont conservées tant que le compte est actif. En cas de demande de suppression, l'ensemble des données associées au compte est effacé dans un délai de 30 jours.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Cookies et stockage local</h2>
                    <p>Le site n'utilise pas de cookies de traçage. Les informations de session sont stockées dans le <code className="bg-gray-800 px-1 rounded">localStorage</code> du navigateur, strictement nécessaires au fonctionnement du service.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">Vos droits (RGPD)</h2>
                    <p className="mb-2">Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Droit d'accès à vos données</li>
                        <li>Droit de rectification</li>
                        <li>Droit à l'effacement (« droit à l'oubli »)</li>
                        <li>Droit à la portabilité</li>
                        <li>Droit d'opposition au traitement</li>
                    </ul>
                    <p className="mt-3">
                        Pour exercer ces droits ou demander la suppression de votre compte, contactez :&nbsp;
                        <a href="mailto:contact@thomasdarocha.fr" className="text-indigo-400 hover:text-indigo-300">contact@thomasdarocha.fr</a>
                    </p>
                    <p className="mt-2">En cas de litige, vous pouvez introduire une réclamation auprès de la <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">CNIL</a>.</p>
                </section>

            </main>

            <footer className="border-t border-gray-800 px-6 py-4 text-center text-xs text-gray-600">
                Accoradd Games — Licence MIT — Dernière mise à jour : avril 2026
            </footer>
        </div>
    );
}
