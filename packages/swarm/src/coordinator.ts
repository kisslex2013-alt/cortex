/**
 * @jarvis/swarm — Coordinator
 *
 * Главный агент: принимает задачу, декомпозирует, управляет swarm.
 */

import { TaskDAG } from './dag.js';
import { SwarmBudget } from './budget.js';
import { SharedContext } from './shared-context.js';
import { Scheduler } from './scheduler.js';

export interface CoordinatorConfig {
    maxDepth?: number;
    maxNodes?: number;
    maxConcurrent?: number;
    cpuThreshold?: number;
    totalBudget?: number;
    /** B2: policy guard — assess() вызывается перед spawn. (policy → swarm) */
    policyGuard?: (action: string, target: string) => { approved: boolean; reason: string };
    /** B1: карта проекта (memory → shared context) */
    codebaseMapSummary?: string;
}

export interface SwarmResult {
    success: boolean;
    results: Array<{ nodeId: string; role: string; output: unknown }>;
    tokensUsed: number;
    nodesCompleted: number;
    nodesFailed: number;
    nodesCancelled: number;
}

export class Coordinator {
    readonly dag: TaskDAG;
    readonly budget: SwarmBudget;
    readonly context: SharedContext;
    readonly scheduler: Scheduler;

    private policyGuard?: (action: string, target: string) => { approved: boolean; reason: string };

    constructor(taskDescription: string, config?: CoordinatorConfig) {
        this.dag = new TaskDAG(config?.maxDepth ?? 3, config?.maxNodes ?? 10);
        this.budget = new SwarmBudget(config?.totalBudget ?? 10000);
        this.context = new SharedContext(taskDescription);
        this.scheduler = new Scheduler(this.dag, this.budget, {
            maxConcurrent: config?.maxConcurrent ?? 5,
            cpuThreshold: config?.cpuThreshold ?? 80,
        });
        this.policyGuard = config?.policyGuard;
        // B1: inject codebase map
        if (config?.codebaseMapSummary) {
            this.context.injectCodebaseMap(config.codebaseMapSummary);
        }
    }

    /** Run the full swarm lifecycle */
    async run(
        executor: (nodeId: string, role: string, input: string) => Promise<{ output: unknown; tokensUsed: number }>
    ): Promise<SwarmResult> {
        const maxIterations = 50; // safety: prevent infinite loop
        let iterations = 0;

        while (!this.dag.isComplete() && iterations < maxIterations) {
            iterations++;

            // Check budget
            if (this.budget.isExhausted()) break;

            // Check degradation
            if (this.scheduler.shouldDegrade()) break;

            // Get next batch
            const batch = this.scheduler.getNextBatch();
            if (batch.length === 0) {
                // Check for deadlock: no running agents and nothing ready
                if (this.scheduler.getRunningCount() === 0) break;
                continue;
            }

            // Execute batch (parallel for independent nodes)
            const promises = batch.map(async (node) => {
                // B2: policy guard
                if (this.policyGuard) {
                    const decision = this.policyGuard('spawn_agent', node.role);
                    if (!decision.approved) {
                        this.scheduler.failAgent(node.id, `Policy denied: ${decision.reason}`);
                        return;
                    }
                }

                const agent = this.scheduler.spawnAgent(node);
                if (!agent) {
                    this.scheduler.failAgent(node.id, 'Failed to spawn agent');
                    return;
                }

                const summary = this.context.getSummaryFor(node.id);

                try {
                    const result = await executor(node.id, node.role, summary);
                    this.context.addResult(node.id, node.role, result.output, result.tokensUsed);
                    this.scheduler.completeAgent(node.id, result.output, result.tokensUsed);
                } catch (err) {
                    const error = err instanceof Error ? err.message : String(err);
                    const retried = this.scheduler.failAgent(node.id, error);
                    if (!retried) {
                        // Collapse descendants
                        this.dag.collapse(node.id);
                    }
                }
            });

            await Promise.all(promises);
        }

        return this.getResult();
    }

    /** Get final result */
    getResult(): SwarmResult {
        const stats = this.dag.stats();
        const results = this.context.getAllResults().map(r => ({
            nodeId: r.agentId,
            role: r.role,
            output: r.output,
        }));

        return {
            success: stats.failed === 0,
            results,
            tokensUsed: this.budget.stats().spent,
            nodesCompleted: stats.done,
            nodesFailed: stats.failed,
            nodesCancelled: stats.cancelled,
        };
    }

    /** Stats */
    stats() {
        return {
            dag: this.dag.stats(),
            budget: this.budget.stats(),
            context: this.context.stats(),
        };
    }
}

/** Factory */
export function createSwarm(taskDescription: string, config?: CoordinatorConfig): Coordinator {
    return new Coordinator(taskDescription, config);
}
