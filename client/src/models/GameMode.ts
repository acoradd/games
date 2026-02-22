export interface GameMode {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    minPlayers: number;
    maxPlayers: number;
    thumbnailUrl: string | null;
    isActive: boolean;
    options: Record<string, unknown> | null;
    createdAt: string;
}
