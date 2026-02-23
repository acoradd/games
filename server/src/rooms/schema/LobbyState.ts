import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class ChatMessage extends Schema {
    @type("string") username: string = "";
    @type("string") text: string = "";
    @type("number") timestamp: number = 0;
}

export class LobbyPlayer extends Schema {
    @type("string") id: string = "";
    @type("string") username: string = "";
    @type("boolean") isHost: boolean = false;
    @type("boolean") isReady: boolean = false;
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
