import { describe, it, expect } from 'vitest';
import { createKernel } from '@jarvis/core';
import { SelfCheck, ContextHealthMonitor, HealthDashboard } from '@jarvis/watchdog';

describe('@jarvis/cli', () => {
    // CLI commands delegate to core API — we test that the APIs work correctly

    it('start: kernel starts in specified mode', async () => {
        const kernel = createKernel({ mode: 'minimal' });
        await kernel.start();
        expect(kernel.isRunning()).toBe(true);
        expect(kernel.getConfig().mode).toBe('minimal');
        await kernel.stop();
    });

    it('stop: kernel stops cleanly', async () => {
        const kernel = createKernel();
        await kernel.start();
        await kernel.stop();
        expect(kernel.isRunning()).toBe(false);
    });

    it('status: returns config and running state', () => {
        const kernel = createKernel();
        const config = kernel.getConfig();
        expect(config.name).toBe('Jarvis');
        expect(config.version).toBe('0.1.0');
        expect(config.mode).toBe('auto');
        expect(kernel.isRunning()).toBe(false);
    });

    it('doctor: HealthDashboard returns full report', async () => {
        const selfCheck = new SelfCheck();
        const monitor = new ContextHealthMonitor();
        const dashboard = new HealthDashboard(selfCheck, monitor);

        await selfCheck.check('syntax', async () => ({ passed: true, details: 'OK' }));
        await selfCheck.check('execution', async () => ({ passed: true, details: 'OK' }));
        await selfCheck.check('api', async () => ({ passed: true, details: 'OK' }));
        await selfCheck.check('logic', async () => ({ passed: true, details: 'OK' }));

        const report = dashboard.getFullReport({
            currentTokens: 20_000,
            contextVersions: [{ lastUpdated: Date.now() }],
            memoryUsedBytes: 100_000_000,
            memoryLimitBytes: 512_000_000,
        });

        expect(report.overallHealth).toBe('healthy');
        expect(report.selfCheck.history.length).toBe(4);
        expect(report.context.health).toBe('healthy');
    });
});
