import { describe, it, expect } from 'vitest';
import { createKernel, Kernel } from '../index.js';

describe('@jarvis/core', () => {
    it('creates kernel with default config', () => {
        const kernel = createKernel();
        expect(kernel).toBeInstanceOf(Kernel);
        expect(kernel.getConfig().name).toBe('Jarvis');
        expect(kernel.getConfig().mode).toBe('auto');
    });

    it('creates kernel with custom config', () => {
        const kernel = createKernel({ name: 'Cortex', mode: 'minimal' });
        expect(kernel.getConfig().name).toBe('Cortex');
        expect(kernel.getConfig().mode).toBe('minimal');
    });

    it('starts and stops', async () => {
        const kernel = createKernel();
        await kernel.start();
        expect(kernel.isRunning()).toBe(true);
        await kernel.stop();
        expect(kernel.isRunning()).toBe(false);
    });

    it('registers and lists plugins', async () => {
        const kernel = createKernel();
        await kernel.register({
            name: 'test-plugin',
            version: '1.0.0',
            init: async () => { },
        });
        expect(kernel.getPluginNames()).toContain('test-plugin');
    });

    it('dispatches events to handlers', async () => {
        const kernel = createKernel();
        const received: string[] = [];
        kernel.on('test', async (e) => {
            received.push(e.type);
        });
        await kernel.dispatch({ type: 'test', source: 'unit', payload: null, timestamp: Date.now() });
        expect(received).toEqual(['test']);
    });

    it('rejects duplicate plugin names', async () => {
        const kernel = createKernel();
        const plugin = { name: 'dup', version: '1.0.0', init: async () => { } };
        await kernel.register(plugin);
        await expect(kernel.register(plugin)).rejects.toThrow('already registered');
    });

    it('health check returns all plugins healthy by default', async () => {
        const kernel = createKernel();
        await kernel.register({ name: 'p1', version: '1.0.0', init: async () => { } });
        const health = await kernel.healthCheck();
        expect(health.get('p1')).toBe(true);
    });
});
