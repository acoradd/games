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
