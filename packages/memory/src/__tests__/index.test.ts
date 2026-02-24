import { describe, it, expect } from 'vitest';
import { createMemory, CodebaseMapper } from '../index.js';

describe('@jarvis/memory', () => {
    it('creates memory with fast and long', () => {
        const mem = createMemory();
        expect(mem.fast).toBeDefined();
        expect(mem.long).toBeDefined();
    });

    it('fast memory: set/get/delete', () => {
        const { fast } = createMemory();
        fast.set('key', 'value');
        expect(fast.get('key')).toBe('value');
        fast.delete('key');
        expect(fast.has('key')).toBe(false);
    });

    it('long memory: add and search', () => {
        const { long } = createMemory();
        long.add('TypeScript is great', 'tech', { confidence: 'high' });
        const results = long.search('TypeScript');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].fact.content).toContain('TypeScript');
    });

    it('long memory: deduplicates similar facts', () => {
        const { long } = createMemory();
        long.add('Node.js version 22 installed', 'tech');
        long.add('Node.js version 22 installed', 'tech');
        expect(long.stats().totalFacts).toBe(1);
    });

    it('long memory: GC removes expired', () => {
        const { long } = createMemory();
        const fact = long.add('temp fact', 'incident', { ttlDays: 0 });
        // Force expire
        fact.expiresAt = Date.now() - 1000;
        const result = long.gc();
        expect(result.deleted).toBe(1);
    });

    it('long memory: export', () => {
        const { long } = createMemory();
        long.add('fact 1', 'personal');
        long.add('fact 2', 'tech');
        expect(long.export().length).toBe(2);
    });
});

// --- CodebaseMapper (из ARC Protocol) ---
describe('CodebaseMapper', () => {
    it('adds and retrieves entries', () => {
        const mapper = new CodebaseMapper();
        mapper.addEntry({ path: 'src/index.ts', type: 'file', description: 'Main entry', exports: ['main'] });
        expect(mapper.getEntry('src/index.ts')).toBeDefined();
    });

    it('finds by pattern', () => {
        const mapper = new CodebaseMapper();
        mapper.addEntry({ path: 'src/utils/helper.ts', type: 'file', description: 'Helpers' });
        mapper.addEntry({ path: 'src/utils/format.ts', type: 'file', description: 'Formatters' });
        mapper.addEntry({ path: 'src/core/engine.ts', type: 'file', description: 'Engine' });
        const utils = mapper.find('utils');
        expect(utils.length).toBe(2);
    });

    it('generates summary', () => {
        const mapper = new CodebaseMapper();
        mapper.addEntry({ path: 'src/index.ts', type: 'file', description: 'Main entry', exports: ['start'] });
        mapper.addEntry({ path: 'packages/', type: 'directory', description: 'Monorepo packages' });
        const summary = mapper.toSummary();
        expect(summary).toContain('📄 src/index.ts');
        expect(summary).toContain('📁 packages/');
        expect(summary).toContain('[exports: start]');
    });

    it('calculates stats', () => {
        const mapper = new CodebaseMapper();
        mapper.addEntry({ path: 'a.ts', type: 'file', description: 'A', linesOfCode: 100 });
        mapper.addEntry({ path: 'b.ts', type: 'file', description: 'B', linesOfCode: 200 });
        mapper.addEntry({ path: 'src/', type: 'directory', description: 'Src' });
        const stats = mapper.stats();
        expect(stats.files).toBe(2);
        expect(stats.directories).toBe(1);
        expect(stats.totalLines).toBe(300);
    });
});

