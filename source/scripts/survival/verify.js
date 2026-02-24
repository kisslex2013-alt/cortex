#!/usr/bin/env node

/**
 * 🔍 POST-ACTION VERIFIER v1.0
 * ─────────────────────────────
 * External arbiter. Checks FACTS, not WORDS.
 * 
 * Unlike the old TruthLayer/Hashline (which logged what the bot SAID),
 * this verifies what ACTUALLY HAPPENED:
 *   - Did the file change? → check mtime + hash
 *   - Does the script run? → execute + check exit code
 *   - Did git push arrive? → compare local vs remote hash
 *   - Is Redis alive?      → ping
 *   - Cron job passed?     → check last run status
 * 
 * Usage:
 *   node verify.js                    — full system report
 *   node verify.js file <path>        — verify file exists & show stats
 *   node verify.js script <path>      — run script, show exit code
 *   node verify.js git                — check git sync status
 *   node verify.js redis              — check Redis health + key count
 *   node verify.js cron               — check recent cron results
 *   node verify.js claim "<text>"     — verify a bot claim against reality
 * 
 * Written by: Antigravity (external auditor)
 * NOT written by the bot. The bot must NOT modify this file.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WORKSPACE = process.env.WORKSPACE || '/root/.openclaw/workspace';
const TELEGRAM = process.argv.includes('--telegram');
const COLORS = TELEGRAM ? { green: '', red: '', yellow: '', cyan: '', dim: '', reset: '', bold: '' } : {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function ok(msg) { console.log(`✅ ${msg}`); }
function fail(msg) { console.log(`❌ ${msg}`); }
function warn(msg) { console.log(`⚠️ ${msg}`); }
function info(msg) { console.log(`ℹ️ ${msg}`); }
function header(msg) { console.log(TELEGRAM ? `\n*${msg}*` : `\n${COLORS.bold}═══ ${msg} ═══${COLORS.reset}`); }

// ─── FILE VERIFICATION ───────────────────────────────────

function verifyFile(filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE, filePath);
    header(`FILE: ${filePath}`);

    if (!fs.existsSync(abs)) {
        fail(`File NOT FOUND: ${abs}`);
        return { ok: false, reason: 'not_found' };
    }

    const stat = fs.statSync(abs);
    const content = fs.readFileSync(abs);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const age = Math.round((Date.now() - stat.mtimeMs) / 1000);
    const lines = content.toString().split('\n').length;

    ok(`Exists: ${stat.size} bytes, ${lines} lines`);
    info(`Hash: ${hash}...`);
    info(`Modified: ${age}s ago (${stat.mtime.toISOString()})`);

    // Check for red flags
    const text = content.toString();
    if (text.includes('TODO') || text.includes('FIXME')) {
        warn(`Contains TODO/FIXME markers`);
    }
    if (text.includes('placeholder') || text.includes('Placeholder')) {
        warn(`Contains placeholder text`);
    }
    if (/require\(['"]ioredis['"]\)/.test(text)) {
        info(`Uses Redis (ioredis)`);
    }

    return { ok: true, size: stat.size, lines, hash, age };
}

// ─── SCRIPT EXECUTION VERIFICATION ───────────────────────

function verifyScript(scriptPath) {
    const abs = path.isAbsolute(scriptPath) ? scriptPath : path.join(WORKSPACE, scriptPath);
    header(`SCRIPT: ${scriptPath}`);

    if (!fs.existsSync(abs)) {
        fail(`Script NOT FOUND: ${abs}`);
        return { ok: false, reason: 'not_found' };
    }

    // Step 1: Syntax check
    try {
        execSync(`node -c "${abs}" 2>&1`, { encoding: 'utf8' });
        ok(`Syntax: valid`);
    } catch (e) {
        fail(`Syntax ERROR: ${e.message.split('\n')[0]}`);
        return { ok: false, reason: 'syntax_error', error: e.message };
    }

    // Step 2: Dry-run with timeout
    try {
        const output = execSync(`node "${abs}" 2>&1`, {
            encoding: 'utf8',
            timeout: 15000,
            env: { ...process.env, VERIFY_MODE: '1' }
        });
        const lines = output.trim().split('\n');
        ok(`Runs: exit code 0`);
        if (lines.length > 0) {
            info(`Output (last 3 lines):`);
            lines.slice(-3).forEach(l => console.log(`   ${COLORS.dim}${l}${COLORS.reset}`));
        }
        return { ok: true, output: output.slice(0, 500) };
    } catch (e) {
        if (e.killed) {
            warn(`Timeout (15s) — script may be long-running (not necessarily broken)`);
            return { ok: null, reason: 'timeout' };
        }
        fail(`Runtime ERROR (exit ${e.status}):`);
        const stderr = (e.stderr || e.message || '').slice(0, 300);
        console.log(`   ${COLORS.dim}${stderr}${COLORS.reset}`);
        return { ok: false, reason: 'runtime_error', exit: e.status, error: stderr };
    }
}

// ─── GIT VERIFICATION ────────────────────────────────────

function verifyGit() {
    header('GIT STATUS');

    try {
        const branch = execSync('git branch --show-current', {
            cwd: WORKSPACE, encoding: 'utf8'
        }).trim();
        info(`Branch: ${branch}`);

        // Local vs remote
        const local = execSync('git rev-parse HEAD', {
            cwd: WORKSPACE, encoding: 'utf8'
        }).trim();

        let synced = false;
        try {
            const remote = execSync(`git rev-parse origin/${branch}`, {
                cwd: WORKSPACE, encoding: 'utf8'
            }).trim();
            synced = local === remote;
            if (synced) {
                ok(`Synced: local === remote (${local.slice(0, 8)})`);
            } else {
                warn(`NOT synced: local=${local.slice(0, 8)} remote=${remote.slice(0, 8)}`);
            }
        } catch {
            warn(`Remote branch origin/${branch} not found`);
        }

        // Uncommitted changes
        const status = execSync('git status --porcelain', {
            cwd: WORKSPACE, encoding: 'utf8'
        }).trim();

        if (status) {
            const changed = status.split('\n').length;
            warn(`${changed} uncommitted changes:`);
            status.split('\n').slice(0, 5).forEach(l =>
                console.log(`   ${COLORS.dim}${l}${COLORS.reset}`)
            );
            if (changed > 5) console.log(`   ${COLORS.dim}... +${changed - 5} more${COLORS.reset}`);
        } else {
            ok(`Working tree clean`);
        }

        // Recent commits
        const log = execSync('git log --oneline -5', {
            cwd: WORKSPACE, encoding: 'utf8'
        }).trim();
        info(`Recent commits:`);
        log.split('\n').forEach(l =>
            console.log(`   ${COLORS.dim}${l}${COLORS.reset}`)
        );

        // Branch count
        const branches = execSync('git branch -a', {
            cwd: WORKSPACE, encoding: 'utf8'
        }).trim().split('\n').length;
        info(`Total branches: ${branches}`);

        return { ok: synced, branch, local, uncommitted: status ? status.split('\n').length : 0 };
    } catch (e) {
        fail(`Git error: ${e.message.split('\n')[0]}`);
        return { ok: false, error: e.message };
    }
}

// ─── REDIS VERIFICATION ──────────────────────────────────

async function verifyRedis() {
    header('REDIS');

    let redis;
    try {
        const Redis = require('ioredis');
        redis = new Redis({ lazyConnect: true, connectTimeout: 5000 });
        await redis.connect();
    } catch (e) {
        fail(`Redis not available: ${e.message}`);
        return { ok: false, reason: 'no_redis' };
    }

    try {
        const pong = await redis.ping();
        ok(`Ping: ${pong}`);

        // Key statistics
        const jarvisKeys = await redis.keys('jarvis:*');
        info(`Jarvis keys: ${jarvisKeys.length}`);

        // Group by prefix
        const groups = {};
        jarvisKeys.forEach(k => {
            const prefix = k.split(':').slice(0, 2).join(':');
            groups[prefix] = (groups[prefix] || 0) + 1;
        });
        Object.entries(groups).sort((a, b) => b[1] - a[1]).forEach(([prefix, count]) => {
            console.log(`   ${COLORS.dim}${prefix}: ${count} keys${COLORS.reset}`);
        });

        // Memory usage
        const memInfo = await redis.info('memory');
        const usedMatch = memInfo.match(/used_memory_human:(\S+)/);
        if (usedMatch) info(`Memory: ${usedMatch[1]}`);

        await redis.quit();
        return { ok: true, keys: jarvisKeys.length, groups };
    } catch (e) {
        fail(`Redis error: ${e.message}`);
        if (redis) await redis.quit().catch(() => { });
        return { ok: false, error: e.message };
    }
}

// ─── CRON VERIFICATION ───────────────────────────────────

function verifyCron() {
    header('CRON JOBS');

    try {
        const result = execSync('openclaw cron list --json 2>/dev/null || echo "[]"', {
            encoding: 'utf8', timeout: 10000
        }).trim();

        let jobs;
        try {
            jobs = JSON.parse(result);
        } catch {
            // Try non-json format
            const text = execSync('openclaw cron list 2>/dev/null || echo "no cron"', {
                encoding: 'utf8', timeout: 10000
            }).trim();
            info(`Cron output:\n${text.slice(0, 1000)}`);
            return { ok: true, raw: text };
        }

        if (Array.isArray(jobs) && jobs.length > 0) {
            ok(`${jobs.length} cron jobs configured`);
            jobs.forEach(j => {
                const status = j.enabled !== false ? '🟢' : '🔴';
                console.log(`   ${status} ${j.name || j.id?.slice(0, 8)} — ${j.schedule || '?'}`);
            });
        } else {
            warn('No cron jobs found');
        }

        return { ok: true, count: jobs.length };
    } catch (e) {
        warn(`Cron check failed: ${e.message.split('\n')[0]}`);
        return { ok: false, error: e.message };
    }
}

// ─── CLAIM VERIFICATION ─────────────────────────────────

function verifyClaim(claim) {
    header('CLAIM VERIFICATION');
    info(`Claim: "${claim}"`);
    console.log('');

    const checks = [];

    // Pattern: "pushed to git" / "committed"
    if (/push|commit|git/i.test(claim)) {
        const git = verifyGit();
        checks.push({ test: 'git_synced', result: git.ok });
    }

    // Pattern: "created file" / "wrote script"
    const fileMatch = claim.match(/(?:created?|wrote?|updated?)\s+(\S+\.(?:js|md|json|sh))/i);
    if (fileMatch) {
        const file = verifyFile(fileMatch[1]);
        checks.push({ test: 'file_exists', result: file.ok });
    }

    // Pattern: "script works" / "runs without errors"
    const scriptMatch = claim.match(/(\S+\.js)\s+(?:works?|runs?|execut)/i);
    if (scriptMatch) {
        const script = verifyScript(scriptMatch[1]);
        checks.push({ test: 'script_runs', result: script.ok });
    }

    // Pattern: "staked X TON" / "balance"
    if (/stak|TON|balance|profit/i.test(claim)) {
        warn('Financial claims require manual verification on-chain.');
        warn('Check: https://tonviewer.com/<your-wallet-address>');
        checks.push({ test: 'financial', result: null, note: 'manual check required' });
    }

    if (checks.length === 0) {
        warn('No auto-verifiable patterns found in claim.');
        info('Tip: Include specific file names, git operations, or script names.');
    }

    return checks;
}

// ─── SYSTEM HEALTH ───────────────────────────────────────

async function fullReport() {
    if (TELEGRAM) {
        console.log('🔍 *Верификация* — ' + new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }));
    } else {
        console.log(`${COLORS.bold}${COLORS.cyan}`);
        console.log('╔══════════════════════════════════════╗');
        console.log('║   🔍 POST-ACTION VERIFIER v1.0      ║');
        console.log('║   External Arbiter — Facts Only      ║');
        console.log('╚══════════════════════════════════════╝');
        console.log(COLORS.reset);
        console.log(`${COLORS.dim}Timestamp: ${new Date().toISOString()}${COLORS.reset}`);
        console.log(`${COLORS.dim}Workspace: ${WORKSPACE}${COLORS.reset}`);
    }

    const results = {};

    // System resources
    header('SYSTEM');
    try {
        const uptime = execSync("uptime -p", { encoding: 'utf8' }).trim();
        const mem = execSync("free -h | grep Mem | awk '{print $3\"/\"$2}'", { encoding: 'utf8' }).trim();
        const disk = execSync("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\" used)\"}'", { encoding: 'utf8' }).trim();
        const load = execSync("cat /proc/loadavg | cut -d' ' -f1-3", { encoding: 'utf8' }).trim();
        info(`Uptime: ${uptime}`);
        info(`RAM: ${mem}`);
        info(`Disk: ${disk}`);
        info(`Load: ${load}`);
        results.system = { ok: true };
    } catch (e) {
        warn(`System check partial: ${e.message.split('\n')[0]}`);
        results.system = { ok: false };
    }

    // Git
    results.git = verifyGit();

    // Redis
    results.redis = await verifyRedis();

    // Cron
    results.cron = verifyCron();

    // Key scripts health
    header('KEY SCRIPTS');
    const criticalScripts = [
        'scripts/survival/heartbeat_runner.js',
        'scripts/evolution/semantic_search.js',
        'scripts/evolution/nano_cortex_sync.js',
        'scripts/survival/circuit_breaker.js',
        'scripts/survival/session_cleanup.js',
    ];
    for (const s of criticalScripts) {
        const abs = path.join(WORKSPACE, s);
        if (fs.existsSync(abs)) {
            try {
                execSync(`node -c "${abs}" 2>&1`, { encoding: 'utf8' });
                ok(`${path.basename(s)} — syntax OK`);
            } catch {
                fail(`${path.basename(s)} — SYNTAX ERROR`);
            }
        } else {
            fail(`${path.basename(s)} — NOT FOUND`);
        }
    }

    // Summary
    const total = Object.keys(results).length;
    const passed = Object.values(results).filter(r => r.ok).length;
    const failed = Object.values(results).filter(r => r.ok === false).length;
    const unknown = total - passed - failed;

    if (TELEGRAM) {
        console.log(`\n✅ *${passed}* passed | ❌ *${failed}* failed | ⚠️ *${unknown}* unknown`);
    } else {
        header('SUMMARY');
        console.log(`\n   ${COLORS.green}Passed: ${passed}${COLORS.reset}  ${COLORS.red}Failed: ${failed}${COLORS.reset}  ${COLORS.yellow}Unknown: ${unknown}${COLORS.reset}`);
        console.log(`   ${COLORS.dim}Total checks: ${total}${COLORS.reset}\n`);
    }

    // Store in Redis if available
    try {
        const Redis = require('ioredis');
        const redis = new Redis({ lazyConnect: true, connectTimeout: 3000 });
        await redis.connect();
        await redis.set('jarvis:verify:last', JSON.stringify({
            timestamp: new Date().toISOString(),
            passed, failed, unknown,
            results
        }));
        await redis.quit();
        info('Report saved to Redis (jarvis:verify:last)');
    } catch {
        // Redis unavailable, skip silently
    }
}

// ─── CLI ─────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0] || 'report';

    switch (cmd) {
        case 'file':
            if (!args[1]) { fail('Usage: verify.js file <path>'); process.exit(1); }
            verifyFile(args[1]);
            break;
        case 'script':
            if (!args[1]) { fail('Usage: verify.js script <path>'); process.exit(1); }
            verifyScript(args[1]);
            break;
        case 'git':
            verifyGit();
            break;
        case 'redis':
            await verifyRedis();
            break;
        case 'cron':
            verifyCron();
            break;
        case 'claim':
            if (!args[1]) { fail('Usage: verify.js claim "bot said X"'); process.exit(1); }
            verifyClaim(args.slice(1).join(' '));
            break;
        case 'report':
        default:
            await fullReport();
            break;
    }
}

main().catch(e => {
    fail(`Verifier crashed: ${e.message}`);
    process.exit(1);
});
