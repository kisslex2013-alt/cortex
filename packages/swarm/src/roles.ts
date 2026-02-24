/**
 * @jarvis/swarm — Agent Roles
 *
 * 15 ролей: 5 LLM, 3 гибридных, 7 инструментальных
 */

import type { AgentType } from './dag.js';

export interface RoleDefinition {
    name: string;
    type: AgentType;
    description: string;
    avgTokens: number;       // средний расход за вызов
    skipCondition: string;    // когда НЕ создавать
    category: 'llm' | 'hybrid' | 'tool';
}

export const ROLES: Record<string, RoleDefinition> = {
    // --- LLM Agents ---
    planner: {
        name: 'Planner',
        type: 'llm',
        description: 'Декомпозиция задачи в DAG',
        avgTokens: 1000,
        skipCondition: 'Задача тривиальная (1 файл, 1 действие)',
        category: 'llm',
    },
    architect: {
        name: 'Architect',
        type: 'llm',
        description: 'Принятие архитектурных решений',
        avgTokens: 2000,
        skipCondition: 'Задача в рамках одного модуля',
        category: 'llm',
    },
    researcher: {
        name: 'Researcher',
        type: 'llm',
        description: 'Поиск документации и best practices',
        avgTokens: 800,
        skipCondition: 'Информация уже в Memory',
        category: 'llm',
    },
    reviewer: {
        name: 'Reviewer',
        type: 'llm',
        description: 'Проверка качества кода и решений',
        avgTokens: 600,
        skipCondition: 'Изменение < 10 строк и LOW risk',
        category: 'llm',
    },
    refactorAdvisor: {
        name: 'Refactor Advisor',
        type: 'llm',
        description: 'Предложения по улучшению кода',
        avgTokens: 800,
        skipCondition: 'Не free_time режим',
        category: 'llm',
    },

    // --- Hybrid Agents (LLM + tools) ---
    coder: {
        name: 'Coder',
        type: 'hybrid',
        description: 'Написание и редактирование кода',
        avgTokens: 1500,
        skipCondition: 'Задача чисто конфигурационная',
        category: 'hybrid',
    },
    debugger: {
        name: 'Debugger',
        type: 'hybrid',
        description: 'Анализ ошибок и исправление',
        avgTokens: 1200,
        skipCondition: 'Ошибка из известных паттернов (.learnings/)',
        category: 'hybrid',
    },
    optimizer: {
        name: 'Optimizer',
        type: 'hybrid',
        description: 'Профилирование и оптимизация',
        avgTokens: 1000,
        skipCondition: 'CPU < 50%, нет bottleneck',
        category: 'hybrid',
    },

    // --- Tool Agents (0 LLM tokens) ---
    tester: {
        name: 'Tester',
        type: 'tool',
        description: 'Запуск vitest и сбор результатов',
        avgTokens: 0,
        skipCondition: 'Нет тестовых файлов',
        category: 'tool',
    },
    linter: {
        name: 'Linter',
        type: 'tool',
        description: 'Запуск ESLint',
        avgTokens: 0,
        skipCondition: 'Нет .ts файлов в scope',
        category: 'tool',
    },
    staticAnalyzer: {
        name: 'Static Analyzer',
        type: 'tool',
        description: 'AST-анализ мёртвого кода и complexity',
        avgTokens: 0,
        skipCondition: 'Файл < 50 строк',
        category: 'tool',
    },
    securityScanner: {
        name: 'Security Scanner',
        type: 'tool',
        description: 'Паттерн-scan eval/secrets/fs/fetch',
        avgTokens: 0,
        skipCondition: 'Нет нового кода',
        category: 'tool',
    },
    dependencyChecker: {
        name: 'Dependency Checker',
        type: 'tool',
        description: 'npm outdated + vulnerability check',
        avgTokens: 0,
        skipCondition: 'Нет изменений в package.json',
        category: 'tool',
    },
    formatter: {
        name: 'Formatter',
        type: 'tool',
        description: 'Автоформатирование кода',
        avgTokens: 0,
        skipCondition: 'Код уже форматирован',
        category: 'tool',
    },
    diffGenerator: {
        name: 'Diff Generator',
        type: 'tool',
        description: 'git diff + structured output',
        avgTokens: 0,
        skipCondition: 'Нет изменений в git',
        category: 'tool',
    },

    // --- Domain Agents (из oh-my-ag) ---
    frontendAgent: {
        name: 'Frontend Agent',
        type: 'hybrid',
        description: 'React/Vue/HTML/CSS специалист',
        avgTokens: 1200,
        skipCondition: 'Задача не связана с UI',
        category: 'hybrid',
    },
    backendAgent: {
        name: 'Backend Agent',
        type: 'hybrid',
        description: 'API/DB/server logic специалист',
        avgTokens: 1200,
        skipCondition: 'Задача не связана с серверной частью',
        category: 'hybrid',
    },
    mobileAgent: {
        name: 'Mobile Agent',
        type: 'hybrid',
        description: 'React Native / Flutter специалист',
        avgTokens: 1200,
        skipCondition: 'Нет мобильной кодовой базы',
        category: 'hybrid',
    },
    qaAgent: {
        name: 'QA Agent',
        type: 'hybrid',
        description: 'E2E тесты, integration тесты, test coverage',
        avgTokens: 800,
        skipCondition: 'Изменение < 5 строк',
        category: 'hybrid',
    },
    debugAgent: {
        name: 'Debug Agent',
        type: 'hybrid',
        description: 'Stacktrace analysis, bisect, root cause',
        avgTokens: 1000,
        skipCondition: 'Нет ошибки для анализа',
        category: 'hybrid',
    },
};

