import api from "../webservices/api";
import type { Player, StoredPlayer } from "../models/Player";

const STORAGE_KEY = "player";

export async function createAnonymousPlayer(username: string): Promise<StoredPlayer> {
    const { data } = await api.post<{ player: Player; token: string }>("/api/players/anonymous", {
        username,
    });
    const stored: StoredPlayer = { player: data.player, token: data.token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
}

export function getStoredPlayer(): StoredPlayer | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as StoredPlayer;
    } catch {
        return null;
    }
}

export function clearStoredPlayer(): void {
    localStorage.removeItem(STORAGE_KEY);
}
