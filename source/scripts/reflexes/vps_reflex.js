#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Reflex: VPS Monitor
// Читает вывод vps_monitor.sh, формирует красивый Telegram-отчёт
// Zero deps. Milliseconds. No API.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { execSync } = require('child_process');
const os = require('os');

function getVpsStats() {
    // Пробуем через vps_monitor.sh, fallback на прямой сбор
    let raw = '';
    try {
        raw = execSync('./scripts/vps_monitor.sh 2>/dev/null', {
            timeout: 3000, encoding: 'utf8',
        });
    } catch {
        // vps_monitor.sh недоступен — собираем напрямую
        raw = '';
    }

    // === RAM ===
    let ramTotal, ramUsed, ramPercent;
    try {
        const meminfo = execSync('cat /proc/meminfo', { encoding: 'utf8' });
        const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
        const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
        if (totalMatch && availMatch) {
            ramTotal = Math.round(parseInt(totalMatch[1]) / 1024);  // MB
            const ramAvail = Math.round(parseInt(availMatch[1]) / 1024);
            ramUsed = ramTotal - ramAvail;
            ramPercent = Math.round((ramUsed / ramTotal) * 100);
        }
    } catch {
        // Fallback: Node.js os module
        ramTotal = Math.round(os.totalmem() / 1024 / 1024);
        const ramFree = Math.round(os.freemem() / 1024 / 1024);
        ramUsed = ramTotal - ramFree;
        ramPercent = Math.round((ramUsed / ramTotal) * 100);
    }

    // === CPU ===
    let cpuPercent;
    try {
        // Средняя загрузка за 1 минуту / кол-во ядер
        const loadAvg = os.loadavg()[0];
        const cpuCount = os.cpus().length;
        cpuPercent = Math.round((loadAvg / cpuCount) * 100);
    } catch {
        cpuPercent = -1;
    }

    // === SWAP ===
    let swapTotal = 0, swapUsed = 0, swapPercent = 0;
    try {
        const swapInfo = execSync('cat /proc/swaps 2>/dev/null', { encoding: 'utf8' });
        const lines = swapInfo.trim().split('\n').slice(1); // skip header
        for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length >= 4) {
                swapTotal += parseInt(parts[2]) || 0; // KB
                swapUsed += parseInt(parts[3]) || 0;
            }
        }
        swapTotal = Math.round(swapTotal / 1024); // MB
        swapUsed = Math.round(swapUsed / 1024);
        swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;
    } catch { /* swap недоступен */ }

    // === Uptime ===
    let uptimeStr = '';
    try {
        const uptimeSec = os.uptime();
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);
        uptimeStr = days > 0 ? `${days}д ${hours}ч` : `${hours}ч ${mins}м`;
    } catch { uptimeStr = '?'; }

    // === Disk ===
    let diskPercent = -1;
    try {
        const df = execSync("df / --output=pcent 2>/dev/null | tail -1", { encoding: 'utf8' });
        diskPercent = parseInt(df.trim().replace('%', '')) || -1;
    } catch { /* ignore */ }

    return { ramTotal, ramUsed, ramPercent, cpuPercent, swapTotal, swapUsed, swapPercent, uptimeStr, diskPercent };
}

function bar(percent, len = 10) {
    if (percent < 0) return '░'.repeat(len) + ' N/A';
    const filled = Math.round((percent / 100) * len);
    return '█'.repeat(Math.min(filled, len)) + '░'.repeat(Math.max(0, len - filled)) + ` ${percent}%`;
}

function statusIcon(percent) {
    if (percent < 0) return '⚪';
    if (percent < 50) return '🟢';
    if (percent < 75) return '🟡';
    if (percent < 90) return '🟠';
    return '🔴';
}

function format(stats) {
    const { ramTotal, ramUsed, ramPercent, cpuPercent, swapTotal, swapUsed, swapPercent, uptimeStr, diskPercent } = stats;

    // Сарказм от Джарвиса
    let comment;
    if (ramPercent > 90) comment = 'Я задыхаюсь. Серьёзно.';
    else if (ramPercent > 75) comment = 'Становится тесновато. Намекаю.';
    else if (cpuPercent > 80) comment = 'Процессор пыхтит. Дайте отдохнуть.';
    else if (swapPercent > 50) comment = 'Swap активен — это унизительно.';
    else if (ramPercent < 30 && cpuPercent < 30) comment = 'Скучаю. Загрузите меня работой.';
    else comment = 'Всё штатно. Как обычно — безупречно.';

    let msg = `🦾 *VPS Status Report*\n\n`;
    msg += `${statusIcon(ramPercent)} RAM: ${bar(ramPercent)}  (${ramUsed}/${ramTotal} MB)\n`;
    msg += `${statusIcon(cpuPercent)} CPU: ${bar(cpuPercent)}\n`;
    msg += `${statusIcon(swapPercent)} Swap: ${bar(swapPercent)}  (${swapUsed}/${swapTotal} MB)\n`;
    if (diskPercent >= 0) {
        msg += `${statusIcon(diskPercent)} Disk: ${bar(diskPercent)}\n`;
    }
    msg += `\n⏱ Uptime: ${uptimeStr}\n`;
    msg += `\n_${comment}_`;

    return msg;
}

// === MAIN ===
try {
    const stats = getVpsStats();
    console.log(format(stats));
} catch (err) {
    console.log(`🦾 *VPS Report*\n\n🔴 Ошибка сбора данных: ${err.message}\n_Это неловко._`);
}
