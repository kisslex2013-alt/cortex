/**
 * @jarvis/memory — Multi-level Memory
 *
 * Три уровня:
 * - Fast (working): RAM, текущая сессия
 * - Long (facts): SQLite + FTS5, персистентные факты
 * - Vector (RAG): семантический поиск (v1, placeholder)
 */

export type Confidence = 'high' | 'medium' | 'low';
export type FactCategory = 'personal' | 'tech' | 'financial' | 'incident' | 'directive';

export interface Fact {
    id: string;
    content: string;
    category: FactCategory;
    confidence: Confidence;
    source: string;
    createdAt: number;
    accessCount: number;
    expiresAt: number | null;
}

export interface MemorySearchResult {
    fact: Fact;
    relevance: number;
}

export interface MemoryStats {
    totalFacts: number;
    byCategory: Record<string, number>;
    oldestFact: number | null;
    dbSizeBytes: number;
}

// --- Fast Memory (session-scoped, in-RAM) ---

export class FastMemory {
    private store: Map<string, unknown> = new Map();

    set(key: string, value: unknown): void {
        this.store.set(key, value);
    }

    get<T = unknown>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }

    has(key: string): boolean {
        return this.store.has(key);
    }

    delete(key: string): boolean {
        return this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }

    size(): number {
        return this.store.size;
    }
}

// --- Long Memory (persistent, facts) ---

export class LongMemory {
    private facts: Map<string, Fact> = new Map();
    private nextId = 1;

    /** Add a fact with deduplication */
    add(content: string, category: FactCategory, options?: {
        confidence?: Confidence;
        source?: string;
        ttlDays?: number;
    }): Fact {
        // Dedup check: if similar fact exists (similarity >= 0.85), merge
        const existing = this.searchInternal(content, 1);
        if (existing.length > 0 && existing[0].relevance >= 0.85) {
            const fact = existing[0].fact;
            fact.accessCount++;
            fact.createdAt = Date.now(); // refresh timestamp
            return fact;
        }

        const id = `fact_${this.nextId++}`;
        const ttlMs = (options?.ttlDays ?? 90) * 86400_000;
        const fact: Fact = {
            id,
            content,
            category,
            confidence: options?.confidence ?? 'medium',
            source: options?.source ?? 'unknown',
            createdAt: Date.now(),
            accessCount: 0,
            expiresAt: Date.now() + ttlMs,
        };
        this.facts.set(id, fact);
        return fact;
    }

    /** Search facts by query */
    search(query: string, limit = 5): MemorySearchResult[] {
        return this.searchInternal(query, limit);
    }

    /** Get a fact by ID */
    get(id: string): Fact | undefined {
        const fact = this.facts.get(id);
        if (fact) fact.accessCount++;
        return fact;
    }

    /** Delete a fact */
    delete(id: string): boolean {
        return this.facts.delete(id);
    }

    /** Run garbage collection */
    gc(): { deleted: number; archived: number } {
        const now = Date.now();
        let deleted = 0;
        for (const [id, fact] of this.facts) {
            if (fact.expiresAt && fact.expiresAt < now) {
                this.facts.delete(id);
                deleted++;
            }
        }
        return { deleted, archived: 0 };
    }

    /** Stats */
    stats(): MemoryStats {
        const byCategory: Record<string, number> = {};
        let oldest: number | null = null;
        for (const fact of this.facts.values()) {
            byCategory[fact.category] = (byCategory[fact.category] ?? 0) + 1;
            if (oldest === null || fact.createdAt < oldest) oldest = fact.createdAt;
        }
        return {
            totalFacts: this.facts.size,
            byCategory,
            oldestFact: oldest,
            dbSizeBytes: 0, // placeholder
        };
    }

    /** Export all facts */
    export(): Fact[] {
        return [...this.facts.values()];
    }

    private searchInternal(query: string, limit: number): MemorySearchResult[] {
        const queryLower = query.toLowerCase();
        const results: MemorySearchResult[] = [];
        for (const fact of this.facts.values()) {
            const contentLower = fact.content.toLowerCase();
            if (contentLower.includes(queryLower) || queryLower.includes(contentLower.slice(0, 20))) {
                const relevance = this.similarity(queryLower, contentLower);
                results.push({ fact, relevance });
            }
        }
        return results
            .sort((a, b) => {
                // Sort: confidence DESC, relevance DESC
                const confOrder = { high: 3, medium: 2, low: 1 };
                const confDiff = confOrder[b.fact.confidence] - confOrder[a.fact.confidence];
                return confDiff !== 0 ? confDiff : b.relevance - a.relevance;
            })
            .slice(0, limit);
    }

    private similarity(a: string, b: string): number {
        if (a === b) return 1;
        const shorter = a.length < b.length ? a : b;
        const longer = a.length >= b.length ? a : b;
        if (longer.length === 0) return 1;
        const matches = shorter.split(' ').filter(w => longer.includes(w)).length;
        const total = shorter.split(' ').length;
        return total > 0 ? matches / total : 0;
    }
}

// --- Factory ---

export function createMemory() {
    return {
        fast: new FastMemory(),
        long: new LongMemory(),
    };
}

// --- Codebase Mapper (из ARC Protocol) ---

import type { CodebaseMapEntry } from '@jarvis/shared-types';
export type { CodebaseMapEntry };

/**
 * CodebaseMapper — автогенерация карты проекта (идея из ARC Protocol).
 * "CODEBASE_MAP.md teaches the agents your style."
 * Coordinator использует карту для контекста при планировании.
 */
export class CodebaseMapper {
    private entries: Map<string, CodebaseMapEntry> = new Map();

    /** Добавить файл/директорию в карту */
    addEntry(entry: CodebaseMapEntry): void {
        this.entries.set(entry.path, entry);
    }

    /** Получить entry по пути */
    getEntry(path: string): CodebaseMapEntry | undefined {
        return this.entries.get(path);
    }

    /** Поиск по паттерну (простой glob) */
    find(pattern: string): CodebaseMapEntry[] {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return [...this.entries.values()].filter(e => regex.test(e.path));
    }

    /** Генерация summary для LLM контекста (компактный формат) */
    toSummary(maxEntries = 20): string {
        const entries = [...this.entries.values()].slice(0, maxEntries);
        return entries.map(e => {
            const exports = e.exports?.length ? ` [exports: ${e.exports.join(', ')}]` : '';
            const deps = e.dependencies?.length ? ` [deps: ${e.dependencies.join(', ')}]` : '';
            return `${e.type === 'directory' ? '📁' : '📄'} ${e.path}: ${e.description}${exports}${deps}`;
        }).join('\n');
    }

    /** Общая статистика */
    stats(): { files: number; directories: number; totalLines: number } {
        let files = 0, directories = 0, totalLines = 0;
        for (const e of this.entries.values()) {
            if (e.type === 'file') { files++; totalLines += e.linesOfCode ?? 0; }
            else directories++;
        }
        return { files, directories, totalLines };
    }

    /** Все entries */
    getAll(): CodebaseMapEntry[] {
        return [...this.entries.values()];
    }
}

