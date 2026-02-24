/**
 * @jarvis/sandbox-policy — Risk Engine + File Guard
 *
 * Policy Engine: LOW/MED/HIGH risk classification + approval gates
 * File Guard: allowlist/denylist for file operations
 * Redaction Layer: mask secrets in outputs
 *
 * @scope runtime — оценивает риск в реальном времени (не pre-commit)
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PolicyDecision {
    risk: RiskLevel;
    score: number;
    approved: boolean;
    reason: string;
    requiresHumanApproval: boolean;
}

export interface ActionContext {
    action: string;
    target: string;
    reversible?: boolean;
    sensitiveData?: boolean;
    urgent?: boolean;
}

// --- Risk Engine ---

const ACTION_WEIGHTS: Record<string, number> = {
    read: 0.1, search: 0.1, format: 0.1,
    write: 0.3, create: 0.3, edit: 0.3,
    execute: 0.5, install: 0.5,
    deploy: 0.9, delete: 0.8, secrets: 0.9, system: 0.9,
};

const TARGET_WEIGHTS: Record<string, number> = {
    sandbox: 0.1, workspace: 0.3,
    config: 0.6, memory: 0.5,
    production: 0.9, system: 0.9,
};

export function assess(ctx: ActionContext): PolicyDecision {
    const actionWeight = ACTION_WEIGHTS[ctx.action] ?? 0.5;
    const targetWeight = TARGET_WEIGHTS[ctx.target] ?? 0.5;
    const reversibilityWeight = ctx.reversible === false ? 0.9 : 0.2;
    const sensitivityWeight = ctx.sensitiveData ? 0.9 : 0.1;
    const urgencyWeight = ctx.urgent ? 0.7 : 0.3;

    const score =
        actionWeight * 0.30 +
        targetWeight * 0.25 +
        reversibilityWeight * 0.20 +
        sensitivityWeight * 0.15 +
        urgencyWeight * 0.10;

    let risk: RiskLevel;
    let approved: boolean;
    let requiresHumanApproval: boolean;

    if (score < 0.3) {
        risk = 'LOW';
        approved = true;
        requiresHumanApproval = false;
    } else if (score < 0.7) {
        risk = 'MEDIUM';
        approved = true; // rule-based auto
        requiresHumanApproval = false;
    } else {
        risk = 'HIGH';
        approved = false;
        requiresHumanApproval = true;
    }

    return {
        risk,
        score: Math.round(score * 100) / 100,
        approved,
        reason: `action=${ctx.action}(${actionWeight}), target=${ctx.target}(${targetWeight})`,
        requiresHumanApproval,
    };
}

// --- File Guard ---

const DENIED_PATTERNS = [
    '.env', '.pem', '.key',
    'SOUL.md', 'AGENTS.md',
    'node_modules', '.git',
];

const DENIED_PATH_PATTERNS = ['../', '..\\'];

export function isPathAllowed(path: string, allowedRoots: string[] = ['workspace/']): {
    allowed: boolean;
    reason?: string;
} {
    // Check path traversal
    for (const pattern of DENIED_PATH_PATTERNS) {
        if (path.includes(pattern)) {
            return { allowed: false, reason: `Path traversal detected: ${pattern}` };
        }
    }

    // Check denied files
    for (const denied of DENIED_PATTERNS) {
        if (path.includes(denied)) {
            return { allowed: false, reason: `Denied file pattern: ${denied}` };
        }
    }

    // Check allowed roots
    const inAllowedRoot = allowedRoots.some(root => path.startsWith(root));
    if (!inAllowedRoot) {
        return { allowed: false, reason: `Path not in allowed roots: ${allowedRoots.join(', ')}` };
    }

    return { allowed: true };
}

// --- Redaction Layer ---

const REDACTION_PATTERNS: [RegExp, string][] = [
    [/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED:API_KEY]'],
    [/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED:API_KEY]'],
    [/gsk_[a-zA-Z0-9]{20,}/g, '[REDACTED:API_KEY]'],
    [/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED:GITHUB_TOKEN]'],
    [/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED:TOKEN]'],
    [/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED:JWT]'],
    [/password\s*[:=]\s*\S+/gi, 'password=[REDACTED:PASSWORD]'],
];

export function redact(text: string): string {
    let result = text;
    for (const [pattern, replacement] of REDACTION_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

// --- Approval Table (из DO Framework) ---

export type ApprovalRequirement = 'none' | 'notify' | 'required' | 'mandatory';

export interface OperationApproval {
    operation: string;
    approval: ApprovalRequirement;
    description: string;
}

/** Таблица approval по типам операций (вдохновлено temp/Agents) */
export const OPERATION_APPROVAL_TABLE: OperationApproval[] = [
    // Без подтверждения
    { operation: 'file_read', approval: 'none', description: 'Чтение файлов' },
    { operation: 'file_create', approval: 'none', description: 'Создание новых файлов' },
    { operation: 'api_get', approval: 'none', description: 'GET-запросы к API' },
    { operation: 'search', approval: 'none', description: 'Поиск информации' },
    { operation: 'format', approval: 'none', description: 'Форматирование кода' },
    { operation: 'analyze', approval: 'none', description: 'Анализ данных' },

    // Уведомление
    { operation: 'file_modify', approval: 'notify', description: 'Изменение существующих файлов' },
    { operation: 'git_commit', approval: 'notify', description: 'Коммит в не-main ветку' },
    { operation: 'api_post', approval: 'notify', description: 'POST-запросы (context-dependent)' },
    { operation: 'install_dep', approval: 'notify', description: 'Установка зависимостей' },

    // Требует подтверждения
    { operation: 'file_delete', approval: 'required', description: 'Удаление файлов' },
    { operation: 'message_send', approval: 'required', description: 'Отправка сообщений (Telegram, email)' },
    { operation: 'content_publish', approval: 'required', description: 'Публикация контента' },
    { operation: 'deploy', approval: 'required', description: 'Деплой на production' },

    // Обязательное подтверждение
    { operation: 'financial', approval: 'mandatory', description: 'Финансовые операции' },
    { operation: 'secrets_access', approval: 'mandatory', description: 'Доступ к секретам' },
    { operation: 'system_modify', approval: 'mandatory', description: 'Системные изменения' },
    { operation: 'policy_modify', approval: 'mandatory', description: 'Изменение Policy/Security' },
];

