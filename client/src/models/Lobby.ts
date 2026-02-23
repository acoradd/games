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
    status: string;
    selectedGameSlug: string;
    gameOptionsJson: string;
    gameStateJson: string;
    players: Map<string, LobbyPlayer>;
    chatHistory: ChatMsg[];
}

export interface MemoryCard {
    id: number;
    value: number;
    isFlipped: boolean;
    isMatched: boolean;
}

export interface MemoryGameState {
    phase: "picking1" | "picking2" | "revealing" | "ended";
    currentTurnId: string;
    firstFlippedIndex: number;
    cards: MemoryCard[];
    scores: Record<string, number>;
}
