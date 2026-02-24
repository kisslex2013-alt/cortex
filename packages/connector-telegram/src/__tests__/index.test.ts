import { describe, it, expect } from 'vitest';
import { createTelegramConnector } from '../index.js';

describe('@jarvis/connector-telegram', () => {
    it('creates connector', () => {
        const c = createTelegramConnector('test-token');
        expect(c.name).toBe('telegram');
        expect(c.isConnected()).toBe(false);
    });

    it('starts and stops', async () => {
        const c = createTelegramConnector('test-token');
        await c.start();
        expect(c.isConnected()).toBe(true);
        await c.stop();
        expect(c.isConnected()).toBe(false);
    });

    it('handles messages via simulateMessage', async () => {
        const c = createTelegramConnector('test-token');
        c.onMessage(async (msg) => `Echo: ${msg.text}`);
        await c.start();
        const reply = await c.simulateMessage({
            id: '1', chatId: '123', text: 'Hello', from: 'user', timestamp: Date.now(),
        });
        expect(reply).toBe('Echo: Hello');
    });

    it('rejects start without token', async () => {
        const c = createTelegramConnector('');
        await expect(c.start()).rejects.toThrow('token');
    });
});
