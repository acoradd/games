import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class ChatMessage extends Schema {
    @type("string") username: string = "";
    @type("string") text: string = "";
    @type("number") timestamp: number = 0;
}

export class LobbyPlayer extends Schema {
    @type("string") id: string = "";          // DB playerId (stable string)
    @type("string") sessionId: string = "";   // current/last Colyseus session
    @type("string") username: string = "";
    @type("string") gravatarUrl: string = "";
    @type("boolean") isHost: boolean = false;
    @type("boolean") isReady: boolean = false;
    @type("boolean") isConnected: boolean = true;
    @type("boolean") isEliminated: boolean = false;
    @type("boolean") isSpectator: boolean = false;
    @type("boolean") isMuted: boolean = false;
    @type("boolean") wantsToPlay: boolean = false;
}

export class LobbyState extends Schema {
    @type("string") hostId: string = "";
    @type("boolean") isStarted: boolean = false;
    @type("string") status: string = "lobby";
    @type("string") selectedGameSlug: string = "";
    @type("string") gameOptionsJson: string = "{}";
    @type("string") gameStateJson: string = "{}";
    @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
    @type([ChatMessage]) chatHistory = new ArraySchema<ChatMessage>();
}
