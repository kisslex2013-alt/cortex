#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Reflex: CLAW Financial Report
// Читает memory/financial-state.json + логи за сутки
// Считает баланс и ROI за 24ч
// Zero deps. Milliseconds. No API.
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../..');
const FINANCIAL_STATE = path.join(ROOT, 'memory', 'paper_trades.json');
const LOGS_DIR = path.join(ROOT, 'logs');

function loadFinancialState() {
    try {
        const raw = fs.readFileSync(FINANCIAL_STATE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

function findClawInState(state) {
    if (!state) return null;

    // Рекурсивный поиск ключей с "CLAW" / "claw" / "balance" / "roi"
    const results = { balances: [], roi: null, positions: [], raw: {} };

    function walk(obj, prefix = '') {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, val] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const keyLower = key.toLowerCase();

            if (keyLower.includes('claw') || keyLower.includes('balance') || keyLower.includes('total')) {
                if (typeof val === 'number') {
                    results.balances.push({ key: fullKey, value: val });
                    results.raw[fullKey] = val;
                } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
                    results.balances.push({ key: fullKey, value: parseFloat(val) });
                    results.raw[fullKey] = parseFloat(val);
                }
            }

            if (keyLower.includes('roi') || keyLower.includes('return') || keyLower.includes('pnl') || keyLower.includes('profit')) {
                if (typeof val === 'number') {
                    results.roi = results.roi || val;
                    results.raw[fullKey] = val;
                }
            }

            if (keyLower.includes('position') || keyLower.includes('trade')) {
                if (Array.isArray(val)) {
                    results.positions = val;
                } else if (typeof val === 'object') {
                    results.raw[fullKey] = val;
                }
            }

            if (typeof val === 'object' && val !== null) {
                walk(val, fullKey);
            }
        }
    }

    walk(state);
    return results;
}

function scanTodayLogs() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const clawMentions = [];

    try {
        if (!fs.existsSync(LOGS_DIR)) return clawMentions;

        const files = fs.readdirSync(LOGS_DIR);
        for (const file of files) {
            // Берём только логи за сегодня (по имени или mtime)
            const filePath = path.join(LOGS_DIR, file);
            const stat = fs.statSync(filePath);
            const fileDate = stat.mtime.toISOString().split('T')[0];

            if (fileDate !== today && !file.includes(today)) continue;
            if (!file.endsWith('.log') && !file.endsWith('.json') && !file.endsWith('.txt')) continue;

            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (/claw/i.test(lines[i])) {
                        clawMentions.push({
                            file: file,
                            line: i + 1,
                            text: lines[i].trim().substring(0, 120),
                        });
                    }
                }
            } catch { /* файл заблокирован — пропускаем */ }
        }
    } catch { /* logs dir missing */ }

    return clawMentions;
}

function calcRoi24h(state) {
    if (!state) return null;
    // Ищем историю балансов за 24ч
    const now = Date.now();
    const h24ago = now - 86400000;

    // Если есть history / snapshots
    const history = state.history || state.snapshots || state.balance_history || [];
    if (Array.isArray(history) && history.length >= 2) {
        const old = history.find(h => {
            const ts = h.timestamp || h.ts || h.time || 0;
            return ts >= h24ago;
        });
        const latest = history[history.length - 1];
        if (old && latest) {
            const oldBal = old.balance || old.total || old.value || 0;
            const newBal = latest.balance || latest.total || latest.value || 0;
            if (oldBal > 0) return ((newBal - oldBal) / oldBal * 100).toFixed(2);
        }
    }
    return null;
}

function format(data, logMentions) {
    let msg = '🦾 *CLAW Financial Report*\n\n';

    if (!data) {
        msg += '⚪ `financial-state.json` не найден\n';
        msg += `📂 Путь: \`${FINANCIAL_STATE}\`\n`;
        msg += '\n_Либо путь неверный, либо CLAW ещё не торговал. Я не осуждаю._';
        return msg;
    }

    // Балансы
    if (data.balances.length > 0) {
        msg += '💰 *Балансы:*\n';
        for (const b of data.balances.slice(0, 8)) {
            const icon = b.value > 0 ? '🟢' : b.value < 0 ? '🔴' : '⚪';
            msg += `  ${icon} \`${b.key}\`: ${b.value.toFixed(4)}\n`;
        }
    } else {
        msg += '💰 Балансы: нет данных\n';
    }

    // Total
    const totalBalance = data.balances.reduce((sum, b) => {
        if (b.key.toLowerCase().includes('total') || b.key.toLowerCase().includes('balance')) {
            return b.value; // берём последний "total"
        }
        return sum;
    }, 0);
    if (totalBalance !== 0) {
        msg += `\n📊 *Общий баланс:* \`${totalBalance.toFixed(4)}\`\n`;
    }

    // ROI
    if (data.roi !== null && data.roi !== undefined) {
        const roiIcon = data.roi > 0 ? '📈' : data.roi < 0 ? '📉' : '➡️';
        msg += `${roiIcon} *ROI:* ${data.roi > 0 ? '+' : ''}${typeof data.roi === 'number' ? data.roi.toFixed(2) : data.roi}%\n`;
    }

    // Позиции
    if (data.positions.length > 0) {
        msg += `\n🎯 *Активные позиции:* ${data.positions.length}\n`;
    }

    // CLAW в логах
    if (logMentions.length > 0) {
        msg += `\n📋 *CLAW в логах сегодня:* ${logMentions.length} упоминаний\n`;
        for (const m of logMentions.slice(0, 5)) {
            msg += `  └ \`${m.file}:${m.line}\` ${m.text.substring(0, 60)}...\n`;
        }
        if (logMentions.length > 5) {
            msg += `  _...и ещё ${logMentions.length - 5}_\n`;
        }
    } else {
        msg += '\n📋 CLAW в логах сегодня: тишина\n';
    }

    // Сарказм
    if (totalBalance > 0 && data.roi > 0) {
        msg += '\n_Неплохо. Может, я и зря переживал._';
    } else if (totalBalance < 0 || (data.roi !== null && data.roi < 0)) {
        msg += '\n_Рынок — лучший учитель смирения._';
    } else {
        msg += '\n_Данные собраны. Выводы за тобой, босс._';
    }

    return msg;
}

// === MAIN ===
try {
    const state = loadFinancialState();
    const clawData = findClawInState(state || {});
    const roi = calcRoi24h(state);
    if (clawData && roi) clawData.roi = clawData.roi || parseFloat(roi);
    const logMentions = scanTodayLogs();
    console.log(format(clawData, logMentions));
} catch (err) {
    console.log(`🦾 *CLAW Report*\n\n🔴 Ошибка: ${err.message}\n_Финансы — дело серьёзное. Разберёмся._`);
}
