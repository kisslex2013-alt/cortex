/**
 * @jarvis/swarm — Scheduler (Lazy Spawning + Priority Queue)
 *
 * Агенты создаются только когда:
 * 1. Все dependencies выполнены
 * 2. Бюджет достаточен
 * 3. CPU < 80%
 * 4. Нет interactive task с большим приоритетом
 */

import { TaskDAG, type TaskNode } from './dag.js';
import { SwarmBudget } from './budget.js';
import { Agent } from './agent.js';
import { getRole } from './roles.js';

export interface SchedulerConfig {
    maxConcurrent: number;    // max parallel agents
    cpuThreshold: number;     // degrade if CPU > this (0-100)
    interactivePriority: number;
}

export class Scheduler {
    private dag: TaskDAG;
    private budget: SwarmBudget;
    private agents: Map<string, Agent> = new Map();
    private config: SchedulerConfig;
    private cpuUsage = 0;  // simulated, injected from outside
    private interactiveActive = false;

    constructor(dag: TaskDAG, budget: SwarmBudget, config?: Partial<SchedulerConfig>) {
        this.dag = dag;
        this.budget = budget;
        this.config = {
            maxConcurrent: config?.maxConcurrent ?? 5,
            cpuThreshold: config?.cpuThreshold ?? 80,
            interactivePriority: config?.interactivePriority ?? 100,
        };
    }

    /** Get next batch of agents to spawn (lazy) */
    getNextBatch(): TaskNode[] {
        // CPU check
        if (this.cpuUsage > 90) return []; // full degradation
        if (this.interactiveActive) return []; // interactive has priority

        const ready = this.dag.getReady();
        const running = this.getRunningCount();
        const available = this.config.maxConcurrent - running;

        if (available <= 0) return [];
        if (this.cpuUsage > this.config.cpuThreshold) {
            // Partial degradation: allow only tool agents
            return ready.filter(n => n.type === 'tool').slice(0, available);
        }

        // Priority: tool agents first (0 tokens), then by budget
        const sorted = ready.sort((a, b) => {
            // Tools first
            if (a.type === 'tool' && b.type !== 'tool') return -1;
            if (b.type === 'tool' && a.type !== 'tool') return 1;
            // Then by budget (cheaper first)
            return a.budget - b.budget;
        });

        return sorted.slice(0, available);
    }

    /** Spawn agent for a task node */
    spawnAgent(node: TaskNode): Agent | null {
        // Check budget for non-tool agents
        if (node.type !== 'tool' && !this.budget.canSpend(node.id, node.budget)) {
            return null;
        }

        const roleDef = getRole(node.role);
        if (!roleDef) return null;

        // Reserve budget
        if (node.type !== 'tool') {
            this.budget.reserve(node.id, node.budget);
        }

        const agent = new Agent({
            id: `agent_${node.id}`,
            role: roleDef,
            parentId: node.parentId,
            budgetTokens: node.budget,
        });

        this.agents.set(node.id, agent);
        this.dag.setStatus(node.id, 'running');
        return agent;
    }

    /** Complete agent, release resources */
    completeAgent(nodeId: string, result: unknown, tokensUsed: number): void {
        this.budget.spend(nodeId, tokensUsed);
        this.budget.release(nodeId);
        this.dag.setStatus(nodeId, 'done', result);
        this.agents.delete(nodeId);
    }

    /** Fail agent, retry if possible */
    failAgent(nodeId: string, error: string): boolean {
        const node = this.dag.getNode(nodeId);
        if (!node) return false;

        this.budget.release(nodeId);
        this.agents.delete(nodeId);

        if (node.retries < node.maxRetries) {
            node.retries++;
            node.status = 'pending'; // re-enter queue
            return true; // will retry
        }

        this.dag.setStatus(nodeId, 'failed', undefined, error);
        return false; // no more retries
    }

    /** Set CPU usage (injected from ResourceGovernor) */
    setCpuUsage(percent: number): void {
        this.cpuUsage = percent;
    }

    /** Set interactive mode */
    setInteractive(active: boolean): void {
        this.interactiveActive = active;
    }

    /** Should degrade to single-agent? */
    shouldDegrade(): boolean {
        return this.cpuUsage > 90;
    }

    getRunningCount(): number {
        return this.agents.size;
    }

    getAgent(nodeId: string): Agent | undefined {
        return this.agents.get(nodeId);
    }
}
