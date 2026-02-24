/**
 * @jarvis/swarm — Task DAG (Directed Acyclic Graph)
 *
 * Декомпозиция задач в граф с зависимостями.
 * Поддерживает: topological sort, validation, collapse, max depth.
 */

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
export type AgentType = 'llm' | 'hybrid' | 'tool';

export interface TaskNode {
    id: string;
    role: string;
    type: AgentType;
    description: string;
    dependencies: string[];
    status: TaskStatus;
    budget: number;          // max tokens for this node
    result?: unknown;
    error?: string;
    retries: number;
    maxRetries: number;
    depth: number;           // nesting level (0 = root)
    parentId?: string;
}

export class TaskDAG {
    private nodes: Map<string, TaskNode> = new Map();
    private maxDepth: number;
    private maxNodes: number;

    constructor(maxDepth = 3, maxNodes = 10) {
        this.maxDepth = maxDepth;
        this.maxNodes = maxNodes;
    }

    /** Add a task node */
    addNode(node: Omit<TaskNode, 'status' | 'retries' | 'depth'> & { depth?: number }): TaskNode {
        if (this.nodes.size >= this.maxNodes) {
            throw new Error(`Max nodes (${this.maxNodes}) exceeded`);
        }

        const depth = node.depth ?? 0;
        if (depth >= this.maxDepth) {
            throw new Error(`Max depth (${this.maxDepth}) exceeded at node "${node.id}"`);
        }

        // Validate dependencies exist
        for (const dep of node.dependencies) {
            if (!this.nodes.has(dep)) {
                throw new Error(`Dependency "${dep}" not found for node "${node.id}"`);
            }
        }

        const taskNode: TaskNode = {
            ...node,
            status: 'pending',
            retries: 0,
            maxRetries: node.maxRetries ?? 2,
            depth,
        };

        this.nodes.set(node.id, taskNode);

        // Validate no cycles
        if (this.hasCycle()) {
            this.nodes.delete(node.id);
            throw new Error(`Cycle detected when adding node "${node.id}"`);
        }

        return taskNode;
    }

    /** Get nodes ready to execute (all deps done) */
    getReady(): TaskNode[] {
        return [...this.nodes.values()].filter(node => {
            if (node.status !== 'pending') return false;
            return node.dependencies.every(depId => {
                const dep = this.nodes.get(depId);
                return dep?.status === 'done';
            });
        });
    }

    /** Get a node by ID */
    getNode(id: string): TaskNode | undefined {
        return this.nodes.get(id);
    }

    /** Update node status */
    setStatus(id: string, status: TaskStatus, result?: unknown, error?: string): void {
        const node = this.nodes.get(id);
        if (!node) throw new Error(`Node "${id}" not found`);
        node.status = status;
        if (result !== undefined) node.result = result;
        if (error !== undefined) node.error = error;
    }

    /** Collapse: cancel all pending descendants of a node */
    collapse(nodeId: string): string[] {
        const cancelled: string[] = [];
        const descendants = this.getDescendants(nodeId);
        for (const id of descendants) {
            const node = this.nodes.get(id);
            if (node && node.status === 'pending') {
                node.status = 'cancelled';
                cancelled.push(id);
            }
        }
        return cancelled;
    }

    /** Get all nodes */
    getAllNodes(): TaskNode[] {
        return [...this.nodes.values()];
    }

    /** Topological sort */
    topologicalSort(): TaskNode[] {
        const visited = new Set<string>();
        const result: TaskNode[] = [];

        const visit = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);
            const node = this.nodes.get(id)!;
            for (const dep of node.dependencies) {
                visit(dep);
            }
            result.push(node);
        };

        for (const id of this.nodes.keys()) {
            visit(id);
        }
        return result;
    }

    /** Check completion */
    isComplete(): boolean {
        return [...this.nodes.values()].every(n =>
            n.status === 'done' || n.status === 'cancelled' || n.status === 'failed'
        );
    }

    /** Stats */
    stats() {
        const nodes = [...this.nodes.values()];
        return {
            total: nodes.length,
            pending: nodes.filter(n => n.status === 'pending').length,
            running: nodes.filter(n => n.status === 'running').length,
            done: nodes.filter(n => n.status === 'done').length,
            failed: nodes.filter(n => n.status === 'failed').length,
            cancelled: nodes.filter(n => n.status === 'cancelled').length,
        };
    }

    private getDescendants(nodeId: string): string[] {
        const descendants: string[] = [];
        for (const [id, node] of this.nodes) {
            if (node.dependencies.includes(nodeId)) {
                descendants.push(id);
                descendants.push(...this.getDescendants(id));
            }
        }
        return [...new Set(descendants)];
    }

    private hasCycle(): boolean {
        const visited = new Set<string>();
        const inStack = new Set<string>();

        const dfs = (id: string): boolean => {
            if (inStack.has(id)) return true;
            if (visited.has(id)) return false;
            visited.add(id);
            inStack.add(id);
            const node = this.nodes.get(id)!;
            for (const dep of node.dependencies) {
                if (dfs(dep)) return true;
            }
            inStack.delete(id);
            return false;
        };

        for (const id of this.nodes.keys()) {
            if (dfs(id)) return true;
        }
        return false;
    }
}
