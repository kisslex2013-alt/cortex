/**
 * @jarvis/connector-telegram — Telegram Connector
 *
 * Интерфейс для подключения к Telegram через grammY (v1).
 * MVP: заглушка с единым интерфейсом IConnector.
 */

export interface ConnectorMessage {
    id: string;
    chatId: string;
    text: string;
    from: string;
    timestamp: number;
}

export type MessageHandler = (msg: ConnectorMessage) => Promise<string | null>;

export interface IConnector {
    name: string;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    onMessage: (handler: MessageHandler) => void;
    send: (chatId: string, text: string) => Promise<void>;
    isConnected: () => boolean;
}

// --- Telegram Connector (MVP placeholder) ---

export class TelegramConnector implements IConnector {
    name = 'telegram';
    private token: string;
    private connected = false;
    private handler: MessageHandler | null = null;

    constructor(token: string) {
        this.token = token;
    }

    async start(): Promise<void> {
        if (!this.token) throw new Error('Telegram token not provided');
        this.connected = true;
        // TODO: Initialize grammY Bot and start polling
        console.log('[Telegram] Connector started (placeholder)');
    }

    async stop(): Promise<void> {
        this.connected = false;
        console.log('[Telegram] Connector stopped');
    }

    onMessage(handler: MessageHandler): void {
        this.handler = handler;
    }

    async send(chatId: string, text: string): Promise<void> {
        if (!this.connected) throw new Error('Connector not connected');
        // TODO: Send via grammY bot.api.sendMessage()
        console.log(`[Telegram] → ${chatId}: ${text.slice(0, 50)}...`);
    }

    isConnected(): boolean {
        return this.connected;
    }

    /** Simulate incoming message (for testing) */
    async simulateMessage(msg: ConnectorMessage): Promise<string | null> {
        if (this.handler) {
            return this.handler(msg);
        }
        return null;
    }
}

export function createTelegramConnector(token: string): TelegramConnector {
    return new TelegramConnector(token);
}
