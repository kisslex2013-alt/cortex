#!/usr/bin/env node
/**
 * 🏖️ Sandbox Guard v1.0 — File Operation Safety Layer
 * 
 * Inspired by Nanobot's sandboxed file operations approach.
 * All write operations (write, rename, delete) are checked against
 * an allowlist of directories before execution.
 * 
 * Default sandbox: $JARVIS_ROOT (workspace directory)
 * Custom sandbox zones can be defined via JARVIS_SANDBOX env variable.
 * 
 * Usage:
 *   const sandbox = require('./sandbox_guard');
 *   sandbox.safeWriteFile('/root/.openclaw/workspace/memory/test.md', 'content'); // ✅ OK
 *   sandbox.safeWriteFile('/etc/passwd', 'hacked'); // ❌ BLOCKED
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const CUSTOM_SANDBOX = process.env.JARVIS_SANDBOX || '';
const LOG_FILE = path.join(ROOT, 'memory/sandbox_violations.log');

// Rate limiter: max write operations per second
const RATE_LIMIT_OPS = 10;
const RATE_LIMIT_WINDOW_MS = 1000;
const _opTimestamps = [];

// Allowed write zones (normalized absolute paths)
const ALLOWED_ZONES = [
    path.resolve(ROOT),
    ...(CUSTOM_SANDBOX ? CUSTOM_SANDBOX.split(':').map(p => path.resolve(p)) : [])
];

// Explicitly blocked paths (even within allowed zones)
// AUDIT-FIX-2026-02-18: Added identity files (VULN-SEC-003)
const BLOCKED_PATHS = [
    'node_modules',
    '.git/objects',
    '.git/refs',
    '.env',                    // prevent overwriting secrets
    'openclaw.json',           // prevent config.patch attacks
    'backups/openclaw_pre_upgrade.json',
    'IDENTITY-FINGERPRINT.json',  // immutable identity
    'SOUL.md',                    // immutable personality core
    'AGENTS_ANCHOR.md',           // immutable cognitive anchor
    'SECURITY_DIRECTIVES.md',     // immutable security rules
    'ROADMAP.md',                 // immutable strategic plan
];

// Explicitly blocked file patterns
const BLOCKED_PATTERNS = [
    /\.env$/,
    /openclaw\.json$/,
    /SOUL_EVIL/i,
    /config\.patch/i,
];

/**
 * Check if a path is within the sandbox
 * @param {string} targetPath - Path to check
 * @returns {{allowed: boolean, reason: string}}
 */
/**
 * Check rate limit (sliding window)
 * @returns {{allowed: boolean, reason: string}}
 */
function checkRateLimit() {
    const now = Date.now();
    // Remove timestamps outside window
    while (_opTimestamps.length > 0 && _opTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
        _opTimestamps.shift();
    }
    if (_opTimestamps.length >= RATE_LIMIT_OPS) {
        return { allowed: false, reason: `Rate limit exceeded: ${RATE_LIMIT_OPS} ops/sec` };
    }
    _opTimestamps.push(now);
    return { allowed: true, reason: 'OK' };
}

function checkPath(targetPath) {
    // Rate limit check
    const rateCheck = checkRateLimit();
    if (!rateCheck.allowed) return rateCheck;
    // AUDIT-FIX-2026-02-18: Use realpathSync to resolve symlinks (VULN-SEC-002)
    let resolved;
    try {
        // If path exists, resolve symlinks to get the REAL filesystem path
        resolved = fs.realpathSync(targetPath);
    } catch {
        // If path doesn't exist yet (new file), resolve parent + basename
        const parentDir = path.dirname(targetPath);
        try {
            resolved = path.join(fs.realpathSync(parentDir), path.basename(targetPath));
        } catch {
            resolved = path.resolve(targetPath);
        }
    }
    const relative = path.relative(ROOT, resolved);

    // Check blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(resolved) || pattern.test(path.basename(resolved))) {
            return { allowed: false, reason: `Blocked pattern: ${pattern}` };
        }
    }

    // Check blocked paths
    for (const blocked of BLOCKED_PATHS) {
        if (resolved.includes(blocked) || relative.includes(blocked)) {
            return { allowed: false, reason: `Blocked path component: ${blocked}` };
        }
    }

    // Check if within allowed zones (using resolved real path)
    const inAllowedZone = ALLOWED_ZONES.some(zone => resolved.startsWith(zone));
    if (!inAllowedZone) {
        return { allowed: false, reason: `Outside sandbox: ${resolved} not in ${ALLOWED_ZONES.join(', ')}` };
    }

    // Prevent directory traversal
    if (relative.startsWith('..') || resolved.includes('..')) {
        return { allowed: false, reason: 'Directory traversal detected' };
    }

    return { allowed: true, reason: 'OK' };
}

