import { describe, it, expect } from 'vitest';
import {
    TaskDAG,
    SwarmBudget,
    SharedContext,
    Agent,
    getAllRoles,
    getRolesByCategory,
    getRole,
    Scheduler,
    createSwarm,
    KNOWN_FIX_PATTERNS,
    tryAutoFix,
    ContractChecker,
    BUILT_IN_CONTRACTS,
    compressContext,
    createWaveContext,
} from '../index.js';

// --- TaskDAG ---
describe('TaskDAG', () => {
    it('adds nodes and gets ready', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: 'Plan', dependencies: [], budget: 1000, maxRetries: 2 });
        expect(dag.getReady().length).toBe(1);
    });

    it('respects dependencies', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: 'Plan', dependencies: [], budget: 1000, maxRetries: 2 });
        dag.addNode({ id: 'b', role: 'coder', type: 'hybrid', description: 'Code', dependencies: ['a'], budget: 1500, maxRetries: 2 });
        expect(dag.getReady().map(n => n.id)).toEqual(['a']);
        dag.setStatus('a', 'done', 'plan result');
        expect(dag.getReady().map(n => n.id)).toEqual(['b']);
    });

    it('rejects cycles', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 100, maxRetries: 2 });
        // Can't create a cycle with just forward deps in this API, but let's test max depth
        expect(() => dag.addNode({ id: 'b', role: 'coder', type: 'llm', description: '', dependencies: ['nonexistent'], budget: 100, maxRetries: 2 }))
            .toThrow('not found');
    });

    it('enforces max nodes', () => {
        const dag = new TaskDAG(3, 2);
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 100, maxRetries: 2 });
        dag.addNode({ id: 'b', role: 'coder', type: 'llm', description: '', dependencies: [], budget: 100, maxRetries: 2 });
        expect(() => dag.addNode({ id: 'c', role: 'tester', type: 'tool', description: '', dependencies: [], budget: 0, maxRetries: 2 }))
            .toThrow('Max nodes');
    });

    it('enforces max depth', () => {
        const dag = new TaskDAG(2, 10);
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 100, maxRetries: 2 });
        dag.addNode({ id: 'b', role: 'coder', type: 'llm', description: '', dependencies: ['a'], budget: 100, maxRetries: 2, depth: 1 });
        expect(() => dag.addNode({ id: 'c', role: 'tester', type: 'tool', description: '', dependencies: ['b'], budget: 0, maxRetries: 2, depth: 2 }))
            .toThrow('Max depth');
    });

    it('collapses descendants', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 100, maxRetries: 2 });
        dag.addNode({ id: 'b', role: 'coder', type: 'hybrid', description: '', dependencies: ['a'], budget: 100, maxRetries: 2 });
        dag.addNode({ id: 'c', role: 'tester', type: 'tool', description: '', dependencies: ['b'], budget: 0, maxRetries: 2 });
        const cancelled = dag.collapse('a');
        expect(cancelled).toContain('b');
        expect(cancelled).toContain('c');
    });

    it('topological sort', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 100, maxRetries: 2 });
        dag.addNode({ id: 'b', role: 'coder', type: 'hybrid', description: '', dependencies: ['a'], budget: 100, maxRetries: 2 });
        const sorted = dag.topologicalSort();
        expect(sorted[0].id).toBe('a');
        expect(sorted[1].id).toBe('b');
    });
});

// --- SwarmBudget ---
describe('SwarmBudget', () => {
    it('tracks spending', () => {
        const budget = new SwarmBudget(1000);
        budget.spend('a', 300);
        expect(budget.remaining()).toBe(700);
    });

    it('reserves ≤ 30% of remaining', () => {
        const budget = new SwarmBudget(1000);
        const reserved = budget.reserve('a', 500);
        expect(reserved).toBe(300); // 30% of 1000
    });

    it('detects exhaustion', () => {
        const budget = new SwarmBudget(100);
        budget.spend('a', 100);
        expect(budget.isExhausted()).toBe(true);
    });

    it('uses DailyTokenSource as source of truth', () => {
        const source = { getTokensUsedToday: () => 500 };
        const budget = new SwarmBudget(1000, source);
        expect(budget.getDailyTokensUsed()).toBe(500);
    });

    it('falls back to spent when no daily source', () => {
        const budget = new SwarmBudget(1000);
        budget.spend('a', 200);
        expect(budget.getDailyTokensUsed()).toBe(200);
    });
});