/** Получить уровень approval для операции */
export function getApproval(operation: string): ApprovalRequirement {
    const entry = OPERATION_APPROVAL_TABLE.find(e => e.operation === operation);
    return entry?.approval ?? 'required'; // unknown = required (safe default)
}

// --- Clarification Module (из DO Framework) ---

export interface ClarificationContext {
    hasMultipleInterpretations: boolean;
    isDestructive: boolean;
    affectsExternalServices: boolean;
    highErrorCost: boolean;
    missingData: boolean;
}

/**
 * Модуль уточнения: нужно ли спрашивать пользователя?
 * (идея из DO Framework / temp/Agents)
 *
 * true = СПРОСИТЬ пользователя
 * false = ДЕЙСТВОВАТЬ автономно
 */
export function shouldAskUser(ctx: ClarificationContext): {
    shouldAsk: boolean;
    reasons: string[];
} {
    const reasons: string[] = [];

    if (ctx.hasMultipleInterpretations) reasons.push('Задача имеет несколько интерпретаций');
    if (ctx.isDestructive) reasons.push('Деструктивная операция (удаление, перезапись)');
    if (ctx.affectsExternalServices) reasons.push('Затрагивает внешние сервисы');
    if (ctx.highErrorCost) reasons.push('Высокая стоимость ошибки');
    if (ctx.missingData) reasons.push('Нужны данные, которых нет в контексте');

    return {
        shouldAsk: reasons.length > 0,
        reasons,
    };
}

