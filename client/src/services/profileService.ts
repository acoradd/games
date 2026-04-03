import api from "../webservices/api";
import { sha256 } from "../utils/crypto";
import type { Player } from "../models/Player";

export interface CoPlayer {
    username: string;
    result: "win" | "loss";
    score: number;
}

export interface GameSession {
    id: number;
    gameId: string;
    gameModeSlug: string;
    result: "win" | "loss";
    score: number;
    playedAt: string;
    coPlayers: CoPlayer[];
}

export async function fetchProfile(): Promise<Player> {
    const { data } = await api.get<Player>("/api/profile/me");
    return data;
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put("/api/profile/me/password", {
        currentPassword: await sha256(currentPassword),
        newPassword: await sha256(newPassword),
    });
}

export async function fetchGameSessions(): Promise<GameSession[]> {
    const { data } = await api.get<GameSession[]>("/api/profile/me/sessions");
    return data;
}
