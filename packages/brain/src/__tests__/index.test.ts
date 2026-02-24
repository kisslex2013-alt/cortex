import { describe, it, expect } from 'vitest';
import { createRouter, BrainRouter, LLMGateway, makeGeminiProvider, makeOpenAIProvider } from '../index.js';
import type { ComplexityLevel, LLMProvider } from '../index.js';

function mockProvider(name: string, maxComplexity: number = 10): LLMProvider {
    return {
        name,
        model: `${name}-model`,
        maxComplexity: maxComplexity as ComplexityLevel,
        call: async (prompt) => ({
            content: `Response from ${name}: ${prompt.slice(0, 20)}`,
            provider: name,
            model: `${name}-model`,
            tokensUsed: 100,
            latencyMs: 0,
            cached: false,
        }),
        isAvailable: async () => true,
    };
}

describe('@jarvis/brain', () => {
    it('creates router', () => {
        const router = createRouter();
        expect(router).toBeInstanceOf(BrainRouter);
    });

    it('thinks with a provider', async () => {
        const router = createRouter({ providers: [mockProvider('gemini')] });
        const response = await router.think('Hello');
        expect(response.provider).toBe('gemini');
        expect(response.content).toContain('Response from gemini');
    });

    it('cascades on provider failure', async () => {
        const failing: LLMProvider = {
            ...mockProvider('failing'),
            call: async () => { throw new Error('API down'); },
        };
        const router = createRouter({ providers: [failing, mockProvider('backup')] });
        const response = await router.think('Hello');
        expect(response.provider).toBe('backup');
    });

    it('caches responses', async () => {
        const router = createRouter({ providers: [mockProvider('gemini')] });
        await router.think('Same prompt');
        const cached = await router.think('Same prompt');
        expect(cached.cached).toBe(true);
    });

    it('tracks token budget', async () => {
        const router = createRouter({ providers: [mockProvider('gemini')], dailyBudgetTokens: 150 });
        await router.think('First');
        expect(router.getTokensUsedToday()).toBe(100);
        // Second call from cache (doesn't spend tokens)
        await router.think('First');
        expect(router.getTokensUsedToday()).toBe(100);
    });

    it('throws when no provider available', async () => {
        const router = createRouter({ providers: [] });
        await expect(router.think('Hello')).rejects.toThrow('No available LLM provider');
    });
});

// --- LLM Gateway (из open-antigravity) ---
describe('LLMGateway', () => {
    it('registers and retrieves providers', () => {
        const gw = new LLMGateway();
        const gemini = makeGeminiProvider('fake-key');
        gw.registerProvider(gemini);
        expect(gw.getProvider('google-gemini')).toBeDefined();
        expect(gw.listProviders().length).toBe(1);
    });

    it('finds by model', () => {
        const gw = new LLMGateway();
        gw.registerProvider(makeGeminiProvider('key'));
        gw.registerProvider(makeOpenAIProvider('key'));
        expect(gw.findByModel('gpt-4o')?.id).toBe('openai');
        expect(gw.findByModel('gemini-2.5-pro')?.id).toBe('google-gemini');
    });

    it('finds by API format', () => {
        const gw = new LLMGateway();
        gw.registerProvider(makeGeminiProvider('key'));
        gw.registerProvider(makeOpenAIProvider('key'));
        expect(gw.findByFormat('google').length).toBe(1);
        expect(gw.findByFormat('openai').length).toBe(1);
    });
});

