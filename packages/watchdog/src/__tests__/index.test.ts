import { describe, it, expect } from 'vitest';
import { createWatchdog, SelfCheck, ContextHealthMonitor, HealthDashboard } from '../index.js';

describe('@jarvis/watchdog', () => {
    it('creates watchdog', () => {
        const wd = createWatchdog();
        expect(wd.isSafeMode()).toBe(false);
    });

    it('registers and checks healthy targets', async () => {
        const wd = createWatchdog();
        wd.register({ name: 'core', check: async () => true });
        const results = await wd.healthCheck();
        expect(results.get('core')).toBe(true);
    });

    it('detects unhealthy targets', async () => {
        const wd = createWatchdog();
        wd.register({ name: 'broken', check: async () => false });
        const results = await wd.healthCheck();
        expect(results.get('broken')).toBe(false);
    });

    it('activates safe mode after max failures', async () => {
        const wd = createWatchdog();
        wd.register({ name: 'flaky', check: async () => false });
        // 4 checks to exceed maxFailures=3
        for (let i = 0; i < 4; i++) await wd.healthCheck();
        expect(wd.isSafeMode()).toBe(true);
    });

    it('creates and retrieves restore points', () => {
        const wd = createWatchdog();
        wd.createRestorePoint('test', { config: 'snapshot' });
        const rp = wd.getLastRestorePoint();
        expect(rp?.reason).toBe('test');
        expect(rp?.data.config).toBe('snapshot');
    });
});

// --- SelfCheck (Multi-Level) ---
describe('SelfCheck', () => {
    it('runs single check', async () => {
        const sc = new SelfCheck();
        const result = await sc.check('syntax', async () => ({ passed: true, details: 'OK' }));
        expect(result.passed).toBe(true);
        expect(result.level).toBe('syntax');
    });

    it('runAll stops at first failure (fail-fast)', async () => {
        const sc = new SelfCheck();
        const results = await sc.runAll({
            syntax: async () => ({ passed: true, details: 'OK' }),
            execution: async () => ({ passed: false, details: 'Exit code 1' }),
            api: async () => ({ passed: true, details: 'OK' }),
            logic: async () => ({ passed: true, details: 'OK' }),
        });
        expect(results.length).toBe(2); // stopped at execution
        expect(results[1].passed).toBe(false);
    });

    it('withRetry succeeds on 3rd attempt', async () => {
        const sc = new SelfCheck({ maxRetries: 3 });
        let attempts = 0;
        const result = await sc.withRetry(async () => {
            attempts++;
            if (attempts < 3) throw new Error('fail');
            return 'success';
        });
        expect(result.success).toBe(true);
        expect(result.result).toBe('success');
        expect(result.attempts).toBe(3);
    });

    it('withRetry fails after max attempts', async () => {
        const sc = new SelfCheck({ maxRetries: 2 });
        const result = await sc.withRetry(async () => {
            throw new Error('always fail');
        });
        expect(result.success).toBe(false);
        expect(result.attempts).toBe(2);
    });

    it('tracks history', async () => {
        const sc = new SelfCheck();
        await sc.check('syntax', async () => ({ passed: true, details: 'OK' }));
        await sc.check('api', async () => ({ passed: false, details: 'Timeout' }));
        expect(sc.getHistory().length).toBe(2);
        expect(sc.getLastFailed()?.level).toBe('api');
    });
});

// --- Context Health Monitor (из GSD) ---
describe('ContextHealthMonitor', () => {
    it('reports healthy', () => {
        const monitor = new ContextHealthMonitor(100_000);
        const report = monitor.assess({
            currentTokens: 30_000,
            contextVersions: [{ lastUpdated: Date.now() }],
            memoryUsedBytes: 100_000,
            memoryLimitBytes: 500_000,
        });
        expect(report.health).toBe('healthy');
        expect(report.recommendations.length).toBe(0);
    });

    it('reports warning at 70%+ tokens', () => {
        const monitor = new ContextHealthMonitor(100_000);
        const report = monitor.assess({
            currentTokens: 75_000,
            contextVersions: [],
            memoryUsedBytes: 100_000,
            memoryLimitBytes: 500_000,
        });
        expect(report.health).toBe('warning');
        expect(report.tokenUsagePercent).toBe(75);
    });

    it('reports critical at 90%+ tokens', () => {
        const monitor = new ContextHealthMonitor(100_000);
        const report = monitor.assess({
            currentTokens: 95_000,
            contextVersions: [],
            memoryUsedBytes: 100_000,
            memoryLimitBytes: 500_000,
        });
        expect(report.health).toBe('critical');
    });

    it('detects memory pressure', () => {
        const monitor = new ContextHealthMonitor(100_000);
        const report = monitor.assess({
            currentTokens: 10_000,
            contextVersions: [],
            memoryUsedBytes: 450_000,
            memoryLimitBytes: 500_000,
        });
        expect(report.memoryPressure).toBe(true);
        expect(report.health).toBe('critical');
    });
});

// --- HealthDashboard ---
describe('HealthDashboard', () => {
    it('returns full report with healthy overall', () => {
        const sc = new SelfCheck();
        const monitor = new ContextHealthMonitor(100_000);
        const dashboard = new HealthDashboard(sc, monitor);
        const report = dashboard.getFullReport({
            currentTokens: 20_000,
            contextVersions: [{ lastUpdated: Date.now() }],
            memoryUsedBytes: 100_000,
            memoryLimitBytes: 500_000,
        });
        expect(report.overallHealth).toBe('healthy');
        expect(report.context.health).toBe('healthy');
    });

    it('overall critical when selfcheck has failure', async () => {
        const sc = new SelfCheck();
        await sc.check('api', async () => ({ passed: false, details: 'Down' }));
        const monitor = new ContextHealthMonitor(100_000);
        const dashboard = new HealthDashboard(sc, monitor);
        const report = dashboard.getFullReport({
            currentTokens: 20_000,
            contextVersions: [],
            memoryUsedBytes: 100_000,
            memoryLimitBytes: 500_000,
        });
        expect(report.overallHealth).toBe('critical');
        expect(report.selfCheck.lastFailed?.level).toBe('api');
    });
});



