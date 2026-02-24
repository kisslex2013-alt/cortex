/**
 * @jarvis/watchdog — Self-Healing
 *
 * Health checks, auto-restart, restore points, safe mode
 */

export interface HealthTarget {
    name: string;
    check: () => Promise<boolean>;
    restart?: () => Promise<void>;
}

export interface RestorePoint {
    id: string;
    timestamp: number;
    reason: string;
    data: Record<string, unknown>;
}

export class Watchdog {
    private targets: Map<string, HealthTarget> = new Map();
    private failCounts: Map<string, number> = new Map();
    private restorePoints: RestorePoint[] = [];
    private safeMode = false;
    private maxFailures = 3;
    private intervalId: ReturnType<typeof setInterval> | null = null;

    register(target: HealthTarget): void {
        this.targets.set(target.name, target);
        this.failCounts.set(target.name, 0);
    }

    async healthCheck(): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();
        for (const [name, target] of this.targets) {
            try {
                const ok = await target.check();
                results.set(name, ok);
                if (ok) {
                    this.failCounts.set(name, 0);
                } else {
                    await this.handleFailure(name);
                }
            } catch {
                results.set(name, false);
                await this.handleFailure(name);
            }
        }
        return results;
    }

    createRestorePoint(reason: string, data: Record<string, unknown> = {}): RestorePoint {
        const point: RestorePoint = {
            id: `rp_${Date.now()}`,
            timestamp: Date.now(),
            reason,
            data,
        };
        this.restorePoints.push(point);
        // Keep max 10 restore points
        if (this.restorePoints.length > 10) {
            this.restorePoints.shift();
        }
        return point;
    }

    getLastRestorePoint(): RestorePoint | undefined {
        return this.restorePoints[this.restorePoints.length - 1];
    }

    activateSafeMode(): void {
        this.safeMode = true;
    }

    deactivateSafeMode(): void {
        this.safeMode = false;
    }

    isSafeMode(): boolean {
        return this.safeMode;
    }

    start(intervalMs = 30_000): void {
        this.intervalId = setInterval(() => this.healthCheck(), intervalMs);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private async handleFailure(name: string): Promise<void> {
        const count = (this.failCounts.get(name) ?? 0) + 1;
        this.failCounts.set(name, count);

        const target = this.targets.get(name);
        if (count <= this.maxFailures && target?.restart) {
            await target.restart();
        } else if (count > this.maxFailures) {
            this.activateSafeMode();
        }
    }
}

export function createWatchdog(): Watchdog {
    return new Watchdog();
}

// --- Multi-Level Self-Check (из DO Framework) ---

export type CheckLevel = 'syntax' | 'execution' | 'api' | 'logic';

export interface CheckResult {
    level: CheckLevel;
    passed: boolean;
    details: string;
    timestamp: number;
}

export interface SelfCheckConfig {
    maxRetries: number;
    retryStrategies: Array<'fix' | 'alternative' | 'simplified'>;
}

/**
 * 4-уровневая самопроверка (идея из DO Framework / temp/Agents):
 * Level 1: Syntax — импорты, синтаксис
 * Level 2: Execution — exit code, timeout
 * Level 3: API — HTTP status, rate limits
 * Level 4: Logic — формат данных, дубликаты, валидация
 */
export class SelfCheck {
    private config: SelfCheckConfig;
    private history: CheckResult[] = [];

    constructor(config?: Partial<SelfCheckConfig>) {
        this.config = {
            maxRetries: config?.maxRetries ?? 3,
            retryStrategies: config?.retryStrategies ?? ['fix', 'alternative', 'simplified'],
        };
    }

    /** Выполнить проверку на указанном уровне */
    async check(
        level: CheckLevel,
        checker: () => Promise<{ passed: boolean; details: string }>
    ): Promise<CheckResult> {
        const result = await checker();
        const checkResult: CheckResult = {
            level,
            passed: result.passed,
            details: result.details,
            timestamp: Date.now(),
        };
        this.history.push(checkResult);
        // Keep last 100
        if (this.history.length > 100) this.history.splice(0, this.history.length - 100);
        return checkResult;
    }

    /** Выполнить все 4 уровня последовательно (останавливается при первой ошибке) */
    async runAll(checks: Record<CheckLevel, () => Promise<{ passed: boolean; details: string }>>): Promise<CheckResult[]> {
        const levels: CheckLevel[] = ['syntax', 'execution', 'api', 'logic'];
        const results: CheckResult[] = [];

        for (const level of levels) {
            if (!checks[level]) continue;
            const result = await this.check(level, checks[level]);
            results.push(result);
            if (!result.passed) break; // fail-fast
        }
        return results;
    }

