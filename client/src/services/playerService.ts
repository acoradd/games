import api from "../webservices/api";
import type { Player, StoredPlayer } from "../models/Player";
import { sha256 } from "../utils/crypto";

const STORAGE_KEY = "player";

export async function register(username: string, password: string): Promise<StoredPlayer> {
    const { data } = await api.post<{ player: Player; token: string }>("/api/players/register", {
        username,
        password: await sha256(password),
    });
    const stored: StoredPlayer = { player: data.player, token: data.token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
}

export async function login(username: string, password: string): Promise<StoredPlayer> {
    const { data } = await api.post<{ player: Player; token: string }>("/api/players/login", {
        username,
        password: await sha256(password),
    });
    const stored: StoredPlayer = { player: data.player, token: data.token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
}

export function getStoredPlayer(): StoredPlayer | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const stored = JSON.parse(raw) as StoredPlayer & { player: { isAnonymous?: boolean } };
        // Purge legacy anonymous sessions
        if (stored.player.isAnonymous === true) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return stored;
    } catch {
        return null;
    }
}

export function clearStoredPlayer(): void {
    localStorage.removeItem(STORAGE_KEY);
}

export function updateStoredPlayerGravatarUrl(gravatarUrl: string | null): void {
    const stored = getStoredPlayer();
    if (!stored) return;
    stored.player.gravatarUrl = gravatarUrl;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function updateStoredPlayerDisplayName(displayName: string): void {
    const stored = getStoredPlayer();
    if (!stored) return;
    stored.player.displayName = displayName;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}
