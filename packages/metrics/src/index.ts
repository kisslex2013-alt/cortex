/**
 * @jarvis/metrics — Internal Metric Bus
 *
 * Внутренняя шина метрик: EventEmitter + in-memory ring buffer (1000 событий).
 * Не заменяет Prometheus — это для внутреннего мониторинга и Dashboard.
 */

export interface MetricEvent {
    name: string;
    value: number;
    tags: Record<string, string>;
    timestamp: number;
}

export type MetricHandler = (event: MetricEvent) => void;

/**
 * MetricBus — шина метрик для Jarvis.
 * emit/on/snapshot — основной API.
 */
export class MetricBus {
    private buffer: MetricEvent[] = [];
    private maxBuffer: number;
    private handlers: Map<string, MetricHandler[]> = new Map();

    constructor(maxBuffer = 1000) {
        this.maxBuffer = maxBuffer;
    }

    /** Emit метрику */
    emit(name: string, value: number, tags: Record<string, string> = {}): void {
        const event: MetricEvent = { name, value, tags, timestamp: Date.now() };

        // Ring buffer: удаляем старые при переполнении
        if (this.buffer.length >= this.maxBuffer) {
            this.buffer.shift();
        }
        this.buffer.push(event);

        // Notify handlers
        for (const [pattern, handlers] of this.handlers) {
            if (this.matches(name, pattern)) {
                handlers.forEach(h => h(event));
            }
        }
    }

    /** Подписка на метрики (поддерживает * wildcard) */
    on(pattern: string, handler: MetricHandler): void {
        const existing = this.handlers.get(pattern) ?? [];
        existing.push(handler);
        this.handlers.set(pattern, existing);
    }

    /** Snapshot всех метрик, сгруппированных по prefix */
    snapshot(): Record<string, MetricEvent[]> {
        const groups: Record<string, MetricEvent[]> = {};
        for (const event of this.buffer) {
            const prefix = event.name.split('.')[0];
            if (!groups[prefix]) groups[prefix] = [];
            groups[prefix].push(event);
        }
        return groups;
    }

    /** Последние N событий */
    recent(count = 10): MetricEvent[] {
        return this.buffer.slice(-count);
    }

    /** Количество событий в буфере */
    size(): number {
        return this.buffer.length;
    }

    /** Очистка */
    clear(): void {
        this.buffer = [];
    }

    private matches(name: string, pattern: string): boolean {
        if (pattern === '*') return true;
        if (pattern.endsWith('.*')) {
            return name.startsWith(pattern.slice(0, -1));
        }
        return name === pattern;
    }
}

// --- Collectors (C2, C3) ---

/** Brain collector: вызывай после BrainRouter.think() */
export function emitBrainMetrics(
    bus: MetricBus,
    data: { tokensUsed: number; provider: string; latencyMs: number; cached: boolean },
): void {
    bus.emit('brain.tokens_used', data.tokensUsed, { provider: data.provider });
    bus.emit('brain.latency', data.latencyMs, { provider: data.provider });
    if (data.cached) bus.emit('brain.cache_hit', 1, { provider: data.provider });
}

/** Swarm collector: вызывай после Scheduler.spawnAgent() */
export function emitSwarmMetrics(
    bus: MetricBus,
    data: { role: string; budgetRemaining: number },
): void {
    bus.emit('swarm.agent_spawned', 1, { role: data.role });
    bus.emit('swarm.budget_remaining', data.budgetRemaining, {});
}
