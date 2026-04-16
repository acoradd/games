import type { VoteConfig, VoteResult, VoteType } from './types/vote.js';
export type { VoteConfig, VoteResult, VoteType };

type BroadcastFn = (type: string, data: unknown) => void;
type ClockFn     = (fn: () => void, delay: number) => { clear(): void };
type ChatFn      = (text: string) => void;

const MAX_PARALLEL = 5;

interface ActiveVote {
    id: string;
    config: VoteConfig;
    votes: Map<string, boolean>;   // playerId → choice
    eligiblePlayerIds: string[];
    deadline: number;
    timer: { clear(): void };
    onEnd: (result: VoteResult) => void;
}

export class VoteManager {
    private actives = new Map<string, ActiveVote>();

    constructor(
        private broadcast: BroadcastFn,
        private clock: ClockFn,
        private chatFn: ChatFn,
    ) {}

    get isActive(): boolean { return this.actives.size > 0; }

    /**
     * Re-sends all active vote states to a single client (e.g. after page navigation).
     */
    resyncTo(sendFn: (type: string, data: unknown) => void): void {
        for (const { id, config, votes, eligiblePlayerIds, deadline } of this.actives.values()) {
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
                eligibleCount:  eligiblePlayerIds.length,
                yesCount,
                noCount,
            });
        }
    }

    /** Returns true if a vote of the same type (and same target) is already active. */
    hasPending(type: VoteType, targetPlayerId?: string): boolean {
        for (const { config } of this.actives.values()) {
            if (config.type === type &&
                (targetPlayerId === undefined || config.targetPlayerId === targetPlayerId)) {
                return true;
            }
        }
        return false;
    }

    /** Returns true if this initiator already has an active vote (anti-spam). */
    hasInitiatorPending(initiatorId: string): boolean {
        for (const { config } of this.actives.values()) {
            if (config.initiatorId === initiatorId) return true;
        }
        return false;
    }

    start(
        config: VoteConfig,
        eligiblePlayerIds: string[],
        onEnd: (result: VoteResult) => void,
    ): void {
        if (this.actives.size >= MAX_PARALLEL) return;
        this.startNow(config, eligiblePlayerIds, onEnd);
    }

    cast(voteId: string, playerId: string, choice: boolean): void {
        const active = this.actives.get(voteId);
        if (!active) return;
        if (!active.eligiblePlayerIds.includes(playerId)) return;
        if (active.votes.has(playerId)) return;

        active.votes.set(playerId, choice);
        const { yesCount, noCount } = this.tally(active.votes);
        this.broadcast("vote:update", { voteId, yesCount, noCount });

        if (active.votes.size >= active.eligiblePlayerIds.length) this.forceEnd(voteId);
    }

    cancel(): void {
        for (const { id, timer } of this.actives.values()) {
            timer.clear();
            this.broadcast("vote:cancel", { voteId: id });
        }
        this.actives.clear();
    }

    private startNow(
        config: VoteConfig,
        eligiblePlayerIds: string[],
        onEnd: (result: VoteResult) => void,
    ): void {
        const duration = config.durationMs ?? 30_000;
        const deadline  = Date.now() + duration;
        const id        = `${config.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const active: ActiveVote = {
            id, config,
            votes: new Map(),
            eligiblePlayerIds,
            deadline,
            timer: this.clock(() => this.forceEnd(id), duration),
            onEnd,
        };
        this.actives.set(id, active);

        this.broadcast("vote:start", {
            voteId:         id,
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
        });
    }

    private forceEnd(voteId: string): void {
        const active = this.actives.get(voteId);
        if (!active) return;
        const { id, config, votes, onEnd } = active;
        active.timer.clear();
        this.actives.delete(voteId);

        const { yesCount, noCount } = this.tally(votes);
        const total         = yesCount + noCount;
        const ratio         = total > 0 ? yesCount / total : 0;
        const eligibleCount = active.eligiblePlayerIds.length;
        const result: VoteResult = {
            type: config.type,
            targetPlayerId: config.targetPlayerId,
            yesCount, noCount, total, ratio,
            eligibleCount,
            passed: ratio > 0.5,
        };

        this.broadcast("vote:end", { voteId: id, ...result });
        this.chatFn(this.buildResultText(config, result));
        onEnd(result);
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
