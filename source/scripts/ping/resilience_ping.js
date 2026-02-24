#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Resilience Ping — "Боковой наблюдатель"
// Работает отдельным процессом, мониторит Redis-статус Jarvis,
// отправляет heartbeat в Telegram когда основной агент занят.
// Запуск: node resilience_ping.js (или через systemd/pm2)
// ═══════════════════════════════════════════════════════════════
'use strict';

const http = require('https');
const { createClient } = require('redis');

// ═══ CONFIG (из env) ═══
const BOT_TOKEN = process.env.TG_BOT_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const POLL_INTERVAL = 5000;    // Проверяем Redis каждые 5 сек
const BUSY_THRESHOLD = 30000;   // Уведомляем после 30 сек бездействия
const PING_INTERVAL = 60000;   // Повторный пинг раз в 60 сек (не спамим)
const REDIS_KEY = 'jarvis:status:busy';       // Hash: {task, progress, started}
const REDIS_LOG_KEY = 'jarvis:status:task_log';   // Альтернатива: последняя строка лога

// ═══ VALIDATE ═══
if (!BOT_TOKEN || !CHAT_ID) {
    console.error('❌ TG_BOT_TOKEN and TG_CHAT_ID must be set');
    process.exit(1);
}

// ═══ STATE ═══
let redis;
let lastPingTime = 0;           // Когда последний раз отправляли пинг
let busySince = 0;              // Когда Jarvis стал занят
let lastKnownTask = '';         // Последняя известная задача
let wasNotified = false;        // Уже уведомили о текущей задаче?

// ═══ TELEGRAM ═══
function sendTelegram(text) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            chat_id: CHAT_ID,
            text,
            parse_mode: 'Markdown',
            disable_notification: true, // Тихое уведомление
        });

        const req = http.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(payload);
        req.end();
    });
}

// Отправка "typing" action — показывает "Jarvis печатает..."
function sendTypingAction() {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ chat_id: CHAT_ID, action: 'typing' });

        const req = http.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendChatAction`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(payload);
        req.end();
    });
}

// ═══ REDIS ═══
async function connectRedis() {
    redis = createClient({ url: REDIS_URL });
    redis.on('error', (err) => console.error('[Redis]', err.message));
    await redis.connect();
    console.log('✅ Redis connected');
}

async function getBusyStatus() {
    try {
        // Вариант 1: Redis Hash jarvis:status:busy
        const data = await redis.hGetAll(REDIS_KEY);
        if (data && data.task) {
            return {
                busy: true,
                task: data.task || 'Неизвестная задача',
                progress: parseInt(data.progress || '0'),
                started: parseInt(data.started || Date.now().toString()),
                stage: data.stage || '',
            };
        }

        // Вариант 2: Простой string-ключ (fallback)
        const simple = await redis.get(REDIS_KEY);
        if (simple && simple !== '0' && simple !== 'false' && simple !== '') {
            return {
                busy: true,
                task: simple,
                progress: -1,  // Прогресс неизвестен
                started: 0,
                stage: '',
            };
        }

        return { busy: false };
    } catch (err) {
        console.error('[Redis] Read error:', err.message);
        return { busy: false };
    }
}

// ═══ FORMAT ═══
function formatBusyMessage(status, elapsedSec) {
    const task = status.task;
    const elapsed = formatDuration(elapsedSec);
    let msg = `🦾 *Сэр, я в процессе.*\n\n`;
    msg += `📋 Задача: *${task}*\n`;

    if (status.progress >= 0) {
        const bar = progressBar(status.progress);
        msg += `📊 Прогресс: ${bar} ${status.progress}%\n`;
    }

    if (status.stage) {
        msg += `🔄 Этап: _${status.stage}_\n`;
    }

    msg += `⏱ Работаю уже: ${elapsed}\n`;
    msg += `\n_Пожалуйста, подождите. Я сообщу по завершении._`;
    return msg;
}

function formatCompletedMessage(task, totalSec) {
    return `✅ *Задача завершена*\n\n📋 ${task}\n⏱ Заняло: ${formatDuration(totalSec)}\n\n_Я снова на связи._ 🦾`;
}

function progressBar(pct) {
    const filled = Math.round((Math.min(pct, 100) / 100) * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds} сек`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин ${seconds % 60} сек`;
    return `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`;
}

// ═══ MAIN LOOP ═══
async function tick() {
    const status = await getBusyStatus();
    const now = Date.now();

    if (status.busy) {
        // Jarvis занят
        if (busySince === 0) {
            busySince = status.started || now;
            lastKnownTask = status.task;
            wasNotified = false;
        }

        const elapsedMs = now - busySince;
        const elapsedSec = Math.floor(elapsedMs / 1000);

        // Отправляем "typing" action каждый тик пока занят
        try { await sendTypingAction(); } catch { /* ignore */ }

        // Уведомление: после порога + не чаще чем раз в PING_INTERVAL
        if (elapsedMs >= BUSY_THRESHOLD && (now - lastPingTime) >= PING_INTERVAL) {
            const msg = formatBusyMessage(status, elapsedSec);
            try {
                await sendTelegram(msg);
                lastPingTime = now;
                wasNotified = true;
                console.log(`[Ping] Sent busy notification: "${status.task}" (${elapsedSec}s)`);
            } catch (err) {
                console.error('[Ping] Telegram error:', err.message);
            }
        }
    } else {
        // Jarvis свободен
        if (busySince > 0 && wasNotified) {
            // Был занят и мы уведомляли → сообщаем о завершении
            const totalSec = Math.floor((now - busySince) / 1000);
            const msg = formatCompletedMessage(lastKnownTask, totalSec);
            try {
                await sendTelegram(msg);
                console.log(`[Ping] Task completed: "${lastKnownTask}" (${totalSec}s)`);
            } catch (err) {
                console.error('[Ping] Telegram error:', err.message);
            }
        }

        // Сбрасываем состояние
        busySince = 0;
        lastKnownTask = '';
        wasNotified = false;
    }
}

// ═══ LIFECYCLE ═══
async function main() {
    console.log('🦾 Jarvis Resilience Ping — Starting...');
    console.log(`   Redis:    ${REDIS_URL}`);
    console.log(`   Chat:     ${CHAT_ID}`);
    console.log(`   Key:      ${REDIS_KEY}`);
    console.log(`   Threshold: ${BUSY_THRESHOLD / 1000}s`);
    console.log(`   Ping interval: ${PING_INTERVAL / 1000}s\n`);

    await connectRedis();

    // Главный цикл
    setInterval(tick, POLL_INTERVAL);
    tick(); // Первый тик сразу
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Ping] Shutting down...');
    if (redis) await redis.quit().catch(() => { });
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (redis) await redis.quit().catch(() => { });
    process.exit(0);
});

main().catch(err => {
    console.error(`🔴 FATAL: ${err.message}`);
    process.exit(1);
});
