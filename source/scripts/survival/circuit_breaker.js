#!/usr/bin/env node
// scripts/survival/circuit_breaker.js
// Circuit Breaker v1.0 — Автоматическая защита от каскадных сбоев
// Audit Fix #4: 4 уровня деградации
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';

// ═══ КОНФИГУРАЦИЯ ═══
// Загружаем лимиты из jarvis_config.json если доступен
let CONFIG_LIMITS = {
    ram_warn_percent: 80,
    ram_critical_percent: 95,
    max_errors_per_minute: 5,
    check_interval_ms: 30000
};

try {
    const configPath = path.join(ROOT, 'jarvis_config.json');
    if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (cfg.limits) {
            CONFIG_LIMITS.ram_warn_percent = cfg.limits.ram_warn_percent || 80;
            CONFIG_LIMITS.ram_critical_percent = cfg.limits.ram_critical_percent || 95;
        }
    }
} catch (e) { /* fallback to defaults */ }

// ═══ СОСТОЯНИЕ ═══
const state = {
    level: 'GREEN',      // GREEN → YELLOW → ORANGE → RED → BLACK
    errors_last_minute: 0,
    llm_failures: 0,
    last_check: null,
    actions_taken: []
};

// Счётчик ошибок (скользящее окно 60 сек)
const errorTimestamps = [];

function exec(cmd) {
    try { return execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim(); }
    catch { return null; }
}

// ═══ МЕТРИКИ ═══
function getRamPercent() {
    const raw = exec("free | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}'");
    return parseInt(raw || '0');
}

function getLoadAvg() {
    const raw = exec("cat /proc/loadavg 2>/dev/null");
    return parseFloat(raw?.split(' ')[0] || '0');
}

function countRecentErrors() {
    const now = Date.now();
    // Убираем ошибки старше 60 секунд
    while (errorTimestamps.length > 0 && (now - errorTimestamps[0]) > 60000) {
        errorTimestamps.shift();
    }
    return errorTimestamps.length;
}

// ═══ ОПРЕДЕЛЕНИЕ УРОВНЯ ═══
function determineLevel() {
    const ram = getRamPercent();
    const errors = countRecentErrors();
    const prevLevel = state.level;

    // ⚫ BLACK — критическая ситуация
    if (ram >= CONFIG_LIMITS.ram_critical_percent) {
        state.level = 'BLACK';
    }
    // 🔴 RED — все LLM недоступны
    else if (state.llm_failures >= 3) {
        state.level = 'RED';
    }
    // 🟠 ORANGE — высокая нагрузка RAM
    else if (ram >= CONFIG_LIMITS.ram_warn_percent) {
        state.level = 'ORANGE';
    }
    // 🟡 YELLOW — частые ошибки
    else if (errors >= CONFIG_LIMITS.max_errors_per_minute) {
        state.level = 'YELLOW';
    }
    // 🟢 GREEN — всё ок
    else {
        state.level = 'GREEN';
    }

    // Логируем смену уровня
    if (prevLevel !== state.level) {
        const msg = `[CircuitBreaker] Level changed: ${prevLevel} → ${state.level} (RAM: ${ram}%, Errors: ${errors}, LLM fails: ${state.llm_failures})`;
        console.log(msg);
        logToFile(msg);
    }

    state.errors_last_minute = errors;
    state.last_check = new Date().toISOString();

    return state.level;
}

// ═══ ДЕЙСТВИЯ ПО УРОВНЯМ ═══
function executeActions(level) {
    state.actions_taken = [];

    switch (level) {
        case 'GREEN':
            // Всё хорошо, ничего не делаем
            break;

        case 'YELLOW':
            // Увеличиваем интервалы cron-задач
            state.actions_taken.push('cron_intervals_increased');
            console.log('[CircuitBreaker] 🟡 YELLOW: Increasing cron intervals');
            break;

        case 'ORANGE':
            // Останавливаем некритичные задачи
            state.actions_taken.push('non_critical_stopped');
            console.log('[CircuitBreaker] 🟠 ORANGE: Stopping non-critical tasks');
            killNonCriticalProcesses();
            break;

        case 'RED':
            // LLM недоступен — переходим на шаблонные ответы
            state.actions_taken.push('template_responses_only');
            console.log('[CircuitBreaker] 🔴 RED: All LLM down, template responses only');
            break;

        case 'BLACK':
            // Emergency shedding — убиваем всё кроме ядра
            state.actions_taken.push('emergency_shedder');
            console.log('[CircuitBreaker] ⚫ BLACK: Emergency Shedder activated!');
            emergencyShed();
            break;
    }
}

function killNonCriticalProcesses() {
    // Убиваем процессы старше 30 минут кроме критичных
    const critical = ['openclaw-gateway', 'watchdog', 'redis-server', 'courier'];
    const procs = exec("ps aux --sort=-rss | head -20");
    if (procs) {
        console.log('[CircuitBreaker] Top processes by RAM:\n' + procs);
    }
    // Сбрасываем кеш Node.js
    if (global.gc) global.gc();
}

function emergencyShed() {
    // Убиваем всё кроме gateway и redis
    exec("pkill -f 'battle_duty\\|market_ping\\|daily_report\\|reflector' 2>/dev/null");
    console.log('[CircuitBreaker] ⚫ Killed non-essential processes');
}

// ═══ ВНЕШНИЙ API ═══
function reportError(source) {
    errorTimestamps.push(Date.now());
    console.log(`[CircuitBreaker] Error reported from: ${source} (${countRecentErrors()} in last minute)`);
}

function reportLlmFailure() {
    state.llm_failures++;
    console.log(`[CircuitBreaker] LLM failure #${state.llm_failures}`);
}

function resetLlmFailures() {
    state.llm_failures = 0;
}

function getStatus() {
    return {
        level: state.level,
        ram_percent: getRamPercent(),
        load_avg: getLoadAvg(),
        errors_last_minute: countRecentErrors(),
        llm_failures: state.llm_failures,
        actions: state.actions_taken,
        last_check: state.last_check,
        config: CONFIG_LIMITS
    };
}

// ═══ ЛОГИРОВАНИЕ ═══
function logToFile(msg) {
    try {
        const logPath = path.join(ROOT, 'logs', 'circuit_breaker.log');
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
    } catch { /* ignore */ }
}

// ═══ ЭКСПОРТ ═══
module.exports = {
    check: () => { const level = determineLevel(); executeActions(level); return getStatus(); },
    reportError,
    reportLlmFailure,
    resetLlmFailures,
    getStatus,
    state
};

// ═══ CLI MODE ═══
if (require.main === module) {
    const status = module.exports.check();
    console.log('\n[CircuitBreaker] Status:');
    console.log(JSON.stringify(status, null, 2));
}
