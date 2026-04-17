export interface ChangelogEntry {
    date: string;
    label: string;
    type: 'feat' | 'fix' | 'chore';
}

export interface ChangelogVersion {
    version: string;
    date: string;
    entries: ChangelogEntry[];
}

export const changelog: ChangelogVersion[] = [
    {
        version: '0.11',
        date: '17/04/2026',
        entries: [
            { date: '17/04/2026', type: 'feat', label: 'Vote pour expulser ou bannir un joueur pendant une partie (kick/ban visible au survol dans le scoreboard)' },
            { date: '17/04/2026', type: 'feat', label: 'L\'hôte peut expulser ou bannir directement un joueur depuis le lobby' },
            { date: '17/04/2026', type: 'feat', label: 'Le ban est persistant pour toute la room : un joueur banni ne peut plus se reconnecter' },
            { date: '17/04/2026', type: 'feat', label: 'L\'hôte ne peut pas être ciblé par un vote kick/ban' },
            { date: '17/04/2026', type: 'fix', label: 'Expulsion/ban pendant une partie : toutes les données du joueur sont supprimées du scoreboard immédiatement' },
        ],
    },
    {
        version: '0.10',
        date: '16/04/2026',
        entries: [
            { date: '16/04/2026', type: 'feat', label: 'Choix du statut spectateur dès le lobby, avec section dédiée dans la liste des joueurs' },
            { date: '16/04/2026', type: 'feat', label: 'Les spectateurs peuvent s\'inscrire pour jouer à partir de la prochaine manche via un bouton dédié' },
            { date: '16/04/2026', type: 'fix', label: 'Les spectateurs ne rejoignent plus automatiquement la partie au début d\'une nouvelle manche' },
            { date: '16/04/2026', type: 'fix', label: 'Retour au lobby : les spectateurs restent spectateurs, les joueurs éliminés redeviennent joueurs' },
            { date: '16/04/2026', type: 'feat', label: 'Votes en parallèle : plusieurs votes peuvent se dérouler simultanément' },
            { date: '16/04/2026', type: 'feat', label: 'Anti-spam : un joueur ne peut initier qu\'un vote à la fois' },
            { date: '16/04/2026', type: 'feat', label: 'Les votes disparaissent dès qu\'on a voté (plus de gêne visuelle)' },
            { date: '16/04/2026', type: 'feat', label: 'Votes déplacés en overlay flottant, hors de la sidebar (lobby et jeu)' },
            { date: '16/04/2026', type: 'feat', label: 'Boutons hôte (terminer manche/partie) déplacés dans le header du jeu' },
            { date: '16/04/2026', type: 'fix', label: 'Motus : un mot ne peut être signalé comme inapproprié que si la majorité absolue des joueurs vote "Non"' },
            { date: '16/04/2026', type: 'feat', label: 'Notifications système quand c\'est ton tour (Memory, Motus coop), activables depuis les paramètres' },
            { date: '16/04/2026', type: 'feat', label: 'Mode daltonien pour Motus : couleurs bleu/orange à la place de vert/jaune, configurable dans les paramètres' },
        ],
    },
    {
        version: '0.9',
        date: '15/04/2026',
        entries: [
            { date: '15/04/2026', type: 'feat', label: 'Possibilité de basculer entre joueur et spectateur en cours de partie' },
            { date: '15/04/2026', type: 'feat', label: 'Système de votes dans le lobby : muter/démuter un joueur, passer son tour, valider un mot' },
            { date: '15/04/2026', type: 'fix', label: 'Motus coop : les joueurs déconnectés et spectateurs sont correctement exclus du calcul du premier tour' },
            { date: '15/04/2026', type: 'feat', label: 'Pseudo d\'affichage modifiable depuis les paramètres (distinct de l\'identifiant de connexion)' },
        ],
    },
    {
        version: '0.8',
        date: '11/04/2026',
        entries: [
            { date: '11/04/2026', type: 'fix', label: 'Meilleure gestion des reconnexions: basée sur l\'identifiant du joueur et plus sur ça session' },
            { date: '11/04/2026', type: 'feat', label: 'Reconnexion en cours de partie sur Motus : le joueur retrouve ses propositions et reprend sa place' },
            { date: '11/04/2026', type: 'feat', label: 'Motus coop : ordre de passage fixe sur toute la partie, rotation au joueur suivant à chaque nouvelle manche' },
            { date: '11/04/2026', type: 'feat', label: 'Bouton "Déclarer forfait" pour quitter une partie en cours (avec confirmation)' },
            { date: '11/04/2026', type: 'feat', label: 'Bouton "Terminer la partie" pour l\'hôte, disponible à tout moment (avec confirmation)' },
            { date: '11/04/2026', type: 'feat', label: 'Couronne de l\'hôte et indicateur de connexion visibles dans les scores en jeu' },
            { date: '11/04/2026', type: 'fix', label: 'La manche se termine automatiquement si tous les joueurs connectés ont fini (Motus)' },
            { date: '11/04/2026', type: 'fix', label: 'Le rôle d\'hôte est réattribué immédiatement à la déconnexion, même sur les jeux autorisant la reconnexion' },
            { date: '11/04/2026', type: 'fix', label: 'Motus VS : clavier plus lisible avec meilleure distinction entre lettres absentes et lettres non testées' },
        ],
    },
    {
        version: '0.7',
        date: '07/04/2026',
        entries: [
            { date: '07/04/2026', type: 'feat', label: 'Lancer directement un jeu depuis la page d\'accueil sans passer par la sélection du lobby' },
            { date: '07/04/2026', type: 'feat', label: 'Rejoindre un lobby depuis un nouvel onglet déconnecte automatiquement l\'ancienne session' },
            { date: '07/04/2026', type: 'fix', label: 'Page d\'erreur de connexion au lobby améliorée avec bouton pour créer un nouveau lobby' },
        ],
    },
    {
        version: '0.6',
        date: '03/04/2026',
        entries: [
            { date: '03/04/2026', type: 'feat', label: 'Système de comptes persistants avec mot de passe (fin des joueurs anonymes)' },
            { date: '03/04/2026', type: 'feat', label: 'Page de profil avec historique des parties et détail des scores par joueur' },
            { date: '03/04/2026', type: 'feat', label: 'Page paramètres : changement de mot de passe et email pour Gravatar' },
            { date: '03/04/2026', type: 'feat', label: 'Avatars Gravatar affichés dans le lobby, le chat, les scoreboards et l\'historique' },
            { date: '03/04/2026', type: 'feat', label: 'L\'hôte peut expulser un joueur du lobby ou en reconnexion pendant la partie' },
            { date: '03/04/2026', type: 'feat', label: 'L\'hôte peut forcer la fin d\'une manche en mode coop (Motus)' },
        ],
    },
    {
        version: '0.5',
        date: '26/02/2026',
        entries: [
            { date: '20/03/2026', type: 'feat', label: 'Nouvelles illustrations pour les modes de jeux' },
            { date: '17/03/2026', type: 'feat', label: 'Ajout du mode coop sur Motus avec un ordre des joueurs mélangé à chaque manche' },
            { date: '27/02/2026', type: 'feat', label: 'QR code pour rejoindre une partie' },
        ],
    },
    {
        version: '0.4',
        date: '24/02/2026',
        entries: [
            { date: '25/02/2026', type: 'feat', label: 'Implémentation d\'un nouveau mode de jeu : Motus' },
            { date: '25/02/2026', type: 'feat', label: 'Mise en place de protection contre la triche' }
        ],
    },
    {
        version: '0.3',
        date: '23/02/2026',
        entries: [
            { date: '22/02/2026', type: 'feat', label: 'Implémentation de nouveaux modes de jeu : Tron et Bomberman' },
            { date: '22/02/2026', type: 'chore', label: 'Mise en place du système de manche' },
        ],
    },
    {
        version: '0.2',
        date: '23/02/2026',
        entries: [
            { date: '23/02/2026', type: 'chore', label: 'Responsive design sur toutes les pages' },
            { date: '23/02/2026', type: 'feat', label: 'Chat en jeu' },
            { date: '23/02/2026', type: 'feat', label: 'Reconnexion automatique après perte de connexion' },
            { date: '23/02/2026', type: 'fix', label: 'Corrections de diverses bugs lié à l\'ouverture de plusieurs onglets' },
        ],
    },
    {
        version: '0.1',
        date: '22/02/2026',
        entries: [
            { date: '22/02/2026', type: 'feat', label: 'Mise en place de la page d\'accueil' },
            { date: '22/02/2026', type: 'feat', label: 'Mise en place du système de lobby' },
            { date: '22/02/2026', type: 'feat', label: 'Mise en place du système de mode de jeu' },
            { date: '22/02/2026', type: 'feat', label: 'Implémentation du premier mode de jeu : Memory' },
        ],
    },
];
