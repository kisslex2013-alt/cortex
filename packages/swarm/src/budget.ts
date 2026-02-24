/**
 * @jarvis/swarm — Token Budget System
 *
 * Контроль бюджета токенов на уровне задачи и агента.
 * Правило: бюджет узла ≤ 30% от оставшегося бюджета задачи.
 * Token source of truth: BrainRouter.getTokensUsedToday() (при наличии).
 */

/** Interface for daily token tracking (implemented by BrainRouter) */
export interface DailyTokenSource {
    getTokensUsedToday(): number;
}

export class SwarmBudget {
    private totalBudget: number;
    private spent = 0;
    private reserved: Map<string, number> = new Map();
    private dailySource?: DailyTokenSource;

    constructor(totalBudget: number, dailySource?: DailyTokenSource) {
        this.totalBudget = totalBudget;
        this.dailySource = dailySource;
    }

    /** Get daily token usage from source of truth (BrainRouter) */
    getDailyTokensUsed(): number {
        return this.dailySource?.getTokensUsedToday() ?? this.spent;
    }

    /** Check if agent can spend tokens */
    canSpend(agentId: string, tokens: number): boolean {
        const available = this.totalBudget - this.spent - this.totalReserved();
        return tokens <= available;
    }

    /** Reserve budget for agent (≤ 30% of remaining) */
    reserve(agentId: string, requested: number): number {
        const remaining = this.totalBudget - this.spent - this.totalReserved();
        const maxAllowed = Math.floor(remaining * 0.3);
        const actual = Math.min(requested, maxAllowed);

        if (actual <= 0) return 0;
        this.reserved.set(agentId, (this.reserved.get(agentId) ?? 0) + actual);
        return actual;
    }

    /** Spend tokens (from budget or reservation) */
    spend(agentId: string, tokens: number): void {
        this.spent += tokens;
        // Reduce reservation if exists
        const reserved = this.reserved.get(agentId) ?? 0;
        if (reserved > 0) {
            this.reserved.set(agentId, Math.max(0, reserved - tokens));
        }
    }

    /** Release unused reservation */
    release(agentId: string): void {
        this.reserved.delete(agentId);
    }

    /** Get remaining budget */
    remaining(): number {
        return this.totalBudget - this.spent;
    }

    /** Is budget exhausted? */
    isExhausted(): boolean {
        return this.spent >= this.totalBudget;
    }

    /** Stats */
    stats() {
        return {
            total: this.totalBudget,
            spent: this.spent,
            reserved: this.totalReserved(),
            remaining: this.remaining(),
            utilization: Math.round((this.spent / this.totalBudget) * 100),
        };
    }

    private totalReserved(): number {
        let sum = 0;
        for (const v of this.reserved.values()) sum += v;
        return sum;
    }
}
