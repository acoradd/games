import { Room } from "@colyseus/sdk";
import { colyseusClient } from "../webservices/colyseus";
import { getStoredPlayer } from "./playerService";
import type { LobbyState } from "../models/Lobby";

function getUsername(): string {
    return getStoredPlayer()?.player.username ?? "Anonyme";
}

function getToken(): string {
    return getStoredPlayer()?.token ?? "";
}

export async function createLobby(): Promise<Room<LobbyState>> {
    return colyseusClient.create<LobbyState>("lobby", {
        username: getUsername(),
        token: getToken(),
    });
}

export async function joinLobby(roomId: string): Promise<Room<LobbyState>> {
    return colyseusClient.joinById<LobbyState>(roomId, {
        username: getUsername(),
        token: getToken(),
    });
}
