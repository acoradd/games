import api from "../webservices/api";
import type { GameMode } from "../models/GameMode";

export async function getGameModes(): Promise<GameMode[]> {
    const { data } = await api.get<GameMode[]>("/api/game-modes");
    return data;
}

export async function getGameMode(slug: string): Promise<GameMode> {
    const { data } = await api.get<GameMode>(`/api/game-modes/${slug}`);
    return data;
}
