export interface LobbyPlayer {
    id: string;
    username: string;
    isHost: boolean;
    isReady: boolean;
}

export interface ChatMsg {
    username: string;
    text: string;
    ts: number;
}

export interface LobbyState {
    hostId: string;
    isStarted: boolean;
    selectedGameSlug: string;
    gameOptionsJson: string;
    players: Map<string, LobbyPlayer>;
    chatHistory: ChatMsg[];
}
