/**
 * scripts/survival/platform_health.js — Ежедневная проверка здоровья платформы
 * Cron: 0 5 * * * (8:00 MSK)
 * Использование: node platform_health.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const ROOT = process.env.WORKSPACE || '/root/.openclaw/workspace';
const DRY_RUN = process.argv.includes('--dry-run');
const checks = [];

function log(msg) { console.log(`[PlatformHealth] ${msg}`); }

function addCheck(status, area, message) {
    checks.push({ status, area, message }); // status: ok | warn | error
}

// 1. Cron Health — анализ cron_log.db
function checkCronHealth() {
    log('Checking cron health...');
    const dbPath = path.join(ROOT, 'data', 'cron_log.db');

    if (!fs.existsSync(dbPath)) {
        addCheck('warn', 'cron', 'cron_log.db not found — cron_logger not initialized yet');
        return;
    }

    try {
        const db = new Database(dbPath, { readonly: true });

        // Jobs с >30% ошибок за 24ч
        const stats = db.prepare(`
      SELECT job_name,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
      FROM cron_runs
      WHERE started_at > datetime('now', '-24 hours')
      GROUP BY job_name
      HAVING errors > 0
    `).all();

        for (const s of stats) {
            const pct = Math.round((s.errors / s.total) * 100);
            if (pct > 30) {
                addCheck('error', 'cron', `${s.job_name}: ${pct}% failures (${s.errors}/${s.total})`);
            } else {
                addCheck('warn', 'cron', `${s.job_name}: ${pct}% failures (${s.errors}/${s.total})`);
            }
        }

        // Jobs зависшие (running > 30 мин)
        const stuck = db.prepare(`
      SELECT job_name, started_at
      FROM cron_runs
      WHERE status = 'running' 
        AND started_at < datetime('now', '-30 minutes')
    `).all();

        for (const s of stuck) {
            addCheck('error', 'cron', `${s.job_name} stuck since ${s.started_at}`);
        }

        if (stats.length === 0 && stuck.length === 0) {
            addCheck('ok', 'cron', 'All cron jobs healthy');
        }

        db.close();
    } catch (e) {
        addCheck('warn', 'cron', `Error reading cron_log.db: ${e.message}`);
    }
}

// 2. Disk Space
function checkDiskSpace() {
    log('Checking disk space...');
    try {
        const df = execSync("df -h / | tail -1 | awk '{print $5}'", { encoding: 'utf8' }).trim();
        const pct = parseInt(df);

        if (pct > 90) {
            addCheck('error', 'disk', `Root disk ${pct}% full`);
        } else if (pct > 75) {
            addCheck('warn', 'disk', `Root disk ${pct}% full`);
        } else {
            addCheck('ok', 'disk', `Root disk ${pct}% used`);
        }

        // Workspace size
        const wsSize = execSync(`du -sh ${ROOT} 2>/dev/null | cut -f1`, { encoding: 'utf8' }).trim();
        addCheck('ok', 'disk', `Workspace: ${wsSize}`);

        // node_modules size
        const nmSize = execSync(`du -sh ${ROOT}/node_modules 2>/dev/null | cut -f1`, { encoding: 'utf8' }).trim();
        addCheck('ok', 'disk', `node_modules: ${nmSize}`);

        // Logs size
        const logsSize = execSync(`find ${ROOT} -name "*.log" -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1`, { encoding: 'utf8' }).trim();
        if (logsSize) addCheck('ok', 'disk', `All logs: ${logsSize}`);
    } catch (e) {
        addCheck('warn', 'disk', `Disk check error: ${e.message}`);
    }
}

// 3. Config consistency
function checkConfig() {
    log('Checking config...');

    // openclaw.json
    const ocPath = path.join(ROOT, 'openclaw.json');
    if (fs.existsSync(ocPath)) {
        try {
            JSON.parse(fs.readFileSync(ocPath, 'utf8'));
            addCheck('ok', 'config', 'openclaw.json valid JSON');
        } catch (e) {
            addCheck('error', 'config', `openclaw.json INVALID: ${e.message}`);
        }
    }

    // package.json
    const pkgPath = path.join(ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            addCheck('ok', 'config', 'package.json valid JSON');
        } catch (e) {
            addCheck('error', 'config', `package.json INVALID: ${e.message}`);
        }
    }
}

// 4. DB Integrity
function checkDatabases() {
    log('Checking database integrity...');

    const findDb = (dir) => {
        const result = [];
        if (!fs.existsSync(dir)) return result;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name === 'node_modules') continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) result.push(...findDb(full));
                else if (e.name.endsWith('.db')) result.push(full);
            }
        } catch (_) { }
        return result;
    };

    const dbs = findDb(ROOT);
    for (const dbPath of dbs) {
        try {
            const db = new Database(dbPath, { readonly: true });
            const result = db.pragma('integrity_check');
            const status = result[0]?.integrity_check === 'ok';
            const relPath = path.relative(ROOT, dbPath);

            if (status) {
                addCheck('ok', 'db', `${relPath}: integrity OK`);
            } else {
                addCheck('error', 'db', `${relPath}: INTEGRITY FAILURE`);
            }
            db.close();
        } catch (e) {
            // Может быть не SQLite файл
            addCheck('warn', 'db', `${path.relative(ROOT, dbPath)}: ${e.message.substring(0, 50)}`);
        }
    }
}

// 5. Git status
function checkGit() {
    log('Checking git status...');
    try {
        const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
        const changes = status.split('\n').filter(l => l.trim()).length;

        if (changes > 20) {
            addCheck('warn', 'git', `${changes} uncommitted changes`);
        } else if (changes > 0) {
            addCheck('ok', 'git', `${changes} uncommitted changes`);
        } else {
            addCheck('ok', 'git', 'Working tree clean');
        }

        // Branch divergence
        try {
            execSync('git fetch origin main --dry-run 2>&1', { cwd: ROOT, encoding: 'utf8' });
            const behind = execSync("git rev-list HEAD..origin/main --count 2>/dev/null", { cwd: ROOT, encoding: 'utf8' }).trim();
            if (parseInt(behind) > 5) {
                addCheck('warn', 'git', `${behind} commits behind origin/main`);
            }
        } catch (_) { }
    } catch (e) {
        addCheck('warn', 'git', `Git check error: ${e.message}`);
    }
}

// 6. Stale files
function checkStaleFiles() {
    log('Checking for stale files...');
    try {
        const stale = execSync(
            `find ${ROOT}/memory -name "????-??-??.md" -mtime +30 2>/dev/null | wc -l`,
            { encoding: 'utf8' }
        ).trim();

        if (parseInt(stale) > 10) {
            addCheck('warn', 'files', `${stale} memory files older than 30 days — run rotate_logs.sh`);
        } else {
            addCheck('ok', 'files', `${stale} stale memory files`);
        }
    } catch (e) {
        addCheck('warn', 'files', `Stale check error: ${e.message}`);
    }
}

// Форматирование отчёта
function formatReport() {
    const icons = { ok: '✅', warn: '⚠️', error: '❌' };
    const lines = [];

    lines.push(`🏥 Platform Health (${new Date().toISOString().split('T')[0]})`);
    lines.push('');

    const errors = checks.filter(c => c.status === 'error');
    const warns = checks.filter(c => c.status === 'warn');
    const oks = checks.filter(c => c.status === 'ok');

    // Сначала ошибки, потом warnings, потом ok
    for (const c of [...errors, ...warns]) {
        lines.push(`${icons[c.status]} [${c.area}] ${c.message}`);
    }

    // OK только как счётчик
    if (oks.length > 0) {
        lines.push(`\n✅ ${oks.length} checks passed`);
    }

    if (errors.length === 0 && warns.length === 0) {
        lines.push('🟢 All systems nominal.');
    }

    return lines.join('\n');
}

// Main
function run() {
    log('Starting platform health check...');

    checkCronHealth();
    checkDiskSpace();
    checkConfig();
    checkDatabases();
    checkGit();
    checkStaleFiles();

    const report = formatReport();

    if (DRY_RUN) {
        console.log('\n--- DRY RUN ---');
    }

    console.log(report);
}

run();
