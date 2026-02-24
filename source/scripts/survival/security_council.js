/**
 * scripts/survival/security_council.js — Еженедельный аудит безопасности
 * Cron: 0 3 * * 0 (воскресенье 3:00 UTC)
 * Использование: node security_council.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.env.WORKSPACE || '/root/.openclaw/workspace';
const DRY_RUN = process.argv.includes('--dry-run');
const findings = [];

function log(msg) { console.log(`[SecurityCouncil] ${msg}`); }

function addFinding(severity, category, message, file = null) {
    findings.push({ severity, category, message, file });
}

// 1. Поиск хардкод секретов в коде
function scanHardcodedSecrets() {
    log('Scanning for hardcoded secrets...');
    const dangerousPatterns = [
        { pattern: /['"](EQ|UQ)[A-Za-z0-9_-]{46,}['"]/g, label: 'TON private key' },
        { pattern: /['"][0-9a-fA-F]{64,}['"]/g, label: 'Hex key' },
        { pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/g, label: 'Bearer token' },
        { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/gi, label: 'Hardcoded password' },
        { pattern: /https?:\/\/[^:]+:[^@]+@/g, label: 'Credentials in URL' },
    ];

    const scanDirs = ['scripts', 'src', 'shared', 'config'];

    for (const dir of scanDirs) {
        const fullDir = path.join(ROOT, dir);
        if (!fs.existsSync(fullDir)) continue;

        const files = getAllFiles(fullDir, ['.js', '.py', '.sh']);
        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                for (const { pattern, label } of dangerousPatterns) {
                    pattern.lastIndex = 0;
                    if (pattern.test(content)) {
                        addFinding('HIGH', 'secrets', `${label} found`, path.relative(ROOT, file));
                    }
                }
            } catch (e) { /* skip unreadable files */ }
        }
    }
}

// 2. Проверка .env в git
function checkEnvInGit() {
    log('Checking .env in git...');
    try {
        const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
        if (tracked.includes('.env')) {
            addFinding('CRITICAL', 'config', '.env file is tracked by git!');
        }

        const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
        if (!gitignore.includes('.env')) {
            addFinding('HIGH', 'config', '.env not in .gitignore');
        }
    } catch (e) { /* skip if no git */ }
}

// 3. Опасные паттерны (eval, exec без sandbox)
function scanDangerousPatterns() {
    log('Scanning for dangerous code patterns...');
    const patterns = [
        { pattern: /\beval\s*\(/g, label: 'eval() usage' },
        { pattern: /child_process.*exec\b/g, label: 'Unsandboxed exec' },
        { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g, label: 'child_process import' },
        { pattern: /\bFunction\s*\(/g, label: 'new Function() (dynamic code)' },
    ];

    const files = getAllFiles(path.join(ROOT, 'scripts'), ['.js']);
    files.push(...getAllFiles(path.join(ROOT, 'src'), ['.js']));

    for (const file of files) {
        // Пропускаем sandbox_guard (он сам sandbox)
        if (file.includes('sandbox_guard') || file.includes('sandbox_preload')) continue;

        try {
            const content = fs.readFileSync(file, 'utf8');
            for (const { pattern, label } of patterns) {
                pattern.lastIndex = 0;
                const matches = content.match(pattern);
                if (matches && matches.length > 0) {
                    addFinding('MEDIUM', 'code', `${label} (${matches.length}x)`, path.relative(ROOT, file));
                }
            }
        } catch (e) { /* skip */ }
    }
}

// 4. npm audit
function checkNpmAudit() {
    log('Running npm audit...');
    try {
        const result = execSync('npm audit --json 2>/dev/null', { cwd: ROOT, encoding: 'utf8' });
        const audit = JSON.parse(result);
        if (audit.metadata && audit.metadata.vulnerabilities) {
            const v = audit.metadata.vulnerabilities;
            const total = (v.high || 0) + (v.critical || 0);
            if (total > 0) {
                addFinding('HIGH', 'deps', `npm audit: ${v.critical || 0} critical, ${v.high || 0} high vulnerabilities`);
            }
        }
    } catch (e) {
        // npm audit returns non-zero on findings
        if (e.stdout) {
            try {
                const audit = JSON.parse(e.stdout);
                const v = audit.metadata?.vulnerabilities || {};
                const total = (v.high || 0) + (v.critical || 0);
                if (total > 0) {
                    addFinding('HIGH', 'deps', `npm audit: ${v.critical || 0} critical, ${v.high || 0} high`);
                }
            } catch (_) { /* ignore parse errors */ }
        }
    }
}

// 5. Проверка прав на файлы
function checkFilePermissions() {
    log('Checking file permissions...');
    const sensitiveFiles = ['.env', 'scripts/survival/unlock_vault.js'];

    for (const f of sensitiveFiles) {
        const fullPath = path.join(ROOT, f);
        if (fs.existsSync(fullPath)) {
            try {
                const stat = fs.statSync(fullPath);
                const mode = (stat.mode & 0o777).toString(8);
                if (mode.endsWith('7') || mode.endsWith('5')) {
                    addFinding('MEDIUM', 'perms', `${f} is world-readable (mode: ${mode})`);
                }
            } catch (e) { /* skip */ }
        }
    }
}

// Helper: рекурсивный список файлов
function getAllFiles(dir, extensions = []) {
    const result = [];
    if (!fs.existsSync(dir)) return result;

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'archive') continue;
            if (entry.isDirectory()) {
                result.push(...getAllFiles(full, extensions));
            } else if (extensions.length === 0 || extensions.some(ext => entry.name.endsWith(ext))) {
                result.push(full);
            }
        }
    } catch (e) { /* skip */ }
    return result;
}

// Генерация отчёта
function generateReport() {
    const report = [];
    report.push(`# 🔒 Security Audit (${new Date().toISOString().split('T')[0]})`);
    report.push(`> Auto-generated by security_council.js\n`);

    if (findings.length === 0) {
        report.push('✅ No security issues found.');
    } else {
        const critical = findings.filter(f => f.severity === 'CRITICAL');
        const high = findings.filter(f => f.severity === 'HIGH');
        const medium = findings.filter(f => f.severity === 'MEDIUM');

        report.push(`**Summary:** ${critical.length} critical | ${high.length} high | ${medium.length} medium\n`);

        for (const f of [...critical, ...high, ...medium]) {
            const fileStr = f.file ? ` \`${f.file}\`` : '';
            report.push(`- **[${f.severity}]** [${f.category}] ${f.message}${fileStr}`);
        }
    }

    return report.join('\n');
}

// Main
function run() {
    log('Starting security audit...');

    scanHardcodedSecrets();
    checkEnvInGit();
    scanDangerousPatterns();
    checkNpmAudit();
    checkFilePermissions();

    const report = generateReport();

    if (DRY_RUN) {
        console.log('\n--- DRY RUN ---');
        console.log(report);
        return;
    }

    // Записать отчёт
    const reportPath = path.join(ROOT, 'docs', 'security_audit.md');
    fs.writeFileSync(reportPath, report);
    log(`Report written to ${reportPath}`);

    // Вывести для Telegram (если есть findings)
    if (findings.length > 0) {
        console.log(report);
    } else {
        log('No issues found. Silence is golden.');
    }
}

run();
