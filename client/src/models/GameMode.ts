export interface GameOptionDef {
    type: "range" | "select" | "toggle";
    label: string;
    default: number | string | boolean;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
}

export type GameOptionsDefs = Record<string, GameOptionDef>;
export type GameOptionsValues = Record<string, number | string | boolean>;

export interface GameMode {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    minPlayers: number;
    maxPlayers: number;
    thumbnailUrl: string | null;
    isActive: boolean;
    options: GameOptionsDefs | null;
    createdAt: string;
}
