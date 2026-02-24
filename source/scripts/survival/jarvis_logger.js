#!/usr/bin/env node
/**
 * 📋 Jarvis Logger v1.0 — Structured JSON Logging
 * Replaces console.log chaos with structured, rotatable JSON logs.
 * 
 * Usage:
 *   const log = require('./jarvis_logger');
 *   log.info('Router', 'Channel switched', { from: 'key1', to: 'key2' });
 *   log.error('Staking', 'Transaction failed', { error: err.message });
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const LOG_DIR = path.join(ROOT, 'memory/logs');
const MAX_LOG_AGE_DAYS = 7;

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { }
}

function getLogPath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `jarvis_${date}.jsonl`);
}

function writeEntry(level, module, message, data = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        module,
        message,
        ...(Object.keys(data).length > 0 ? { data } : {})
    };

    const line = JSON.stringify(entry) + '\n';

    // Write to file
    try {
        fs.appendFileSync(getLogPath(), line);
    } catch { }

    // Also output to console with color
    const colors = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', critical: '\x1b[35m' };
    const color = colors[level] || '\x1b[0m';
    const reset = '\x1b[0m';
    const icon = { info: 'ℹ️', warn: '⚠️', error: '❌', critical: '🔴' }[level] || '•';
    console.log(`${color}${icon} [${level.toUpperCase()}] [${module}] ${message}${reset}`);
}

/**
 * Rotate logs — remove files older than MAX_LOG_AGE_DAYS
 */
function rotateLogs() {
    try {
        if (!fs.existsSync(LOG_DIR)) return;
        const files = fs.readdirSync(LOG_DIR);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - MAX_LOG_AGE_DAYS);

        files.forEach(file => {
            if (!file.startsWith('jarvis_') || !file.endsWith('.jsonl')) return;
            const dateStr = file.replace('jarvis_', '').replace('.jsonl', '');
            const fileDate = new Date(dateStr);
            if (fileDate < cutoff) {
                fs.unlinkSync(path.join(LOG_DIR, file));
            }
        });
    } catch { }
}

// Run rotation on load
rotateLogs();

module.exports = {
    info: (mod, msg, data) => writeEntry('info', mod, msg, data),
    warn: (mod, msg, data) => writeEntry('warn', mod, msg, data),
    error: (mod, msg, data) => writeEntry('error', mod, msg, data),
    critical: (mod, msg, data) => writeEntry('critical', mod, msg, data),
    rotateLogs,
    LOG_DIR
};
