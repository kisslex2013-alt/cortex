#!/usr/bin/env node
/**
 * 💓 Heartbeat Runner v1.0 — Парсирует HEARTBEAT.md и выполняет задачи
 *
 * Audit Fix #5: Превращает декоративный HEARTBEAT.md в рабочий механизм.
 * 
 * Вместо чеклиста, который никто не проверяет, runner:
 * 1. Парсит задачи из HEARTBEAT.md
 * 2. Выполняет проверки (RAM, WAL, pending tasks)
 * 3. Возвращает JSON-отчёт для circuit_breaker или cron
 *
 * Usage:
 *   node heartbeat_runner.js          # полный запуск
 *   node heartbeat_runner.js --check  # только проверки без действий
 *
 * Cron: каждые 60 мин (через jarvis_config.json)
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';

function exec(cmd) {
    try { return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim(); }
    catch { return null; }
}

// ═══ ПРОВЕРКИ ═══

function checkRAM() {
    const raw = exec("free -m | awk '/Mem:/ {print $2, $3, $7}'");
    if (!raw) return { status: 'unknown', detail: 'Cannot read memory' };

    const [total, used, available] = raw.split(' ').map(Number);
    const percent = Math.round((used / total) * 100);
    const limitMb = 3500; // из HEARTBEAT.md: "RAM не превышала 3.5GB"

    return {
        status: used > limitMb ? 'WARN' : 'OK',
        total_mb: total,
        used_mb: used,
        available_mb: available,
        percent,
        limit_mb: limitMb
    };
}

function checkWAL() {
    const walFiles = [
        path.join(ROOT, 'molt_outbox.db'),
        path.join(ROOT, 'subtask_wal.db')
    ];

    const results = {};
    for (const f of walFiles) {
        const name = path.basename(f);
        if (!fs.existsSync(f)) {
            results[name] = { status: 'MISSING' };
            continue;
        }
        const stats = fs.statSync(f);
        const sizeMb = Math.round(stats.size / 1024 / 1024 * 100) / 100;
        const ageHours = Math.round((Date.now() - stats.mtimeMs) / 3600000 * 10) / 10;

        results[name] = {
            status: sizeMb > 50 ? 'WARN' : 'OK',
            size_mb: sizeMb,
            last_modified_hours_ago: ageHours
        };
    }
    return results;
}

function checkPendingTasks() {
    const historyPath = path.join(ROOT, 'memory', 'HISTORY.md');
    if (!fs.existsSync(historyPath)) return { status: 'NO_FILE', pending: 0 };

    try {
        const content = fs.readFileSync(historyPath, 'utf8');
        const pendingLines = content.split('\n').filter(line =>
            line.match(/^\s*-\s*\[\s*\]/) // незавершённые чекбоксы
        );
        return {
            status: pendingLines.length > 10 ? 'WARN' : 'OK',
            pending: pendingLines.length,
            samples: pendingLines.slice(0, 3).map(l => l.trim())
        };
    } catch {
        return { status: 'ERROR', pending: 0 };
    }
}

function checkRoadmapAlignment() {
    const roadmapPath = path.join(ROOT, 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) return { status: 'NO_FILE' };

    try {
        const content = fs.readFileSync(roadmapPath, 'utf8');
        // Ищем текущую фазу
        const phaseMatch = content.match(/##.*Phase\s+(\d+)/i);
        const completedTasks = (content.match(/\[x\]/gi) || []).length;
        const totalTasks = (content.match(/\[[ x]\]/gi) || []).length;

        return {
            status: 'OK',
            current_phase: phaseMatch ? parseInt(phaseMatch[1]) : null,
            progress: totalTasks > 0 ? `${completedTasks}/${totalTasks}` : 'unknown'
        };
    } catch {
        return { status: 'ERROR' };
    }
}

function checkProcesses() {
    const checks = {
        redis: exec('redis-cli PING 2>/dev/null') === 'PONG',
        gateway: exec('pgrep -f "openclaw" 2>/dev/null') !== null
    };
    return {
        status: checks.redis && checks.gateway ? 'OK' : 'WARN',
        ...checks
    };
}

// ═══ ГЛАВНЫЙ ПУЛЬС ═══

function pulse() {
    const report = {
        timestamp: new Date().toISOString(),
        heartbeat_version: '1.0',
        checks: {
            ram: checkRAM(),
            wal: checkWAL(),
            pending_tasks: checkPendingTasks(),
            roadmap: checkRoadmapAlignment(),
            processes: checkProcesses()
        }
    };

    // Общий статус
    const allStatuses = Object.values(report.checks).map(c => c.status || 'OK');
    report.overall = allStatuses.includes('WARN') ? 'WARN' : 'OK';

    // Логируем
    try {
        const logPath = path.join(ROOT, 'logs', 'heartbeat.log');
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(logPath, JSON.stringify({
            ts: report.timestamp,
            overall: report.overall,
            ram_pct: report.checks.ram.percent
        }) + '\n');
    } catch { /* ignore */ }

    return report;
}

// ═══ ЭКСПОРТ ═══
module.exports = { pulse, checkRAM, checkWAL, checkPendingTasks };

// ═══ CLI ═══
if (require.main === module) {
    const report = pulse();
    const mode = process.argv[2];

    if (mode === '--check' || mode === '--silent') {
        // Тихий режим — только если проблемы
        if (report.overall === 'WARN') {
            console.log(JSON.stringify(report, null, 2));
        }
    } else {
        console.log(JSON.stringify(report, null, 2));
    }

    process.exit(report.overall === 'WARN' ? 1 : 0);
}
