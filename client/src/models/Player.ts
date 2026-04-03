export interface Player {
    id: number;
    username: string;
    email?: string | null;
    gravatarUrl?: string | null;
    createdAt: string;
    lastSeenAt: string;
}

export interface StoredPlayer {
    player: Player;
    token: string;
}
