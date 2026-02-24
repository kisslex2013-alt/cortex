/**
 * @jarvis/skills — Skill Loader & Validator
 *
 * Загрузка, валидация и управление навыками в формате SKILL.md
 */

export interface SkillDefinition {
    name: string;
    version: string;
    description: string;
    author?: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    sandbox: boolean;
    inputs: SkillInput[];
    outputs: SkillOutput[];
    instructions: string;
}

export interface SkillInput {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    default?: unknown;
}

export interface SkillOutput {
    name: string;
    type: string;
    description?: string;
}

export interface SkillValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

// --- Loader ---

export function parseSkillMd(content: string): SkillDefinition {
    const lines = content.split('\n');
    const frontmatter: Record<string, string> = {};

    // Parse YAML frontmatter
    let inFrontmatter = false;
    let instructionStart = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '---' && !inFrontmatter) { inFrontmatter = true; continue; }
        if (line === '---' && inFrontmatter) { instructionStart = i + 1; break; }
        if (inFrontmatter && line.includes(':')) {
            const [key, ...rest] = line.split(':');
            frontmatter[key.trim()] = rest.join(':').trim();
        }
    }

    const instructions = lines.slice(instructionStart).join('\n').trim();

    return {
        name: frontmatter['name'] ?? 'unnamed',
        version: frontmatter['version'] ?? '0.0.0',
        description: frontmatter['description'] ?? '',
        author: frontmatter['author'],
        riskLevel: (frontmatter['risk_level'] as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'LOW',
        sandbox: frontmatter['sandbox'] !== 'false',
        inputs: [],
        outputs: [],
        instructions,
    };
}

// --- Validator ---

export function validateSkill(skill: SkillDefinition): SkillValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!skill.name || skill.name === 'unnamed') errors.push('Skill must have a name');
    if (!skill.version || skill.version === '0.0.0') warnings.push('Version not set');
    if (!skill.description) warnings.push('No description provided');
    if (!skill.instructions) errors.push('Skill must have instructions');
    if (skill.riskLevel === 'HIGH' && !skill.sandbox) {
        errors.push('HIGH risk skills must run in sandbox');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// --- DO Framework: Directive → Execution → Output (из temp/Agents) ---

export type SkillStage = 'directive' | 'execution' | 'output';

export interface SkillExecutionReport {
    skillName: string;
    stage: SkillStage;
    status: 'success' | 'partial' | 'error';
    startedAt: number;
    completedAt: number;
    metrics: {
        durationMs: number;
        apiCalls: number;
        itemsProcessed: number;
    };
    nextSteps: string[];
    errors: string[];
}

/**
 * DO Framework lifecycle для навыков:
 * 1. DIRECTIVE — понять задачу, выбрать навык, задать уточняющие вопросы
 * 2. EXECUTION — запустить скрипт, self-check, auto-fix (до 3 попыток)
 * 3. OUTPUT — сохранить результат, вернуть отчёт пользователю
 */
export class SkillLifecycle {
    private stage: SkillStage = 'directive';
    private skill: SkillDefinition | null = null;
    private startTime = 0;
    /** B3: optional contract checker (contracts → skills) */
    private contractChecker?: (changedFiles: string[]) => { allPassed: boolean; violations: string[] };

    /** Шаг 1: Directive — выбор и подготовка навыка */
    setDirective(skill: SkillDefinition): { stage: SkillStage; skill: string } {
        this.skill = skill;
        this.stage = 'directive';
        this.startTime = Date.now();
        return { stage: this.stage, skill: skill.name };
    }

    /** Шаг 2: Execution — выполнение */
    beginExecution(): { stage: SkillStage; skill: string } {
        if (!this.skill) throw new Error('Directive not set — call setDirective() first');
        this.stage = 'execution';
        return { stage: this.stage, skill: this.skill.name };
    }

    /** Шаг 3: Output — финализация и отчёт */
    complete(metrics: { apiCalls: number; itemsProcessed: number }, errors: string[] = [], changedFiles: string[] = []): SkillExecutionReport {
        if (!this.skill) throw new Error('Directive not set');
        this.stage = 'output';
        const completedAt = Date.now();

        // B3: contract check before output
        if (this.contractChecker && changedFiles.length > 0) {
            const contractResult = this.contractChecker(changedFiles);
            if (!contractResult.allPassed) {
                errors.push(...contractResult.violations);
            }
        }

        return {
            skillName: this.skill.name,
            stage: this.stage,
            status: errors.length > 0 ? (errors.length < 3 ? 'partial' : 'error') : 'success',
            startedAt: this.startTime,
            completedAt,
            metrics: {
                durationMs: completedAt - this.startTime,
                ...metrics,
            },
            nextSteps: [],
            errors,
        };
    }

    getStage(): SkillStage { return this.stage; }
    getSkill(): SkillDefinition | null { return this.skill; }
}

// --- Structured Task Format (из GSD XML Task Format) ---

export type TaskType = 'auto' | 'manual' | 'review';

export interface StructuredTask {
    name: string;
    type: TaskType;
    files: string[];
    action: string;
    verify: string;     // как проверить что задача выполнена
    done: string;       // критерий завершения
    wave?: number;      // номер волны (для wave-based execution)
}

/**
 * Парсинг структурированных задач (вдохновлено GSD XML format).
 * Формат:
 * ```
 * [TASK: Create login endpoint]
 * type: auto
 * files: src/api/auth.ts
 * action: Create REST endpoint for login
 * verify: curl -X POST localhost:3000/api/auth returns 200
 * done: Credentials validated, JWT returned
 * ```
 */
export function parseStructuredTask(text: string): StructuredTask | null {
    const nameMatch = text.match(/\[TASK:\s*(.+?)\]/);
    if (!nameMatch) return null;

    const getField = (field: string): string => {
        const match = text.match(new RegExp(`${field}:\\s*(.+)`, 'i'));
        return match?.[1]?.trim() ?? '';
    };

    return {
        name: nameMatch[1].trim(),
        type: (getField('type') as TaskType) || 'auto',
        files: getField('files').split(',').map(f => f.trim()).filter(Boolean),
        action: getField('action'),
        verify: getField('verify'),
        done: getField('done'),
        wave: parseInt(getField('wave')) || undefined,
    };
}

/** Проверка что задача полностью описана */
export function validateStructuredTask(task: StructuredTask): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!task.name) missing.push('name');
    if (!task.action) missing.push('action');
    if (!task.verify) missing.push('verify');
    if (!task.done) missing.push('done');
    if (task.files.length === 0) missing.push('files');
    return { valid: missing.length === 0, missing };
}

/** B5: Конвертация StructuredTask → TaskNode формат (skills → DAG) */
export function structuredTaskToNode(task: StructuredTask, index = 0): {
    id: string;
    role: string;
    type: 'llm' | 'hybrid' | 'tool';
    description: string;
    dependencies: string[];
    budget: number;
    maxRetries: number;
} {
    const typeMap: Record<TaskType, 'llm' | 'hybrid' | 'tool'> = {
        auto: 'hybrid',
        manual: 'llm',
        review: 'llm',
    };
    return {
        id: `task_${index}_${task.name.replace(/\s+/g, '_').toLowerCase()}`,
        role: task.type === 'review' ? 'reviewer' : 'coder',
        type: typeMap[task.type],
        description: `${task.action} [verify: ${task.verify}] [done: ${task.done}]`,
        dependencies: [],
        budget: 2000,
        maxRetries: 2,
    };
}
