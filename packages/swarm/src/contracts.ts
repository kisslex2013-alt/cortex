/**
 * @jarvis/swarm — Contract Checker (идея из ARC Protocol)
 *
 * Перед коммитом агент ОБЯЗАН проверить контракты:
 * - API signatures
 * - DB schema
 * - Naming conventions
 * - File structure
 *
 * @scope pre-commit — проверяет инварианты перед коммитом (не runtime)
 */

import type { CodebaseMapEntry } from '@jarvis/shared-types';
export type { CodebaseMapEntry };

export interface Contract {
    name: string;
    description: string;
    check: (context: ContractContext) => ContractResult;
}

export interface ContractContext {
    changedFiles: string[];
    diff: string;
    projectRoot: string;
    codebaseMap?: CodebaseMapEntry[];
}

export interface ContractResult {
    passed: boolean;
    violations: string[];
}

// --- Built-in Contracts ---

/** Проверка naming conventions */
const namingContract: Contract = {
    name: 'naming-conventions',
    description: 'Файлы в kebab-case, классы в PascalCase, функции в camelCase',
    check: (ctx) => {
        const violations: string[] = [];
        for (const file of ctx.changedFiles) {
            const filename = file.split('/').pop() ?? '';
            // Check .ts files are kebab-case
            if (filename.endsWith('.ts') && !filename.startsWith('__') && /[A-Z]/.test(filename.replace('.ts', ''))) {
                violations.push(`${file}: имя файла должно быть в kebab-case`);
            }
        }
        return { passed: violations.length === 0, violations };
    },
};

/** Проверка что нет прямого доступа к .env */
const noEnvAccessContract: Contract = {
    name: 'no-env-access',
    description: 'Код не должен напрямую обращаться к .env файлам',
    check: (ctx) => {
        const violations: string[] = [];
        if (ctx.diff.includes('.env') && !ctx.diff.includes('.env.example')) {
            violations.push('Обнаружено обращение к .env — используй Vault/Keychain');
        }
        if (/process\.env\.[A-Z_]+/.test(ctx.diff)) {
            violations.push('Прямое обращение к process.env — используй config layer');
        }
        return { passed: violations.length === 0, violations };
    },
};

/** Проверка совместимости API signatures */
const apiSignatureContract: Contract = {
    name: 'api-signature',
    description: 'Публичные API не должны ломать обратную совместимость',
    check: (ctx) => {
        const violations: string[] = [];
        // Check for removed exports in index.ts files
        const indexChanges = ctx.changedFiles.filter(f => f.endsWith('index.ts'));
        for (const file of indexChanges) {
            // Simplified check: if export was removed, it's a violation
            const removedExports = ctx.diff.match(/-export\s+\{[^}]+\}/g);
            if (removedExports) {
                violations.push(`${file}: удалён публичный экспорт — это breaking change`);
            }
        }
        return { passed: violations.length === 0, violations };
    },
};

/** Default contracts */
export const BUILT_IN_CONTRACTS: Contract[] = [
    namingContract,
    noEnvAccessContract,
    apiSignatureContract,
];

/**
 * Contract Checker — проверяет все контракты перед коммитом
 * Вдохновлено ARC Protocol: "CONTRACTS.md forces the AI to check before committing"
 */
export class ContractChecker {
    private contracts: Contract[] = [];

    constructor(contracts?: Contract[]) {
        this.contracts = contracts ?? [...BUILT_IN_CONTRACTS];
    }

    addContract(contract: Contract): void {
        this.contracts.push(contract);
    }

    /** Проверить все контракты */
    checkAll(ctx: ContractContext): {
        allPassed: boolean;
        results: Array<{ contract: string; passed: boolean; violations: string[] }>;
    } {
        const results = this.contracts.map(c => {
            const result = c.check(ctx);
            return {
                contract: c.name,
                passed: result.passed,
                violations: result.violations,
            };
        });

        return {
            allPassed: results.every(r => r.passed),
            results,
        };
    }

    getContracts(): Contract[] {
        return [...this.contracts];
    }
}
