import { describe, it, expect } from 'vitest';
import { UnifiedPipeline } from '../index.js';

const VALID_TASK = `[TASK: Create auth endpoint]
type: auto
files: src/auth.ts
action: Create REST endpoint for login
verify: curl returns 200
done: JWT returned`;

describe('UnifiedPipeline', () => {
    it('successfully prepares valid task', () => {
        const pipeline = new UnifiedPipeline();
        const result = pipeline.prepare(VALID_TASK);
        expect(result.status).toBe('success');
        expect(result.task.name).toBe('Create auth endpoint');
        expect(result.nodeId).toContain('create_auth_endpoint');
    });

    it('rejects invalid task text', () => {
        const pipeline = new UnifiedPipeline();
        const result = pipeline.prepare('not a task');
        expect(result.status).toBe('error');
        expect(result.error).toContain('parse');
    });

    it('rejects incomplete task', () => {
        const pipeline = new UnifiedPipeline();
        const result = pipeline.prepare('[TASK: Bad task]\ntype: auto');
        expect(result.status).toBe('error');
        expect(result.error).toContain('Missing');
    });

    it('applies policy guard', () => {
        const pipeline = new UnifiedPipeline({
            policyAssess: () => ({ approved: false, reason: 'Too risky' }),
        });
        const result = pipeline.prepare(VALID_TASK);
        expect(result.status).toBe('blocked');
        expect(result.violations).toContain('Too risky');
    });

    it('applies contract check', () => {
        const pipeline = new UnifiedPipeline({
            contractCheck: () => ({
                allPassed: false,
                results: [{ contract: 'naming', passed: false, violations: ['bad name'] }],
            }),
        });
        const result = pipeline.prepare(VALID_TASK);
        expect(result.status).toBe('blocked');
        expect(result.violations).toContain('bad name');
    });

    it('passes all checks', () => {
        const pipeline = new UnifiedPipeline({
            policyAssess: () => ({ approved: true, reason: '' }),
            contractCheck: () => ({
                allPassed: true,
                results: [],
            }),
        });
        const result = pipeline.prepare(VALID_TASK);
        expect(result.status).toBe('success');
    });
});
