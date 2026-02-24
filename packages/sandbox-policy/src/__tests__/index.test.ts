import { describe, it, expect } from 'vitest';
import { assess, isPathAllowed, redact, getApproval, shouldAskUser } from '../index.js';

describe('@jarvis/sandbox-policy', () => {
    describe('Risk Engine', () => {
        it('classifies read as LOW', () => {
            const d = assess({ action: 'read', target: 'workspace' });
            expect(d.risk).toBe('LOW');
            expect(d.approved).toBe(true);
        });

        it('classifies deploy to production as HIGH', () => {
            const d = assess({ action: 'deploy', target: 'production', reversible: false });
            expect(d.risk).toBe('HIGH');
            expect(d.requiresHumanApproval).toBe(true);
        });

        it('classifies write to config as MEDIUM', () => {
            const d = assess({ action: 'write', target: 'config', reversible: false });
            expect(d.risk).toBe('MEDIUM');
        });
    });

    describe('File Guard', () => {
        it('allows workspace paths', () => {
            expect(isPathAllowed('workspace/scripts/foo.ts').allowed).toBe(true);
        });

        it('denies .env files', () => {
            expect(isPathAllowed('workspace/.env').allowed).toBe(false);
        });

        it('denies path traversal', () => {
            expect(isPathAllowed('workspace/../../etc/passwd').allowed).toBe(false);
        });

        it('denies SOUL.md modification', () => {
            expect(isPathAllowed('workspace/SOUL.md').allowed).toBe(false);
        });
    });

    describe('Redaction', () => {
        it('redacts API keys', () => {
            expect(redact('key: sk-abc123def456xyz789012345')).toContain('[REDACTED:API_KEY]');
        });

        it('redacts GitHub tokens', () => {
            expect(redact('token: ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')).toContain('[REDACTED:GITHUB_TOKEN]');
        });

        it('redacts passwords', () => {
            expect(redact('password=secret123')).toContain('[REDACTED:PASSWORD]');
        });

        it('leaves clean text unchanged', () => {
            expect(redact('Hello world')).toBe('Hello world');
        });
    });

    describe('Approval Table', () => {
        it('file_read needs no approval', () => {
            expect(getApproval('file_read')).toBe('none');
        });

        it('file_modify needs notify', () => {
            expect(getApproval('file_modify')).toBe('notify');
        });

        it('file_delete needs required', () => {
            expect(getApproval('file_delete')).toBe('required');
        });

        it('financial needs mandatory', () => {
            expect(getApproval('financial')).toBe('mandatory');
        });

        it('unknown defaults to required', () => {
            expect(getApproval('unknown_action')).toBe('required');
        });
    });

    describe('Clarification Module', () => {
        it('should NOT ask for simple reads', () => {
            const result = shouldAskUser({
                hasMultipleInterpretations: false,
                isDestructive: false,
                affectsExternalServices: false,
                highErrorCost: false,
                missingData: false,
            });
            expect(result.shouldAsk).toBe(false);
            expect(result.reasons).toEqual([]);
        });

        it('should ask for destructive + external', () => {
            const result = shouldAskUser({
                hasMultipleInterpretations: false,
                isDestructive: true,
                affectsExternalServices: true,
                highErrorCost: false,
                missingData: false,
            });
            expect(result.shouldAsk).toBe(true);
            expect(result.reasons.length).toBe(2);
        });

        it('should ask when data is missing', () => {
            const result = shouldAskUser({
                hasMultipleInterpretations: false,
                isDestructive: false,
                affectsExternalServices: false,
                highErrorCost: false,
                missingData: true,
            });
            expect(result.shouldAsk).toBe(true);
        });
    });
});

