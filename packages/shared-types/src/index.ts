/**
 * @jarvis/shared-types — Общие типы для всех пакетов Jarvis
 *
 * Единственный источник правды для интерфейсов,
 * используемых в нескольких пакетах.
 */

// --- Codebase Map ---

/** Запись карты кодовой базы (используется в memory и swarm) */
export interface CodebaseMapEntry {
    path: string;
    type: 'file' | 'directory';
    description: string;
    exports?: string[];
    dependencies?: string[];
    linesOfCode?: number;
}