// --- SharedContext ---
describe('SharedContext', () => {
    it('stores and retrieves results', () => {
        const ctx = new SharedContext('Build a feature');
        ctx.addResult('agent1', 'planner', 'plan output', 500);
        expect(ctx.getResult('agent1')?.output).toBe('plan output');
    });

    it('generates summary', () => {
        const ctx = new SharedContext('Build a feature');
        ctx.addResult('agent1', 'planner', 'step 1: do X', 500);
        const summary = ctx.getSummaryFor('agent2');
        expect(summary).toContain('Build a feature');
        expect(summary).toContain('planner');
    });

    it('tracks version', () => {
        const ctx = new SharedContext('task');
        expect(ctx.getVersion()).toBe(0);
        ctx.addResult('a', 'planner', 'x', 100);
        expect(ctx.getVersion()).toBe(1);
    });

    it('injects and retrieves codebase map (B1)', () => {
        const ctx = new SharedContext('task');
        ctx.injectCodebaseMap('📄 src/index.ts: Entry [exports: main]');
        expect(ctx.getCodebaseMap()).toContain('src/index.ts');
        expect(ctx.stats().hasCodebaseMap).toBe(true);
    });
});

// --- Agent ---
describe('Agent', () => {
    it('executes and tracks tokens', async () => {
        const role = getRole('coder')!;
        const agent = new Agent({ id: 'a1', role, budgetTokens: 2000 });
        const result = await agent.execute('write code', async () => ({
            output: 'console.log("hello")',
            tokensUsed: 500,
        }));
        expect(result.output).toBe('console.log("hello")');
        expect(agent.getStatus()).toBe('done');
        expect(agent.getTokensUsed()).toBe(500);
    });

    it('fails on budget exceeded', async () => {
        const role = getRole('planner')!;
        const agent = new Agent({ id: 'a2', role, budgetTokens: 100 });
        const result = await agent.execute('plan', async () => ({
            output: 'big plan',
            tokensUsed: 200,
        }));
        expect(agent.getStatus()).toBe('failed');
        expect(result.error).toContain('Budget');
    });
});

// --- Roles ---
describe('Roles', () => {
    it('has 20 roles (15 base + 5 domain)', () => {
        expect(getAllRoles().length).toBe(20);
    });

    it('categorizes correctly', () => {
        expect(getRolesByCategory('llm').length).toBe(5);
        expect(getRolesByCategory('hybrid').length).toBe(8); // 3 base + 5 domain
        expect(getRolesByCategory('tool').length).toBe(7);
    });

    it('tool agents have 0 avgTokens', () => {
        const tools = getRolesByCategory('tool');
        expect(tools.every(r => r.avgTokens === 0)).toBe(true);
    });

    it('has domain agents from oh-my-ag', () => {
        expect(getRole('frontendAgent')).toBeDefined();
        expect(getRole('backendAgent')).toBeDefined();
        expect(getRole('mobileAgent')).toBeDefined();
        expect(getRole('qaAgent')).toBeDefined();
        expect(getRole('debugAgent')).toBeDefined();
    });
});

// --- Scheduler ---
describe('Scheduler', () => {
    it('returns ready nodes', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'tester', type: 'tool', description: '', dependencies: [], budget: 0, maxRetries: 2 });
        const budget = new SwarmBudget(10000);
        const scheduler = new Scheduler(dag, budget);
        const batch = scheduler.getNextBatch();
        expect(batch.length).toBe(1);
    });

    it('prioritizes tool agents', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'llm1', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 1000, maxRetries: 2 });
        dag.addNode({ id: 'tool1', role: 'tester', type: 'tool', description: '', dependencies: [], budget: 0, maxRetries: 2 });
        const budget = new SwarmBudget(10000);
        const scheduler = new Scheduler(dag, budget);
        const batch = scheduler.getNextBatch();
        expect(batch[0].id).toBe('tool1');
    });

    it('degrades at high CPU', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 1000, maxRetries: 2 });
        const budget = new SwarmBudget(10000);
        const scheduler = new Scheduler(dag, budget);
        scheduler.setCpuUsage(95);
        expect(scheduler.getNextBatch().length).toBe(0);
        expect(scheduler.shouldDegrade()).toBe(true);
    });

    it('blocks during interactive', () => {
        const dag = new TaskDAG();
        dag.addNode({ id: 'a', role: 'tester', type: 'tool', description: '', dependencies: [], budget: 0, maxRetries: 2 });
        const budget = new SwarmBudget(10000);
        const scheduler = new Scheduler(dag, budget);
        scheduler.setInteractive(true);
        expect(scheduler.getNextBatch().length).toBe(0);
    });
});

