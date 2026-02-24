/**
 * @jarvis/pipeline — Unified Pipeline
 *
 * StructuredTask → parse → validate → taskToDAG → Coordinator.run → ContractCheck → result
 * Единый entry point для задач.
 */

import { parseStructuredTask, validateStructuredTask, structuredTaskToNode } from '@jarvis/skills';
import type { StructuredTask } from '@jarvis/skills';

export interface PipelineResult {
    status: 'success' | 'blocked' | 'error';
    task: StructuredTask;
    nodeId: string;
    violations?: string[];
    error?: string;
}

export interface ContractCheckFn {
    (changedFiles: string[], diff: string): {
        allPassed: boolean;
        results: Array<{ contract: string; passed: boolean; violations: string[] }>;
    };
}

export interface PolicyAssessFn {
    (action: string, target: string): { approved: boolean; reason: string };
}

/**
 * Unified Pipeline — полный путь от текста задачи до результата.
 */
export class UnifiedPipeline {
    private contractCheck?: ContractCheckFn;
    private policyAssess?: PolicyAssessFn;

    constructor(opts?: {
        contractCheck?: ContractCheckFn;
        policyAssess?: PolicyAssessFn;
    }) {
        this.contractCheck = opts?.contractCheck;
        this.policyAssess = opts?.policyAssess;
    }

    /** Parse + validate + transform to node */
    prepare(taskText: string): PipelineResult {
        // 1. Parse
        const task = parseStructuredTask(taskText);
        if (!task) {
            return { status: 'error', task: { name: '', type: 'auto', files: [], action: '', verify: '', done: '' }, nodeId: '', error: 'Failed to parse task' };
        }

        // 2. Validate
        const validation = validateStructuredTask(task);
        if (!validation.valid) {
            return { status: 'error', task, nodeId: '', error: `Missing fields: ${validation.missing.join(', ')}` };
        }

        // 3. Policy check
        if (this.policyAssess) {
            const decision = this.policyAssess('execute_task', task.files.join(', '));
            if (!decision.approved) {
                return { status: 'blocked', task, nodeId: '', violations: [decision.reason] };
            }
        }

        // 4. Transform to TaskNode
        const node = structuredTaskToNode(task);

        // 5. Contract check (если есть)
        if (this.contractCheck) {
            const result = this.contractCheck(task.files, '');
            if (!result.allPassed) {
                const violations = result.results.flatMap(r => r.violations);
                return { status: 'blocked', task, nodeId: node.id, violations };
            }
        }

        return { status: 'success', task, nodeId: node.id };
    }
}
