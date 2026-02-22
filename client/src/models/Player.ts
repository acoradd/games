export interface Player {
    id: number;
    username: string;
    isAnonymous: boolean;
    createdAt: string;
    lastSeenAt: string;
}

export interface StoredPlayer {
    player: Player;
    token: string;
}
