export interface Player {
    id: number;
    username: string;
    displayName: string;
    email?: string | null;
    gravatarUrl?: string | null;
    colorblindMode?: boolean;
    createdAt: string;
    lastSeenAt: string;
}

export interface StoredPlayer {
    player: Player;
    token: string;
}
