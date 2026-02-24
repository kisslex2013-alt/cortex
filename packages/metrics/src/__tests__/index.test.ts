import { describe, it, expect } from 'vitest';
import { MetricBus, emitBrainMetrics, emitSwarmMetrics } from '../index.js';

describe('MetricBus', () => {
    it('emits and stores events', () => {
        const bus = new MetricBus();
        bus.emit('brain.tokens_used', 150, { provider: 'gemini' });
        expect(bus.size()).toBe(1);
        expect(bus.recent(1)[0].name).toBe('brain.tokens_used');
    });

    it('respects ring buffer limit', () => {
        const bus = new MetricBus(3);
        bus.emit('a', 1);
        bus.emit('b', 2);
        bus.emit('c', 3);
        bus.emit('d', 4);
        expect(bus.size()).toBe(3);
        expect(bus.recent(3)[0].name).toBe('b'); // 'a' was evicted
    });

    it('handles wildcard subscriptions', () => {
        const bus = new MetricBus();
        const received: string[] = [];
        bus.on('brain.*', (e) => received.push(e.name));
        bus.emit('brain.tokens_used', 100);
        bus.emit('brain.latency', 50);
        bus.emit('swarm.agent_spawned', 1);
        expect(received).toEqual(['brain.tokens_used', 'brain.latency']);
    });

    it('snapshot groups by prefix', () => {
        const bus = new MetricBus();
        bus.emit('brain.tokens_used', 100);
        bus.emit('swarm.agent_spawned', 1);
        const snap = bus.snapshot();
        expect(Object.keys(snap)).toContain('brain');
        expect(Object.keys(snap)).toContain('swarm');
        expect(snap['brain'].length).toBe(1);
    });

    it('clears buffer', () => {
        const bus = new MetricBus();
        bus.emit('test', 1);
        bus.clear();
        expect(bus.size()).toBe(0);
    });
});

describe('Collectors', () => {
    it('emitBrainMetrics sends 2-3 events', () => {
        const bus = new MetricBus();
        emitBrainMetrics(bus, { tokensUsed: 100, provider: 'gemini', latencyMs: 200, cached: true });
        expect(bus.size()).toBe(3); // tokens + latency + cache_hit
    });

    it('emitSwarmMetrics sends 2 events', () => {
        const bus = new MetricBus();
        emitSwarmMetrics(bus, { role: 'coder', budgetRemaining: 5000 });
        expect(bus.size()).toBe(2);
    });
});
