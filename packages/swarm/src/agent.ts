/**
 * @jarvis/swarm — Agent base class + lifecycle
 *
 * Lifecycle: create → policy check → run → suspend → resume → merge → destroy
 */

import type { RoleDefinition } from './roles.js';

export type AgentStatus = 'idle' | 'running' | 'suspended' | 'done' | 'failed';

export interface AgentConfig {
    id: string;
    role: RoleDefinition;
    parentId?: string;
    budgetTokens: number;
}

export interface AgentExecuteResult {
    output: unknown;
    tokensUsed: number;
    error?: string;
}

export class Agent {
    readonly id: string;
    readonly role: RoleDefinition;
    readonly parentId?: string;

    private status: AgentStatus = 'idle';
    private budgetTokens: number;
    private tokensUsed = 0;
    private createdAt: number;
    private _result?: AgentExecuteResult;

    constructor(config: AgentConfig) {
        this.id = config.id;
        this.role = config.role;
        this.parentId = config.parentId;
        this.budgetTokens = config.budgetTokens;
        this.createdAt = Date.now();
    }

    /** Execute the agent's task */
    async execute(
        input: string,
        executor: (prompt: string) => Promise<AgentExecuteResult>
    ): Promise<AgentExecuteResult> {
        if (this.status === 'running') {
            throw new Error(`Agent "${this.id}" already running`);
        }

        this.status = 'running';

        try {
            const result = await executor(input);

            // Check budget
            this.tokensUsed += result.tokensUsed;
            if (this.tokensUsed > this.budgetTokens && this.role.type !== 'tool') {
                this.status = 'failed';
                return { output: null, tokensUsed: this.tokensUsed, error: 'Budget exceeded' };
            }

            this._result = result;
            this.status = result.error ? 'failed' : 'done';
            return result;
        } catch (err) {
            this.status = 'failed';
            const error = err instanceof Error ? err.message : String(err);
            return { output: null, tokensUsed: 0, error };
        }
    }

    suspend(): void {
        if (this.status === 'running') this.status = 'suspended';
    }

    resume(): void {
        if (this.status === 'suspended') this.status = 'idle';
    }

    getStatus(): AgentStatus {
        return this.status;
    }

    getResult(): AgentExecuteResult | undefined {
        return this._result;
    }

    getTokensUsed(): number {
        return this.tokensUsed;
    }

    getRemainingBudget(): number {
        return Math.max(0, this.budgetTokens - this.tokensUsed);
    }

    info() {
        return {
            id: this.id,
            role: this.role.name,
            type: this.role.type,
            status: this.status,
            tokensUsed: this.tokensUsed,
            budget: this.budgetTokens,
            parentId: this.parentId,
            ageMs: Date.now() - this.createdAt,
        };
    }
}