    /** Retry с 3 стратегиями: fix → alternative → simplified */
    async withRetry<T>(
        operation: () => Promise<T>,
        onError?: (attempt: number, strategy: string, error: unknown) => Promise<void>
    ): Promise<{ success: boolean; result?: T; attempts: number }> {
        for (let i = 0; i < this.config.maxRetries; i++) {
            try {
                const result = await operation();
                return { success: true, result, attempts: i + 1 };
            } catch (err) {
                const strategy = this.config.retryStrategies[i] ?? 'fix';
                if (onError) await onError(i + 1, strategy, err);
            }
        }
        return { success: false, attempts: this.config.maxRetries };
    }

    getHistory(): CheckResult[] {
        return [...this.history];
    }

    getLastFailed(): CheckResult | undefined {
        return [...this.history].reverse().find(r => !r.passed);
    }
}

// --- Context Health Monitor (из GSD context-health-monitor) ---

export type ContextHealth = 'healthy' | 'warning' | 'critical';

export interface ContextHealthReport {
    health: ContextHealth;
    tokenUsagePercent: number;
    staleContextCount: number;
    memoryPressure: boolean;
    recommendations: string[];
}

/**
 * Мониторинг здоровья контекста (идея из GSD token-optimization).
 * Определяет: token pressure, stale context, memory overflow.
 */
export class ContextHealthMonitor {
    private maxTokens: number;
    private staleThresholdMs: number;

    constructor(maxTokens = 100_000, staleThresholdMs = 300_000) {
        this.maxTokens = maxTokens;
        this.staleThresholdMs = staleThresholdMs;
    }

    /** Проверить здоровье контекста */
    assess(metrics: {
        currentTokens: number;
        contextVersions: Array<{ lastUpdated: number }>;
        memoryUsedBytes: number;
        memoryLimitBytes: number;
    }): ContextHealthReport {
        const tokenUsagePercent = (metrics.currentTokens / this.maxTokens) * 100;
        const now = Date.now();
        const staleContextCount = metrics.contextVersions
            .filter(v => (now - v.lastUpdated) > this.staleThresholdMs).length;
        const memoryPressure = metrics.memoryUsedBytes > metrics.memoryLimitBytes * 0.85;

        const recommendations: string[] = [];
        let health: ContextHealth = 'healthy';

        if (tokenUsagePercent > 90) {
            health = 'critical';
            recommendations.push('Token usage > 90% — compress context or split task');
        } else if (tokenUsagePercent > 70) {
            health = 'warning';
            recommendations.push('Token usage > 70% — consider context compression');
        }

        if (staleContextCount > 0) {
            recommendations.push(`${staleContextCount} stale context(s) — refresh or discard`);
            if (health === 'healthy') health = 'warning';
        }

        if (memoryPressure) {
            recommendations.push('Memory pressure > 85% — run GC or reduce concurrent agents');
            health = 'critical';
        }

        return { health, tokenUsagePercent, staleContextCount, memoryPressure, recommendations };
    }
}

// --- Health Dashboard (единая точка отчёта) ---

export interface FullHealthReport {
    selfCheck: {
        history: CheckResult[];
        lastFailed: CheckResult | undefined;
    };
    context: ContextHealthReport;
    overallHealth: ContextHealth;
}

/**
 * Единая точка отчёта о здоровье системы.
 * Делегирует в SelfCheck + ContextHealthMonitor.
 */
export class HealthDashboard {
    constructor(
        private selfCheck: SelfCheck,
        private contextMonitor: ContextHealthMonitor,
    ) { }

    /** Получить полный отчёт */
    getFullReport(contextMetrics: {
        currentTokens: number;
        contextVersions: Array<{ lastUpdated: number }>;
        memoryUsedBytes: number;
        memoryLimitBytes: number;
    }): FullHealthReport {
        const selfCheckData = {
            history: this.selfCheck.getHistory(),
            lastFailed: this.selfCheck.getLastFailed(),
        };
        const contextReport = this.contextMonitor.assess(contextMetrics);

        // Overall: worst of both
        let overallHealth: ContextHealth = contextReport.health;
        if (selfCheckData.lastFailed) {
            overallHealth = 'critical';
        }

        return {
            selfCheck: selfCheckData,
            context: contextReport,
            overallHealth,
        };
    }
}



