import { describe, it, expect } from 'vitest';
import { parseSkillMd, validateSkill, SkillLifecycle, parseStructuredTask, validateStructuredTask, structuredTaskToNode } from '../index.js';

const VALID_SKILL = `---
name: file-analyzer
version: 1.0.0
description: Analyzes files
risk_level: LOW
sandbox: true
---

# File Analyzer

Analyze the given file and return a report.
`;

describe('@jarvis/skills', () => {
    it('parses SKILL.md frontmatter', () => {
        const skill = parseSkillMd(VALID_SKILL);
        expect(skill.name).toBe('file-analyzer');
        expect(skill.version).toBe('1.0.0');
        expect(skill.riskLevel).toBe('LOW');
        expect(skill.sandbox).toBe(true);
    });

    it('parses instructions after frontmatter', () => {
        const skill = parseSkillMd(VALID_SKILL);
        expect(skill.instructions).toContain('File Analyzer');
    });

    it('validates valid skill', () => {
        const skill = parseSkillMd(VALID_SKILL);
        const result = validateSkill(skill);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('rejects skill without name', () => {
        const skill = parseSkillMd('---\n---\nInstructions');
        const result = validateSkill(skill);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Skill must have a name');
    });

    it('rejects HIGH risk without sandbox', () => {
        const skill = parseSkillMd('---\nname: danger\nrisk_level: HIGH\nsandbox: false\n---\nDo something');
        const result = validateSkill(skill);
        expect(result.errors).toContain('HIGH risk skills must run in sandbox');
    });
});

// --- SkillLifecycle (DO Framework) ---
describe('SkillLifecycle', () => {
    it('follows directive → execution → output', () => {
        const skill = parseSkillMd(VALID_SKILL);
        const lc = new SkillLifecycle();

        const d = lc.setDirective(skill);
        expect(d.stage).toBe('directive');
        expect(d.skill).toBe('file-analyzer');

        const e = lc.beginExecution();
        expect(e.stage).toBe('execution');

        const report = lc.complete({ apiCalls: 3, itemsProcessed: 10 });
        expect(report.status).toBe('success');
        expect(report.metrics.apiCalls).toBe(3);
        expect(report.metrics.itemsProcessed).toBe(10);
        expect(report.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('reports partial on errors < 3', () => {
        const skill = parseSkillMd(VALID_SKILL);
        const lc = new SkillLifecycle();
        lc.setDirective(skill);
        lc.beginExecution();
        const report = lc.complete({ apiCalls: 1, itemsProcessed: 5 }, ['minor error']);
        expect(report.status).toBe('partial');
    });

    it('reports error on errors >= 3', () => {
        const skill = parseSkillMd(VALID_SKILL);
        const lc = new SkillLifecycle();
        lc.setDirective(skill);
        lc.beginExecution();
        const report = lc.complete({ apiCalls: 0, itemsProcessed: 0 }, ['err1', 'err2', 'err3']);
        expect(report.status).toBe('error');
    });

    it('throws if execution before directive', () => {
        const lc = new SkillLifecycle();
        expect(() => lc.beginExecution()).toThrow('Directive not set');
    });
});

// --- Structured Task Format (из GSD) ---
describe('StructuredTask', () => {
    it('parses valid task', () => {
        const task = parseStructuredTask(`
[TASK: Create login endpoint]
type: auto
files: src/api/auth.ts
action: Create REST endpoint for login
verify: curl -X POST localhost:3000/api/auth returns 200
done: Credentials validated, JWT returned
wave: 1
        `);
        expect(task).not.toBeNull();
        expect(task!.name).toBe('Create login endpoint');
        expect(task!.type).toBe('auto');
        expect(task!.files).toContain('src/api/auth.ts');
        expect(task!.wave).toBe(1);
    });

    it('returns null for invalid format', () => {
        expect(parseStructuredTask('just some text')).toBeNull();
    });

    it('validates complete task', () => {
        const task = parseStructuredTask(`
[TASK: Test task]
type: auto
files: src/test.ts
action: Do something
verify: Run tests
done: Tests pass
        `);
        const result = validateStructuredTask(task!);
        expect(result.valid).toBe(true);
        expect(result.missing).toEqual([]);
    });

    it('rejects incomplete task', () => {
        const task = { name: 'test', type: 'auto' as const, files: [], action: '', verify: '', done: '' };
        const res = validateStructuredTask(task);
        expect(res.valid).toBe(false);
        expect(res.missing).toContain('action');
    });

    it('catches missing fields', () => {
        const task = parseStructuredTask(`
[TASK: Incomplete task]
type: manual
        `);
        const result = validateStructuredTask(task!);
        expect(result.valid).toBe(false);
        expect(result.missing).toContain('action');
        expect(result.missing).toContain('verify');
    });
});

// --- B5: structuredTaskToNode ---
describe('structuredTaskToNode', () => {
    it('converts StructuredTask to TaskNode format', () => {
        const task = parseStructuredTask(`[TASK: Create login]
type: auto
files: src/auth.ts
action: Create endpoint
verify: curl returns 200
done: JWT returned`);
        const node = structuredTaskToNode(task!, 0);
        expect(node.id).toBe('task_0_create_login');
        expect(node.role).toBe('coder');
        expect(node.type).toBe('hybrid');
        expect(node.description).toContain('Create endpoint');
    });

    it('review type maps to reviewer role', () => {
        const task = parseStructuredTask(`[TASK: Review PR]
type: review
files: src/main.ts
action: Review PR #42
verify: comments posted
done: All issues addressed`);
        const node = structuredTaskToNode(task!, 1);
        expect(node.role).toBe('reviewer');
        expect(node.type).toBe('llm');
    });
});
