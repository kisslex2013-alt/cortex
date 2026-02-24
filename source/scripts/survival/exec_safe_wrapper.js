#!/usr/bin/env node
/**
 * 🛡️ Exec Safe Wrapper v1.0
 * Wraps command execution in a safe handler that:
 * - Never shows raw errors to the user
 * - Returns human-readable messages
 * - Logs errors internally for debugging
 * 
 * Usage in OpenClaw prompt/script:
 *   const { safeExec } = require('./scripts/survival/exec_safe_wrapper');
 *   const result = safeExec('systemctl stop cups', 'Остановка сервиса CUPS');
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const ERROR_LOG = path.join(ROOT, 'memory/exec_errors.log');

// AUDIT-FIX-2026-02-18: Dangerous command blocklist (VULN-SEC-004)
const BLOCKED_COMMANDS = [
    /rm\s+(-[rRf]+\s+)*\//,      // rm -rf /
    /dd\s+if=/,                    // dd if= (disk destroyer)
    /mkfs\./,                      // mkfs (format disk)
    /chmod\s+777/,                 // chmod 777 (open everything)
    /chown\s+.*\s+\//,            // chown on system dirs
    />\s*\/etc\//,                 // redirect to /etc/
    /curl\s+.*\|\s*(ba)?sh/,      // curl | bash (remote code exec)
    /wget\s+.*\|\s*(ba)?sh/,      // wget | bash
    /eval\s*\(/,                   // eval() injection
    /python.*-c.*import\s+os/,     // python os module injection
    /:(){ :\|:& };:/,              // fork bomb
    />\s*\/dev\/sd[a-z]/,          // write to block device
    /shutdown/,                     // system shutdown
    /reboot/,                       // system reboot
    /systemctl\s+(disable|mask)/,   // disabling system services
];

/**
 * Check if a command contains a dangerous pattern
 * @param {string} cmd - Command to validate
 * @returns {{safe: boolean, pattern: string|null}}
 */
function validateCommand(cmd) {
    for (const pattern of BLOCKED_COMMANDS) {
        if (pattern.test(cmd)) {
            return { safe: false, pattern: pattern.toString() };
        }
    }
    return { safe: true, pattern: null };
}

/**
 * Safely execute a command. Never throws raw errors.
 * @param {string} cmd - Command to run
 * @param {string} humanLabel - Human-readable description for the user
 * @param {object} options - Optional settings
 * @returns {{ success: boolean, output: string, userMessage: string }}
 */
function safeExec(cmd, humanLabel = 'команда', options = {}) {
    const timeout = options.timeout || 10000;

    // AUDIT-FIX-2026-02-18: Check against blocklist before execution
    const validation = validateCommand(cmd);
    if (!validation.safe) {
        const entry = `[${new Date().toISOString()}] ⛔ BLOCKED DANGEROUS CMD: ${cmd}\n  Pattern: ${validation.pattern}\n\n`;
        try { fs.appendFileSync(ERROR_LOG, entry); } catch { /* ignore */ }
        return {
            success: false,
            output: null,
            userMessage: `⛔ ${humanLabel}: Команда заблокирована — опасный паттерн обнаружен.`
        };
    }

    try {
        const output = execSync(cmd, {
            encoding: 'utf8',
            timeout,
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        return {
            success: true,
            output,
            userMessage: `✅ ${humanLabel}: выполнено`
        };
    } catch (err) {
        // Log error internally, never show to user
        const errorEntry = `[${new Date().toISOString()}] CMD: ${cmd}\n  ERROR: ${err.message}\n  EXIT: ${err.status || 'N/A'}\n\n`;

        try {
            fs.appendFileSync(ERROR_LOG, errorEntry);
        } catch { /* ignore logging failures */ }

        // Map common errors to human-readable messages
        const stderr = (err.stderr || '').toString();
        let reason = 'Неизвестная ошибка';

        if (stderr.includes('not found') || stderr.includes('No such file')) {
            reason = 'Файл или команда не найдены';
        } else if (stderr.includes('not loaded') || stderr.includes('Unit')) {
            reason = 'Сервис не установлен';
        } else if (stderr.includes('unknown method')) {
            reason = 'Метод API не существует';
        } else if (stderr.includes('permission denied') || stderr.includes('Permission')) {
            reason = 'Нет прав доступа';
        } else if (stderr.includes('timeout') || stderr.includes('timed out')) {
            reason = 'Превышено время ожидания';
        } else if (stderr.includes('Connection refused') || stderr.includes('ECONNREFUSED')) {
            reason = 'Сервис недоступен';
        } else if (err.killed) {
            reason = 'Процесс был прерван по таймауту';
        }

        return {
            success: false,
            output: null,
            userMessage: `⚠️ ${humanLabel}: не удалось. Причина: ${reason}.`
        };
    }
}

/**
 * Check if a command/method exists before calling it
 * @param {string} cmd - Command to check (e.g. 'systemctl', 'redis-cli')
 * @returns {boolean}
 */
function commandExists(cmd) {
    try {
        execSync(`command -v ${cmd} 2>/dev/null`, { encoding: 'utf8' });
        return true;
    } catch {
        return false;
    }
}

module.exports = { safeExec, commandExists };

// CLI mode: if run directly
if (require.main === module) {
    const cmd = process.argv.slice(2).join(' ');
    if (!cmd) {
        console.log("Usage: node exec_safe_wrapper.js <command>");
        process.exit(0);
    }
    const result = safeExec(cmd, 'CLI command');
    console.log(result.userMessage);
    if (result.output) console.log(result.output);
    process.exit(result.success ? 0 : 1);
}