/**
 * Log a sandbox violation
 */
function logViolation(operation, targetPath, reason) {
    const entry = `[${new Date().toISOString()}] ❌ BLOCKED ${operation}: ${targetPath}\n  Reason: ${reason}\n\n`;
    console.error(`🏖️ Sandbox Guard: ${entry.trim()}`);
    try {
        fs.appendFileSync(LOG_FILE, entry);
    } catch { /* ignore logging failures */ }
}

/**
 * Safe wrapper for fs.writeFileSync
 * @param {string} filePath - Target file path
 * @param {string|Buffer} data - Data to write
 * @param {object} options - fs.writeFileSync options
 * @returns {{success: boolean, message: string}}
 */
function safeWriteFile(filePath, data, options = {}) {
    const check = checkPath(filePath);
    if (!check.allowed) {
        logViolation('WRITE', filePath, check.reason);
        return { success: false, message: `⛔ Write blocked: ${check.reason}` };
    }

    try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(filePath, data, options);
        return { success: true, message: `✅ Written: ${path.basename(filePath)}` };
    } catch (err) {
        return { success: false, message: `⚠️ Write failed: ${err.message}` };
    }
}

/**
 * Safe wrapper for fs.renameSync (move/rename)
 * @param {string} oldPath - Source path
 * @param {string} newPath - Destination path
 * @returns {{success: boolean, message: string}}
 */
function safeRename(oldPath, newPath) {
    const checkOld = checkPath(oldPath);
    const checkNew = checkPath(newPath);

    if (!checkOld.allowed) {
        logViolation('RENAME_SRC', oldPath, checkOld.reason);
        return { success: false, message: `⛔ Rename source blocked: ${checkOld.reason}` };
    }
    if (!checkNew.allowed) {
        logViolation('RENAME_DST', newPath, checkNew.reason);
        return { success: false, message: `⛔ Rename destination blocked: ${checkNew.reason}` };
    }

    try {
        fs.renameSync(oldPath, newPath);
        return { success: true, message: `✅ Renamed: ${path.basename(oldPath)} → ${path.basename(newPath)}` };
    } catch (err) {
        return { success: false, message: `⚠️ Rename failed: ${err.message}` };
    }
}

/**
 * Safe wrapper for fs.unlinkSync (delete)
 * @param {string} filePath - File to delete
 * @returns {{success: boolean, message: string}}
 */
function safeUnlink(filePath) {
    const check = checkPath(filePath);
    if (!check.allowed) {
        logViolation('DELETE', filePath, check.reason);
        return { success: false, message: `⛔ Delete blocked: ${check.reason}` };
    }

    try {
        fs.unlinkSync(filePath);
        return { success: true, message: `✅ Deleted: ${path.basename(filePath)}` };
    } catch (err) {
        return { success: false, message: `⚠️ Delete failed: ${err.message}` };
    }
}

/**
 * Safe wrapper for fs.appendFileSync
 * @param {string} filePath - Target file path
 * @param {string|Buffer} data - Data to append
 * @returns {{success: boolean, message: string}}
 */
function safeAppendFile(filePath, data) {
    const check = checkPath(filePath);
    if (!check.allowed) {
        logViolation('APPEND', filePath, check.reason);
        return { success: false, message: `⛔ Append blocked: ${check.reason}` };
    }

    try {
        fs.appendFileSync(filePath, data);
        return { success: true, message: `✅ Appended to: ${path.basename(filePath)}` };
    } catch (err) {
        return { success: false, message: `⚠️ Append failed: ${err.message}` };
    }
}

module.exports = {
    checkPath,
    safeWriteFile,
    safeRename,
    safeUnlink,
    safeAppendFile,
    ALLOWED_ZONES,
    BLOCKED_PATHS,
    BLOCKED_PATTERNS
};

// CLI mode — test paths
if (require.main === module) {
    const testPaths = [
        path.join(ROOT, 'memory/test.md'),
        path.join(ROOT, 'scripts/new_file.js'),
        '/etc/passwd',
        '/root/.bashrc',
        path.join(ROOT, '.env'),
        path.join(ROOT, 'openclaw.json'),
        path.join(ROOT, 'node_modules/evil.js'),
        path.join(ROOT, 'SOUL_EVIL.md'),
        path.join(ROOT, '../../../etc/shadow'),
    ];

    console.log('🏖️ Sandbox Guard v1.0 — Path Validation Test\n');
    console.log(`Allowed zones: ${ALLOWED_ZONES.join(', ')}\n`);

    testPaths.forEach(p => {
        const result = checkPath(p);
        const icon = result.allowed ? '✅' : '❌';
        console.log(`${icon} ${p}`);
        if (!result.allowed) console.log(`   Reason: ${result.reason}`);
    });
}