export function getRole(name: string): RoleDefinition | undefined {
    return ROLES[name];
}

export function getRolesByCategory(category: 'llm' | 'hybrid' | 'tool'): RoleDefinition[] {
    return Object.values(ROLES).filter(r => r.category === category);
}

export function getAllRoles(): RoleDefinition[] {
    return Object.values(ROLES);
}

// --- Auto-Fix Patterns (из DO Framework) ---

export interface AutoFixPattern {
    errorPattern: string | RegExp;
    fix: string;
    category: 'syntax' | 'runtime' | 'api' | 'logic';
    isAutomatic: boolean;  // можно ли применить без LLM
}

/** Известные паттерны ошибок → автоматическое исправление (0 токенов) */
export const KNOWN_FIX_PATTERNS: AutoFixPattern[] = [
    // Syntax / Import
    { errorPattern: 'ModuleNotFoundError', fix: 'npm install <module>', category: 'syntax', isAutomatic: true },
    { errorPattern: 'Cannot find module', fix: 'Check import path and package.json', category: 'syntax', isAutomatic: true },
    { errorPattern: 'SyntaxError', fix: 'Run linter first, check brackets/semicolons', category: 'syntax', isAutomatic: false },

    // Runtime
    { errorPattern: 'TypeError: Cannot read properties of undefined', fix: 'Add null check or optional chaining', category: 'runtime', isAutomatic: false },
    { errorPattern: 'RangeError: Maximum call stack', fix: 'Check recursion depth, add base case', category: 'runtime', isAutomatic: false },
    { errorPattern: 'ENOENT', fix: 'Create directory/file before access', category: 'runtime', isAutomatic: true },
    { errorPattern: 'EACCES', fix: 'Check file permissions', category: 'runtime', isAutomatic: false },
    { errorPattern: 'EADDRINUSE', fix: 'Kill process on port or use different port', category: 'runtime', isAutomatic: true },

    // API
    { errorPattern: /429|rate.?limit/i, fix: 'Wait + retry with exponential backoff', category: 'api', isAutomatic: true },
    { errorPattern: /timeout/i, fix: 'Increase timeout, retry', category: 'api', isAutomatic: true },
    { errorPattern: 'ECONNREFUSED', fix: 'Check service availability, retry with backoff', category: 'api', isAutomatic: true },
    { errorPattern: /5\d{2}/, fix: 'Server error — retry with backoff', category: 'api', isAutomatic: true },

    // Logic
    { errorPattern: 'JSON', fix: 'Try alternative parsing, validate input', category: 'logic', isAutomatic: false },
    { errorPattern: 'KeyError', fix: 'Use .get() or optional chaining, check structure', category: 'logic', isAutomatic: false },
];

/** Найти auto-fix для ошибки (Debugger role pre-check, 0 токенов) */
export function tryAutoFix(errorMessage: string): AutoFixPattern | undefined {
    return KNOWN_FIX_PATTERNS.find(p => {
        if (typeof p.errorPattern === 'string') {
            return errorMessage.includes(p.errorPattern);
        }
        return p.errorPattern.test(errorMessage);
    });
}

