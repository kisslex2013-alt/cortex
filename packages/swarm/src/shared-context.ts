/**
 * @jarvis/swarm — Shared Context Layer
 *
 * Единый контекст для всех агентов в swarm.
 * Ключевой принцип: указатели, не копии.
 * Один retrieval из Memory на итерацию DAG.
 */

export interface AgentResult {
    agentId: string;
    role: string;
    output: unknown;
    tokensUsed: number;
    timestamp: number;
}

export class SharedContext {
    /** Описание задачи (read-only для агентов) */
    readonly taskDescription: string;

    /** Результаты агентов — append-only */
    private results: Map<string, AgentResult> = new Map();

    /** Кэш Memory retrieval (один на итерацию) */
    private memoryCache: Array<{ content: string; relevance: number }> = [];
    private memoryCacheVersion = 0;

    /** Версионирование для stale detection */
    private version = 0;

    constructor(taskDescription: string) {
        this.taskDescription = taskDescription;
    }

    /** Записать результат агента */
    addResult(agentId: string, role: string, output: unknown, tokensUsed: number): void {
        this.results.set(agentId, {
            agentId,
            role,
            output,
            tokensUsed,
            timestamp: Date.now(),
        });
        this.version++;
    }

    /** Получить результат агента */
    getResult(agentId: string): AgentResult | undefined {
        return this.results.get(agentId);
    }

    /** Получить все результаты */
    getAllResults(): AgentResult[] {
        return [...this.results.values()];
    }

    /** Получить summary для агента (200-300 токенов, не полный контекст) */
    getSummaryFor(agentId: string, maxLength = 500): string {
        const parts: string[] = [
            `Task: ${this.taskDescription.slice(0, 100)}`,
        ];

        // Add dependency results as summaries (not full output)
        for (const [id, result] of this.results) {
            if (id === agentId) continue;
            const outputStr = typeof result.output === 'string'
                ? result.output.slice(0, 150)
                : JSON.stringify(result.output).slice(0, 150);
            parts.push(`[${result.role}] ${outputStr}`);
        }

        // Add memory context
        if (this.memoryCache.length > 0) {
            parts.push(`[Memory] ${this.memoryCache.map(m => m.content.slice(0, 80)).join('; ')}`);
        }

        return parts.join('\n').slice(0, maxLength);
    }

    /** Установить кэш Memory (один retrieval на итерацию) */
    setMemoryCache(results: Array<{ content: string; relevance: number }>): void {
        this.memoryCache = results;
        this.memoryCacheVersion++;
    }

    /** Получить кэш Memory */
    getMemoryCache(): Array<{ content: string; relevance: number }> {
        return this.memoryCache;
    }

    getVersion(): number {
        return this.version;
    }

    /** Инжектировать карту проекта (B1: memory → shared context) */
    private codebaseMapSummary = '';

    injectCodebaseMap(summary: string): void {
        this.codebaseMapSummary = summary;
    }

    getCodebaseMap(): string {
        return this.codebaseMapSummary;
    }

    stats() {
        return {
            totalResults: this.results.size,
            totalTokensUsed: [...this.results.values()].reduce((sum, r) => sum + r.tokensUsed, 0),
            memoryCacheSize: this.memoryCache.length,
            version: this.version,
            hasCodebaseMap: this.codebaseMapSummary.length > 0,
        };
    }

    /**
     * Стандартизированный контекст для передачи между агентами
     * (формат вдохновлён DO Framework из temp/Agents)
     */
    createTaskContext(sourceAgentId: string, inputData: unknown): TaskContext {
        return {
            taskId: `ctx_${Date.now()}`,
            sourceAgent: sourceAgentId,
            inputData,
            intermediateResults: this.getAllResults().map(r => ({
                agentId: r.agentId,
                role: r.role,
                summary: typeof r.output === 'string'
                    ? r.output.slice(0, 200)
                    : JSON.stringify(r.output).slice(0, 200),
            })),
            errors: this.getAllResults()
                .filter(r => r.output && typeof r.output === 'object' && 'error' in (r.output as Record<string, unknown>))
                .map(r => String((r.output as Record<string, unknown>).error)),
            timestamp: Date.now(),
        };
    }
}

/** Стандартизированный контекст передачи между агентами */
export interface TaskContext {
    taskId: string;
    sourceAgent: string;
    inputData: unknown;
    intermediateResults: Array<{ agentId: string; role: string; summary: string }>;
    errors: string[];
    timestamp: number;
}

// --- Verifiable Artifacts (из open-antigravity) ---

export type ArtifactType = 'plan' | 'code' | 'test_result' | 'screenshot' | 'diff' | 'report';

export interface VerifiableArtifact {
    id: string;
    agentId: string;
    type: ArtifactType;
    content: string;
    verified: boolean;
    timestamp: number;
}

// --- Context Compressor (из GSD token-optimization) ---

/**
 * Сжимает контекст при приближении к лимиту токенов.
 * Стратегия: оставить задачу + последние N результатов как summaries
 */
export function compressContext(
    context: SharedContext,
    maxTokens: number,
    estimateTokens: (text: string) => number = (t) => Math.ceil(t.length / 4)
): string {
    const full = context.getSummaryFor('__compressor__', 10000);
    const currentTokens = estimateTokens(full);

    if (currentTokens <= maxTokens) return full;

    // Progressive compression: shorter summaries
    const compressed = context.getSummaryFor('__compressor__', Math.floor(maxTokens * 3));
    return compressed;
}

// --- Wave Isolation (из GSD wave-based execution) ---

/**
 * Создать изолированный контекст для новой волны (wave).
 * Предыдущие результаты агентов сжимаются в summaries,
 * каждый executor получает "свежий" контекст.
 */
export function createWaveContext(
    parent: SharedContext,
    waveId: number,
): SharedContext {
    const summary = parent.getSummaryFor(`wave_${waveId}`, 500);
    const wave = new SharedContext(`[Wave ${waveId}] ${parent.taskDescription}`);

    // Inject parent summary as memory cache (не копия, а summary)
    wave.setMemoryCache([{
        content: summary,
        relevance: 1.0,
    }]);

    return wave;
}

// --- API Sources for Researcher (из public-apis) ---

export const API_SOURCES = {
    reference: 'https://github.com/public-apis/public-apis',
    categories: [
        'Development', 'Machine Learning', 'Finance', 'Security',
        'Cloud Storage', 'Data Validation', 'Authentication',
        'Open Data', 'Science & Math', 'Text Analysis',
    ],
} as const;


