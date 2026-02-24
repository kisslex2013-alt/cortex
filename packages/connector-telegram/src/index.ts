/**
 * @jarvis/connector-telegram — Telegram Connector
 *
 * Интерфейс для подключения к Telegram через grammY (v1).
 */
import { Bot } from 'grammy';

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
    private bot: Bot;
    private token: string;
    private connected = false;
    private handler: MessageHandler | null = null;

    constructor(token: string) {
        this.token = token;
        this.bot = new Bot(token);
    }

    async start(): Promise<void> {
        if (!this.token) throw new Error('Telegram token not provided');

        this.bot.on('message:text', async (ctx) => {
            if (!this.handler) return;

            const msg: ConnectorMessage = {
                id: String(ctx.message.message_id),
                chatId: String(ctx.chat.id),
                text: ctx.message.text,
                from: ctx.from?.username || 'user',
                timestamp: Date.now()
            };

            try {
                const reply = await this.handler(msg);
                if (reply) {
                    await ctx.reply(reply, { parse_mode: 'Markdown' });
                }
            } catch (e) {
                console.error('[Telegram] Error handling message:', e);
                await ctx.reply(`Error: ${(e as Error).message}`);
            }
        });

        this.bot.start({
            onStart: (botInfo) => {
                console.log(`[Telegram] Connector started, bot username: @${botInfo.username}`);
            }
        });

        this.connected = true;
    }

    async stop(): Promise<void> {
        if (this.connected) {
            await this.bot.stop();
            this.connected = false;
            console.log('[Telegram] Connector stopped');
        }
    }

    onMessage(handler: MessageHandler): void {
        this.handler = handler;
    }

    async send(chatId: string, text: string): Promise<void> {
        if (!this.connected) throw new Error('Connector not connected');
        await this.bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
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
