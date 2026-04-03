export interface Player {
    id: number;
    username: string;
    createdAt: string;
    lastSeenAt: string;
}

export interface StoredPlayer {
    player: Player;
    token: string;
}
