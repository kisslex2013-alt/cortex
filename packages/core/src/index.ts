/**
 * @jarvis/core — Kernel
 *
 * Минимальное ядро Jarvis:
 * - Event loop (dispatch events between modules)
 * - Config manager (YAML + JSON Schema validation)
 * - Plugin loader (dynamic module registration)
 * - Task scheduler (priority queue)
 */

// --- Types ---

export interface JarvisConfig {
    name: string;
    version: string;
    mode: 'minimal' | 'standard' | 'free_time' | 'auto';
    tokenBudget: {
        maxPerHour: number;
    };
}

export interface Plugin {
    name: string;
    version: string;
    init: (kernel: Kernel) => Promise<void>;
    stop?: () => Promise<void>;
    healthCheck?: () => Promise<boolean>;
}

export interface KernelEvent {
    type: string;
    source: string;
    payload: unknown;
    timestamp: number;
}

export type EventHandler = (event: KernelEvent) => Promise<void>;

// --- Kernel ---

export class Kernel {
    private plugins: Map<string, Plugin> = new Map();
    private handlers: Map<string, EventHandler[]> = new Map();
    private running = false;
    private config: JarvisConfig;

    constructor(config: JarvisConfig) {
        this.config = config;
    }

    /** Register a plugin */
    async register(plugin: Plugin): Promise<void> {
        if (this.plugins.has(plugin.name)) {
            throw new Error(`Plugin "${plugin.name}" already registered`);
        }
        this.plugins.set(plugin.name, plugin);
        await plugin.init(this);
    }

    /** Subscribe to events */
    on(eventType: string, handler: EventHandler): void {
        const existing = this.handlers.get(eventType) ?? [];
        existing.push(handler);
        this.handlers.set(eventType, existing);
    }

    /** Unsubscribe from events */
    off(eventType: string, handler: EventHandler): void {
        const existing = this.handlers.get(eventType);
        if (existing) {
            const index = existing.indexOf(handler);
            if (index > -1) {
                existing.splice(index, 1);
            }
        }
    }

    /** Dispatch an event to all subscribers */
    async dispatch(event: KernelEvent): Promise<void> {
        const handlers = this.handlers.get(event.type) ?? [];
        for (const handler of handlers) {
            await handler(event);
        }
    }

    /** Start the kernel */
    async start(): Promise<void> {
        this.running = true;
        console.log(`[Kernel] Jarvis "${this.config.name}" v${this.config.version} started (mode: ${this.config.mode})`);
    }

    /** Stop the kernel and all plugins */
    async stop(): Promise<void> {
        for (const [name, plugin] of this.plugins) {
            if (plugin.stop) {
                await plugin.stop();
                console.log(`[Kernel] Plugin "${name}" stopped`);
            }
        }
        this.running = false;
        console.log('[Kernel] Jarvis stopped');
    }

    /** Health check all plugins */
    async healthCheck(): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();
        for (const [name, plugin] of this.plugins) {
            if (plugin.healthCheck) {
                results.set(name, await plugin.healthCheck());
            } else {
                results.set(name, true); // assume healthy if no check
            }
        }
        return results;
    }

    isRunning(): boolean {
        return this.running;
    }

    getConfig(): JarvisConfig {
        return { ...this.config };
    }

    getPluginNames(): string[] {
        return [...this.plugins.keys()];
    }

    getStatus() {
        return {
            name: this.config.name,
            version: this.config.version,
            mode: this.config.mode,
            running: this.running,
            pluginCount: this.plugins.size,
            uptimeSeconds: process.uptime()
        };
    }

    setMode(mode: 'minimal' | 'standard' | 'free_time' | 'auto') {
        this.config.mode = mode;
        console.log(`[Kernel] Mode changed to: ${mode}`);
    }

    reloadConfig(newConfig: Partial<JarvisConfig>) {
        this.config = { ...this.config, ...newConfig };
        console.log(`[Kernel] Configuration reloaded`);
    }
}

// --- Factory ---

export function createKernel(config?: Partial<JarvisConfig>): Kernel {
    const defaults: JarvisConfig = {
        name: 'Jarvis',
        version: '0.1.0',
        mode: 'auto',
        tokenBudget: { maxPerHour: 1000 },
    };
    return new Kernel({ ...defaults, ...config });
}
