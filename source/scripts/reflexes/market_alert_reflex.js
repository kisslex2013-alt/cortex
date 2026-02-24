#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Reflex #5: Market Alert
// Трекер цены TON с локальной историей (JSON).
// Алерт при изменении >3% за 10 минут.
// Cron: * * * * * (каждую минуту)
// Zero external APIs inside — только curl к публичному эндпоинту.
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../..');
const HISTORY_FILE = path.join(ROOT, 'memory', 'ton_price_history.json');
const ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD || '3'); // %
const WINDOW_MINUTES = parseInt(process.env.ALERT_WINDOW || '10');
const MAX_HISTORY = 60; // хранить последние 60 точек (1 час при cron 1/мин)

// ═══ Получить цену TON через curl (единственный внешний вызов) ═══
function fetchTonPrice() {
    const sources = [
        {
            name: 'CoinGecko',
            cmd: `curl -sf --max-time 5 "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd" 2>/dev/null`,
            parse: (raw) => {
                const j = JSON.parse(raw);
                return j['the-open-network']?.usd || null;
            },
        },
        {
            name: 'TonAPI',
            cmd: `curl -sf --max-time 5 "https://tonapi.io/v2/rates?tokens=ton&currencies=usd" 2>/dev/null`,
            parse: (raw) => {
                const j = JSON.parse(raw);
                return j.rates?.TON?.prices?.USD || null;
            },
        },
    ];

    for (const src of sources) {
        try {
            const raw = execSync(src.cmd, { encoding: 'utf8', timeout: 8000 });
            const price = src.parse(raw);
            if (price && price > 0) return { price, source: src.name };
        } catch { /* next source */ }
    }
    return null;
}

// ═══ Локальная история ═══
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }
    } catch { /* corrupted — start fresh */ }
    return [];
}

function saveHistory(history) {
    // Ensure memory/ exists
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ═══ Анализ ═══
function analyze(history, current) {
    const now = Date.now();
    const windowMs = WINDOW_MINUTES * 60 * 1000;
    const cutoff = now - windowMs;

    // Ищем самую раннюю точку в окне
    const inWindow = history.filter(p => p.ts >= cutoff);
    if (inWindow.length === 0) return null;

    const oldest = inWindow[0];
    const change = ((current - oldest.price) / oldest.price) * 100;

    // Мин/макс за окно
    const prices = inWindow.map(p => p.price);
    const min = Math.min(...prices, current);
    const max = Math.max(...prices, current);
    const volatility = ((max - min) / min * 100).toFixed(2);

    // Тренд (последние 5 точек)
    const recent = history.slice(-5).map(p => p.price);
    recent.push(current);
    let trend = 'FLAT';
    const trendChange = recent.length >= 2
        ? ((recent[recent.length - 1] - recent[0]) / recent[0]) * 100
        : 0;
    if (trendChange > 1) trend = 'UP';
    else if (trendChange < -1) trend = 'DOWN';

    return {
        change: change.toFixed(2),
        changeAbs: Math.abs(change),
        direction: change >= 0 ? 'UP' : 'DOWN',
        oldPrice: oldest.price,
        windowMinutes: WINDOW_MINUTES,
        min, max,
        volatility,
        trend,
        dataPoints: inWindow.length,
    };
}

// ═══ Форматирование ═══
function formatAlert(price, source, analysis) {
    // Тихий режим — просто записал, без алерта
    if (!analysis || analysis.changeAbs < ALERT_THRESHOLD) {
        return null; // Нет алерта — молчим
    }

    const dir = analysis.direction === 'UP' ? '📈' : '📉';
    const trendIcon = { UP: '🔼', DOWN: '🔽', FLAT: '➡️' }[analysis.trend];
    const urgency = analysis.changeAbs >= 10 ? '🚨🚨🚨' :
        analysis.changeAbs >= 5 ? '🚨🚨' : '🚨';

    let msg = `🦾 ${urgency} *TON Price Alert*\n\n`;
    msg += `${dir} *$${price.toFixed(4)}* (${analysis.change > 0 ? '+' : ''}${analysis.change}% за ${analysis.windowMinutes}мин)\n\n`;
    msg += `${trendIcon} Тренд: ${analysis.trend}\n`;
    msg += `📊 Диапазон: $${analysis.min.toFixed(4)} — $${analysis.max.toFixed(4)}\n`;
    msg += `⚡ Волатильность: ${analysis.volatility}%\n`;
    msg += `🔗 Источник: ${source}\n`;

    // Сарказм Джарвиса
    if (analysis.changeAbs >= 10) {
        msg += analysis.direction === 'UP'
            ? '\n_Кто-то стал побогаче. Надеюсь, это мы._'
            : '\n_Это больно. Но мы переживали и не такое._';
    } else if (analysis.changeAbs >= 5) {
        msg += analysis.direction === 'UP'
            ? '\n_Заметное движение вверх. Не расслабляемся._'
            : '\n_Рынок нервничает. Нас это не касается... пока._';
    } else {
        msg += analysis.direction === 'UP'
            ? '\n_Лёгкий пинок вверх. Наблюдаю._'
            : '\n_Небольшая просадка. Ничего нового._';
    }

    return msg;
}

function formatQuiet(price, source, analysis) {
    // Тихое обновление для лога (не для Telegram)
    const trend = analysis ? `${analysis.trend} (${analysis.change}%)` : 'N/A';
    return `[TON] $${price.toFixed(4)} | ${trend} | src:${source} | ${new Date().toISOString()}`;
}

// ═══ MAIN ═══
try {
    const result = fetchTonPrice();
    if (!result) {
        console.error('[TON] Все источники цен недоступны');
        process.exit(1);
    }

    const { price, source } = result;
    const history = loadHistory();

    // Добавляем текущую точку
    history.push({ ts: Date.now(), price, source });

    // Обрезаем историю
    while (history.length > MAX_HISTORY) history.shift();
    saveHistory(history);

    // Анализ
    const analysis = analyze(history, price);

    // Алерт или тишина?
    const alert = formatAlert(price, source, analysis);
    if (alert) {
        console.log(alert); // Для Telegram
    } else {
        // Тихое логирование (для cron — stderr чтобы stdout был пуст)
        console.error(formatQuiet(price, source, analysis));
    }
} catch (err) {
    console.error(`[TON] Error: ${err.message}`);
    process.exit(1);
}
