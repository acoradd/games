import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function CguPage() {
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
                <h1 className="text-lg font-bold">Conditions Générales d'Utilisation</h1>
            </header>

            <main className="flex-auto max-w-3xl mx-auto px-6 py-10 space-y-8 text-sm text-gray-300 leading-relaxed">

                <p className="text-xs text-gray-500">Dernière mise à jour : avril 2026</p>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">1. Objet</h2>
                    <p>
                        Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation du site <strong className="text-white">Accoradd Games</strong>,
                        portail de mini-jeux en ligne multijoueur édité par Thomas DA ROCHA.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">2. Accès au service</h2>
                    <p>Le service est accessible gratuitement. La création d'un compte est obligatoire pour jouer. L'éditeur se réserve le droit de modifier, suspendre ou interrompre le service à tout moment sans préavis.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">3. Âge minimum</h2>
                    <p>
                        Conformément à l'article 8 du RGPD et à la loi française, l'utilisation du service est réservée aux personnes âgées de <strong className="text-white">15 ans ou plus</strong>.
                        En dessous de cet âge, le consentement d'un titulaire de l'autorité parentale est requis.
                        En créant un compte, l'utilisateur déclare avoir au moins 15 ans ou disposer de ce consentement.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">4. Compte utilisateur</h2>
                    <p>L'utilisateur est responsable de la confidentialité de ses identifiants. Tout accès au service avec ses identifiants est réputé effectué par lui. En cas de compromission du compte, l'utilisateur doit contacter l'éditeur sans délai à <a href="mailto:contact@thomasdarocha.fr" className="text-indigo-400 hover:text-indigo-300">contact@thomasdarocha.fr</a>.</p>
                    <p className="mt-2">Pour demander la suppression de son compte, l'utilisateur peut contacter l'éditeur à la même adresse.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">5. Règles de bonne conduite</h2>
                    <p className="mb-2">En utilisant le service, l'utilisateur s'engage à :</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Ne pas tenir de propos injurieux, discriminatoires ou illicites dans le chat.</li>
                        <li>Ne pas tenter de contourner les mécanismes de sécurité du service.</li>
                        <li>Ne pas perturber volontairement le déroulement des parties pour les autres joueurs.</li>
                        <li>Ne pas usurper l'identité d'un autre utilisateur.</li>
                    </ul>
                    <p className="mt-3">Tout manquement pourra entraîner une restriction ou suppression d'accès sans notification préalable.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">6. Limitation de responsabilité</h2>
                    <p>Le service est fourni « en l'état », sans garantie de disponibilité continue. L'éditeur ne pourra être tenu responsable des interruptions de service ou dysfonctionnements liés à l'infrastructure réseau ou aux équipements de l'utilisateur.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">7. Propriété intellectuelle et open source</h2>
                    <p>Le code source d'Accoradd Games est publié sous licence <strong className="text-white">MIT</strong>. Les visuels ont été générés par Google Gemini et sont soumis aux conditions d'utilisation de ce service.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">8. Médiation de la consommation</h2>
                    <p>
                        Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, en cas de litige non résolu amiablement,
                        l'utilisateur peut recourir gratuitement au service de médiation du <strong className="text-white">Médiateur du Numérique</strong> :
                    </p>
                    <p className="mt-2">
                        <a href="https://www.mediateur-du-numerique.fr" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">www.mediateur-du-numerique.fr</a>
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">9. Modification des CGU</h2>
                    <p>Les présentes CGU peuvent être modifiées à tout moment. La date de dernière mise à jour est indiquée en haut de cette page. L'utilisation continue du service vaut acceptation des CGU en vigueur.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">10. Contact</h2>
                    <p>Pour toute question : <a href="mailto:contact@thomasdarocha.fr" className="text-indigo-400 hover:text-indigo-300">contact@thomasdarocha.fr</a></p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-white mb-3">11. Droit applicable</h2>
                    <p>Les présentes CGU sont soumises au droit français. En cas de litige, les tribunaux français seront seuls compétents.</p>
                </section>

            </main>

            <footer className="border-t border-gray-800 px-6 py-4 text-center text-xs text-gray-600">
                Accoradd Games — Licence MIT — Dernière mise à jour : avril 2026
            </footer>
        </div>
    );
}
