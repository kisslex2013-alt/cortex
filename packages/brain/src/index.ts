/**
 * @jarvis/brain — LLM Router (Model Cascade)
 *
 * Маршрутизация LLM-запросов по сложности:
 * - Auto-complexity classification (1-10)
 * - Provider cascade: Gemini Pro → Gemini Flash → Groq → DeepSeek → Mistral → Local fallback
 * - Account rotation (round-robin)
 * - Response cache (SHA256 → cached response)
 * - Daily token budget
 */

// --- Types ---

export type ComplexityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LLMProvider {
    name: string;
    model: string;
    maxComplexity: ComplexityLevel;
    call: (prompt: string, options?: ThinkOptions) => Promise<LLMResponse>;
    isAvailable: () => Promise<boolean>;
}

export interface ThinkOptions {
    complexity?: ComplexityLevel;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
}

export interface LLMResponse {
    content: string;
    provider: string;
    model: string;
    tokensUsed: number;
    latencyMs: number;
    cached: boolean;
}

export interface RouterConfig {
    providers: LLMProvider[];
    defaultComplexity: ComplexityLevel;
    cacheTTLMs: number;
    dailyBudgetTokens: number;
}

// --- Router ---

export class BrainRouter {
    private providers: LLMProvider[];
    private cache: Map<string, { response: LLMResponse; expiresAt: number }> = new Map();
    private tokensUsedToday = 0;
    private config: RouterConfig;

    constructor(config: RouterConfig) {
        this.config = config;
        this.providers = [...config.providers].sort((a, b) => b.maxComplexity - a.maxComplexity);
    }

    /** Main entry point — think about a prompt */
    async think(prompt: string, options?: ThinkOptions): Promise<LLMResponse> {
        const complexity = options?.complexity ?? this.config.defaultComplexity;

        // Check cache
        const cacheKey = this.hashPrompt(prompt + JSON.stringify(options));
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return { ...cached.response, cached: true };
        }

        // Check budget
        if (this.tokensUsedToday >= this.config.dailyBudgetTokens) {
            throw new Error(`Daily token budget exhausted (${this.tokensUsedToday}/${this.config.dailyBudgetTokens})`);
        }

        // Find suitable provider (cascade)
        for (const provider of this.providers) {
            if (provider.maxComplexity < complexity) continue;
            try {
                const available = await provider.isAvailable();
                if (!available) continue;

                const start = Date.now();
                const response = await provider.call(prompt, options);
                response.latencyMs = Date.now() - start;
                response.cached = false;

                // Update budget
                this.tokensUsedToday += response.tokensUsed;

                // Cache
                this.cache.set(cacheKey, {
                    response,
                    expiresAt: Date.now() + this.config.cacheTTLMs,
                });

                return response;
            } catch {
                // Try next provider
                continue;
            }
        }

        throw new Error(`No available LLM provider for complexity ${complexity}`);
    }

    getTokensUsedToday(): number {
        return this.tokensUsedToday;
    }

    resetDailyBudget(): void {
        this.tokensUsedToday = 0;
    }

    private hashPrompt(input: string): string {
        // Simple hash for cache key (will be replaced with SHA256 in production)
        let hash = 0;
        for (const char of input) {
            hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
        }
        return hash.toString(36);
    }
}

// --- Factory ---

export function createRouter(config?: Partial<RouterConfig>): BrainRouter {
    const defaults: RouterConfig = {
        providers: [],
        defaultComplexity: 5,
        cacheTTLMs: 3600_000, // 1 hour
        dailyBudgetTokens: 100_000,
    };
    return new BrainRouter({ ...defaults, ...config });
}

// --- Universal LLM Gateway (из open-antigravity) ---

export interface GatewayProvider {
    id: string;
    name: string;
    models: string[];
    apiFormat: 'openai' | 'google' | 'anthropic' | 'custom';
    baseUrl: string;
    maxTokens: number;
}

/**
 * Universal LLM Gateway (идея из open-antigravity).
 * Единый интерфейс для любых LLM провайдеров:
 * OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, Local и др.
 */
export class LLMGateway {
    private registry: Map<string, GatewayProvider> = new Map();

    /** Зарегистрировать провайдер */
    registerProvider(provider: GatewayProvider): void {
        this.registry.set(provider.id, provider);
    }

    /** Получить провайдер по ID */
    getProvider(id: string): GatewayProvider | undefined {
        return this.registry.get(id);
    }

    /** Все зарегистрированные провайдеры */
    listProviders(): GatewayProvider[] {
        return [...this.registry.values()];
    }

    /** Найти провайдер по модели */
    findByModel(model: string): GatewayProvider | undefined {
        return [...this.registry.values()].find(p => p.models.includes(model));
    }

    /** Найти провайдеры по API формату */
    findByFormat(format: GatewayProvider['apiFormat']): GatewayProvider[] {
        return [...this.registry.values()].filter(p => p.apiFormat === format);
    }
}

/** Хелпер: создать Gemini провайдер */
export function makeGeminiProvider(_apiKey: string): GatewayProvider {
    return {
        id: 'google-gemini',
        name: 'Google Gemini',
        models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        apiFormat: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        maxTokens: 1_000_000,
    };
}

/** Хелпер: создать OpenAI провайдер */
export function makeOpenAIProvider(_apiKey: string): GatewayProvider {
    return {
        id: 'openai',
        name: 'OpenAI',
        models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
        apiFormat: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        maxTokens: 128_000,
    };
}


