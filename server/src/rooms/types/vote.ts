export type VoteType = "word_quality" | "skip_turn" | "mute_player" | "unmute_player" | "kick_player" | "ban_player";

export interface VoteConfig {
    type: VoteType;
    question: string;
    yesLabel: string;
    noLabel: string;
    targetPlayerId?: string;
    targetUsername?: string;
    initiatorId?: string;          // playerId who triggered this vote (anti-spam)
    durationMs?: number;
    /** Custom result message. If omitted, a generic format is used. */
    resultMessage?: (result: VoteResult) => string;
}

export interface VoteResult {
    type: VoteType;
    targetPlayerId?: string;
    yesCount: number;
    noCount: number;
    total: number;
    ratio: number;
    passed: boolean;
    eligibleCount: number;
}
