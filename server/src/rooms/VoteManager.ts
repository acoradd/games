import type { VoteConfig, VoteResult, VoteType } from './types/vote.js';
export type { VoteConfig, VoteResult, VoteType };

type BroadcastFn = (type: string, data: unknown) => void;
type ClockFn     = (fn: () => void, delay: number) => { clear(): void };
type ChatFn      = (text: string) => void;

const MAX_QUEUE_SIZE = 5;

interface ActiveVote {
    id: string;
    config: VoteConfig;
    votes: Map<string, boolean>;   // playerId → choice
    eligiblePlayerIds: string[];
    deadline: number;
    timer: { clear(): void };
    onEnd: (result: VoteResult) => void;
}

interface QueuedVote {
    config: VoteConfig;
    eligiblePlayerIds: string[];
    onEnd: (result: VoteResult) => void;
}

export class VoteManager {
    private active: ActiveVote | null = null;
    private queue: QueuedVote[] = [];

    constructor(
        private broadcast: BroadcastFn,
        private clock: ClockFn,
        private chatFn: ChatFn,
    ) {}

    get isActive(): boolean { return this.active !== null; }
    get queueLength(): number { return this.queue.length; }

    /**
     * Re-sends the current vote state to a single client (e.g. after page navigation).
     * No-op if no vote is active.
     */
    resyncTo(sendFn: (type: string, data: unknown) => void): void {
        if (!this.active) return;
        const { id, config, votes, deadline } = this.active;
        const { yesCount, noCount } = this.tally(votes);
        sendFn("vote:start", {
            voteId:         id,
            type:           config.type,
            question:       config.question,
            yesLabel:       config.yesLabel,
            noLabel:        config.noLabel,
            targetPlayerId: config.targetPlayerId,
            targetUsername: config.targetUsername,
            deadline,
            eligibleCount:  this.active.eligiblePlayerIds.length,
            yesCount,
            noCount,
            queueLength:    this.queue.length,
        });
    }

    /** Returns true if a vote of the same type (and same target, if provided) is already active or queued. */
    hasPending(type: VoteType, targetPlayerId?: string): boolean {
        const matches = (config: VoteConfig) =>
            config.type === type &&
            (targetPlayerId === undefined || config.targetPlayerId === targetPlayerId);
        if (this.active && matches(this.active.config)) return true;
        return this.queue.some(q => matches(q.config));
    }

    start(
        config: VoteConfig,
        eligiblePlayerIds: string[],
        onEnd: (result: VoteResult) => void,
    ): void {
        if (this.active) {
            if (this.queue.length >= MAX_QUEUE_SIZE) return;  // silently drop if queue full
            this.queue.push({ config, eligiblePlayerIds, onEnd });
            this.broadcast("vote:queued", { queueLength: this.queue.length });
            return;
        }
        this.startNow(config, eligiblePlayerIds, onEnd);
    }

    cast(playerId: string, choice: boolean): void {
        if (!this.active) return;
        if (!this.active.eligiblePlayerIds.includes(playerId)) return;
        if (this.active.votes.has(playerId)) return;

        this.active.votes.set(playerId, choice);
        const { yesCount, noCount } = this.tally(this.active.votes);
        this.broadcast("vote:update", { voteId: this.active.id, yesCount, noCount });

        if (this.active.votes.size >= this.active.eligiblePlayerIds.length) this.forceEnd();
    }

    cancel(): void {
        if (this.active) {
            this.active.timer.clear();
            this.broadcast("vote:cancel", { voteId: this.active.id });
            this.active = null;
        }
        this.queue = [];
    }

    private startNow(
        config: VoteConfig,
        eligiblePlayerIds: string[],
        onEnd: (result: VoteResult) => void,
    ): void {
        const duration = config.durationMs ?? 30_000;
        const deadline  = Date.now() + duration;
        const id        = `${config.type}_${Date.now()}`;

        this.active = {
            id, config,
            votes: new Map(),
            eligiblePlayerIds,
            deadline,
            timer: this.clock(() => this.forceEnd(), duration),
            onEnd,
        };

        this.broadcast("vote:start", {
            voteId: id,
            type:           config.type,
            question:       config.question,
            yesLabel:       config.yesLabel,
            noLabel:        config.noLabel,
            targetPlayerId: config.targetPlayerId,
            targetUsername: config.targetUsername,
            deadline,
            eligibleCount:  eligiblePlayerIds.length,
            yesCount: 0,
            noCount:  0,
            queueLength:    this.queue.length,
        });
    }

    private forceEnd(): void {
        if (!this.active) return;
        const { id, config, votes, onEnd } = this.active;
        this.active.timer.clear();
        this.active = null;

        const { yesCount, noCount } = this.tally(votes);
        const total  = yesCount + noCount;
        const ratio  = total > 0 ? yesCount / total : 0;
        const result: VoteResult = {
            type: config.type,
            targetPlayerId: config.targetPlayerId,
            yesCount, noCount, total, ratio,
            passed: ratio > 0.5,
        };

        this.broadcast("vote:end", { voteId: id, ...result });
        this.chatFn(this.buildResultText(config, result));
        onEnd(result);

        // Start next queued vote
        if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            this.startNow(next.config, next.eligiblePlayerIds, next.onEnd);
        }
    }

    private buildResultText(config: VoteConfig, result: VoteResult): string {
        if (config.resultMessage) return config.resultMessage(result);
        const { yesCount, noCount } = result;
        const outcomeLabel = yesCount > noCount
            ? config.yesLabel
            : noCount > yesCount
                ? config.noLabel
                : "Égalité";
        return `[Vote] ${config.question} → ${outcomeLabel} (${yesCount} oui · ${noCount} non)`;
    }

    private tally(votes: Map<string, boolean>): { yesCount: number; noCount: number } {
        let yesCount = 0, noCount = 0;
        for (const v of votes.values()) v ? yesCount++ : noCount++;
        return { yesCount, noCount };
    }
}
