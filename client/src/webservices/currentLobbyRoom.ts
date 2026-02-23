import type { Room } from "@colyseus/sdk";
import type { LobbyState } from "../models/Lobby";

let _room: Room<LobbyState> | null = null;

export function setCurrentRoom(room: Room<LobbyState>): void {
    _room = room;
}

export function getCurrentRoom(roomId: string): Room<LobbyState> | null {
    if (_room && _room.roomId === roomId) return _room;
    return null;
}

export function clearCurrentRoom(): void {
    _room = null;
}
