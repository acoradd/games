# 🎮 Portail de Mini-Jeux Privés (Multiplayer)

## 🏗️ Architecture & Stack
Ce projet est un monorepo structuré pour le développement de jeux multijoueurs autoritaires :
- **/server** : Moteur de jeu et logique temps réel avec **Colyseus.js** (TypeScript).
- **/client** : Interface utilisateur et rendu avec **Phaser 3** + **React/Tailwind** (Vite + TS).
- **Base de données** : **PostgreSQL** gérée via **Prisma ORM** pour le stockage des modes de jeux et configurations.

## 🚀 Fonctionnalités Clés
- **Lobby Dynamique** : Les modes de jeux et leurs règles sont chargés depuis PostgreSQL.
- **Rooms Privées** : Création de parties avec **Code Unique** (4-6 caractères).
- **Système d'Invitation** : Génération de liens directs (`/join/[ROOM_ID]`) avec redirection automatique.
- **Lobby d'Attente** :
    - Chat intégré (Colyseus messages).
    - Système de **Ready Check** (Tous les joueurs doivent être prêts pour lancer).
    - **Panneau Hôte** : Seul le créateur peut modifier les options (chargées dynamiquement selon le jeu).
- **Migration d'Hôte** : Si l'hôte quitte, la couronne est transférée au joueur suivant.

## 📂 Organisation des dossiers
- `server/src/rooms` : Logique de salle (Lobby, GameRoom).
- `server/src/schema` : États synchronisés (Player, GameState).
- `client/src/scenes` : Moteurs de rendu Phaser.
- `client/src/components` : UI du portail (Lobby, Chat, Menu Options) en React.
- `examples/gamemode` : **RÉFÉRENCE** - Anciennes versions WebRTC des jeux (Snake, Tron, etc.) à migrer vers Colyseus.

## 🤖 Instructions pour Claude Code
Lors de la création ou migration d'un mode de jeu :

1. **DB Setup** : Vérifier ou ajouter le mode de jeu dans le schéma Prisma `GameMode`.
2. **Logic (Server)** :
    - Extraire la logique de mouvement/collision des fichiers dans `examples/gamemode`.
    - L'implémenter dans une Room Colyseus (Logique autoritaire).
3. **Sync (State)** : Définir les variables synchronisées (ex: positions des segments du serpent) dans le Schema.
4. **Visual (Client)** :
    - Créer la scène Phaser correspondante.
    - Lier les entrées clavier aux messages `room.send()`.
    - Utiliser les "triggers" du State pour les animations (ex: explosion, score).

## 🛠️ Commandes
- **Installation** : `npm install` (racine, client, server)
- **Database** : `npx prisma migrate dev` (dans /server)
- **Dev** : `npm run dev` (utilise concurrently pour lancer client + server)
