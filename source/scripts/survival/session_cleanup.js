#!/usr/bin/env node
/**
 * 🧹 Session Cleanup v1.0
 * Prevents session overload by explicitly cleaning up cron-created sessions.
 * 
 * Root cause from incident 2026-02-17: 1229 unclosed sessions consumed all RAM.
 * Solution: This script should be called by cron after each batch of tasks.
 * 
 * Recommended crontab: run every 30 minutes
 * See README or SECURITY_DIRECTIVES.md for exact crontab syntax.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const LOG_FILE = path.join(ROOT, 'memory/session_cleanup.log');
const MAX_AGE_HOURS = 24;
const CRITICAL_SESSION_COUNT = 100;

function log(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    console.log(entry);
    try { fs.appendFileSync(LOG_FILE, entry + '\n'); } catch { }
}

function exec(cmd) {
    try { return execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim(); }
    catch { return null; }
}

async function cleanup() {
    log("🧹 Session Cleanup starting...");

    // 1. Check sessions.json for stale entries
    const sessionsFile = path.join(path.dirname(ROOT), 'gateway/sessions.json');
    if (fs.existsSync(sessionsFile)) {
        try {
            const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
            const sessionCount = Array.isArray(sessions) ? sessions.length : Object.keys(sessions).length;

            log(`📊 Active sessions: ${sessionCount}`);

            if (sessionCount > CRITICAL_SESSION_COUNT) {
                log(`⚠️ CRITICAL: ${sessionCount} sessions exceeds limit of ${CRITICAL_SESSION_COUNT}!`);

                // Backup current sessions
                const backupPath = `${sessionsFile}.bak.${Date.now()}`;
                fs.copyFileSync(sessionsFile, backupPath);
                log(`💾 Backup created: ${backupPath}`);
            }
        } catch (err) {
            log(`⚠️ Failed to read sessions.json: ${err.message}`);
        }
    }

    // 2. Try openclaw sessions prune if available
    const pruneResult = exec(`openclaw sessions prune --age ${MAX_AGE_HOURS}h 2>&1`);
    if (pruneResult !== null) {
        log(`✅ Sessions pruned (age > ${MAX_AGE_HOURS}h): ${pruneResult}`);
    } else {
        log("ℹ️ openclaw sessions prune not available, skipping.");
    }

    // 3. Check memory usage
    const memInfo = exec("free -m | awk '/Mem:/ {printf \"%d/%dMB (%.0f%%)\", $3, $2, $3/$2*100}'");
    if (memInfo) {
        log(`💾 Memory: ${memInfo}`);
    }

    // 4. Check for zombie node processes
    const zombies = exec("ps aux | grep '[n]ode' | wc -l");
    if (zombies) {
        log(`🧟 Node processes running: ${zombies}`);
    }

    log("✅ Session Cleanup complete.");
}

cleanup().catch(err => {
    log(`❌ Session Cleanup failed: ${err.message}`);
    process.exit(1);
});