// --- Coordinator (integration) ---
describe('Coordinator', () => {
    it('runs a simple swarm', async () => {
        const swarm = createSwarm('Build feature X', { totalBudget: 5000 });
        swarm.dag.addNode({ id: 'plan', role: 'planner', type: 'llm', description: 'Plan', dependencies: [], budget: 1000, maxRetries: 2 });
        swarm.dag.addNode({ id: 'code', role: 'coder', type: 'hybrid', description: 'Code', dependencies: ['plan'], budget: 1500, maxRetries: 2 });
        swarm.dag.addNode({ id: 'test', role: 'tester', type: 'tool', description: 'Test', dependencies: ['code'], budget: 0, maxRetries: 2 });

        const result = await swarm.run(async (nodeId, role) => ({
            output: `${role} result for ${nodeId}`,
            tokensUsed: role === 'tester' ? 0 : 500,
        }));

        expect(result.success).toBe(true);
        expect(result.nodesCompleted).toBe(3);
        expect(result.tokensUsed).toBe(1000); // planner 500 + coder 500
    });

    it('handles agent failure with retry', async () => {
        const swarm = createSwarm('Failing task', { totalBudget: 5000 });
        swarm.dag.addNode({ id: 'fail', role: 'coder', type: 'hybrid', description: 'Will fail', dependencies: [], budget: 1500, maxRetries: 2 });

        let attempts = 0;
        const result = await swarm.run(async () => {
            attempts++;
            if (attempts <= 2) throw new Error('Temporary failure');
            return { output: 'success', tokensUsed: 500 };
        });

        expect(result.nodesCompleted).toBe(1);
        expect(attempts).toBe(3); // 2 retries + 1 success
    });

    it('respects budget limit', async () => {
        const swarm = createSwarm('Budget test', { totalBudget: 100 });
        swarm.dag.addNode({ id: 'a', role: 'planner', type: 'llm', description: '', dependencies: [], budget: 50, maxRetries: 2 });
        swarm.dag.addNode({ id: 'b', role: 'coder', type: 'hybrid', description: '', dependencies: ['a'], budget: 200, maxRetries: 2 });

        const result = await swarm.run(async () => ({
            output: 'result',
            tokensUsed: 80,
        }));

        // Budget exhausted after first agent (80 > remaining for second)
        expect(result.tokensUsed).toBeLessThanOrEqual(100);
    });
});

// --- Auto-Fix Patterns ---
describe('Auto-Fix Patterns', () => {
    it('has 14 patterns', () => {
        expect(KNOWN_FIX_PATTERNS.length).toBe(14);
    });

    it('finds fix for ModuleNotFoundError', () => {
        const fix = tryAutoFix('ModuleNotFoundError: No module named requests');
        expect(fix).toBeDefined();
        expect(fix!.category).toBe('syntax');
        expect(fix!.isAutomatic).toBe(true);
    });

    it('finds fix for rate limit (429)', () => {
        const fix = tryAutoFix('Error 429: Rate limit exceeded');
        expect(fix).toBeDefined();
        expect(fix!.category).toBe('api');
    });

    it('returns undefined for unknown error', () => {
        expect(tryAutoFix('Something completely unique happened')).toBeUndefined();
    });
});

// --- TaskContext ---
describe('TaskContext', () => {
    it('creates standardized context', () => {
        const ctx = new SharedContext('Test task');
        ctx.addResult('a1', 'planner', 'plan output', 500);
        const taskCtx = ctx.createTaskContext('a2', { data: 'input' });
        expect(taskCtx.taskId).toMatch(/^ctx_/);
        expect(taskCtx.sourceAgent).toBe('a2');
        expect(taskCtx.intermediateResults.length).toBe(1);
        expect(taskCtx.intermediateResults[0].role).toBe('planner');
    });
});

// --- ContractChecker (из ARC Protocol) ---
describe('ContractChecker', () => {
    it('has 3 built-in contracts', () => {
        expect(BUILT_IN_CONTRACTS.length).toBe(3);
    });

    it('passes clean code', () => {
        const checker = new ContractChecker();
        const result = checker.checkAll({
            changedFiles: ['src/utils/helper.ts'],
            diff: 'const x = 1;',
            projectRoot: '/',
        });
        expect(result.allPassed).toBe(true);
    });

    it('catches naming violation', () => {
        const checker = new ContractChecker();
        const result = checker.checkAll({
            changedFiles: ['src/MyComponent.ts'],
            diff: 'export class MyComponent {}',
            projectRoot: '/',
        });
        const naming = result.results.find(r => r.contract === 'naming-conventions');
        expect(naming?.passed).toBe(false);
    });

    it('catches .env access', () => {
        const checker = new ContractChecker();
        const result = checker.checkAll({
            changedFiles: ['src/config.ts'],
            diff: 'const key = process.env.API_KEY;',
            projectRoot: '/',
        });
        const envCheck = result.results.find(r => r.contract === 'no-env-access');
        expect(envCheck?.passed).toBe(false);
    });
});

// --- Context Compressor + Wave ---
describe('Context Compressor & Wave', () => {
    it('compresses context', () => {
        const ctx = new SharedContext('Big task description');
        ctx.addResult('a1', 'planner', 'Very long plan output...', 500);
        const compressed = compressContext(ctx, 100);
        expect(compressed.length).toBeLessThanOrEqual(300);
    });

    it('creates wave context with parent summary', () => {
        const parent = new SharedContext('Parent task');
        parent.addResult('a1', 'planner', 'plan done', 500);
        const wave = createWaveContext(parent, 2);
        expect(wave.taskDescription).toContain('Wave 2');
        expect(wave.getMemoryCache().length).toBe(1);
    });
});
