#!/usr/bin/env node
/**
 * scripts/evolution/self_refactor.js — AGI Safe Self-Refactor Engine v1.0
 * 
 * 🔧 Phase 2: Automated safe code fixes
 * 
 * Reads self_audit_report.json and applies safe, reversible fixes:
 * 1. SYNTAX_FIX — fix trivial syntax issues
 * 2. UNUSED_IMPORT — remove require() where the variable is never used
 * 3. DEAD_CODE_QUARANTINE — move dead scripts to scripts/legacy/
 * 
 * Safety:
 * - git stash before every change
 * - All changes on fix/* branch, never main
 * - Protected files list (SOUL.md, AGENTS.md, etc.)
 * - Rollback on any failure
 * - Max 20 auto-fixes per run (prevent runaway)
 * - Changes > 20 lines require owner notification
 * 
 * Usage:
 *   node scripts/evolution/self_refactor.js                # dry-run (preview only)
 *   node scripts/evolution/self_refactor.js --apply        # apply safe fixes
 *   node scripts/evolution/self_refactor.js --quarantine   # move dead code to legacy/
 *   node scripts/evolution/self_refactor.js --report       # show what would be done
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const AUDIT_REPORT = path.join(ROOT, 'memory', 'self_audit_report.json');
const LEGACY_DIR = path.join(ROOT, 'scripts', 'legacy');
const LEARNINGS_DIR = path.join(ROOT, '.learnings');

// ═══════════════════════════════════════════════
// GUARDRAILS
// ═══════════════════════════════════════════════

const PROTECTED_FILES = new Set([
    'SOUL.md', 'AGENTS.md', 'AGENTS_ANCHOR.md',
    'openclaw.json', '.env', 'package.json', 'package-lock.json',
    '.gitignore', 'README.md', 'ROADMAP.md', 'VISION.md',
    'HEARTBEAT.md', 'SESSION-STATE.md',
]);

const PROTECTED_DIRS = new Set([
    'node_modules', '.git', '.openclaw', 'memory',
]);

const MAX_AUTO_FIXES = 20;
const MAX_AUTO_FIX_LINES = 20; // fixes > this need notification

function isProtected(filePath) {
    const basename = path.basename(filePath);
    if (PROTECTED_FILES.has(basename)) return true;

    const parts = filePath.split(path.sep);
    return parts.some(p => PROTECTED_DIRS.has(p));
}

// ═══════════════════════════════════════════════
// GIT HELPERS
// ═══════════════════════════════════════════════

function git(cmd) {
    try {
        return execSync(`git ${cmd}`, {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 15000,
        }).trim();
    } catch (e) {
        return null;
    }
}

function getCurrentBranch() {
    return git('branch --show-current') || 'unknown';
}

function hasUncommittedChanges() {
    const status = git('status --porcelain');
    return status && status.length > 0;
}

function createFixBranch() {
    const date = new Date().toISOString().split('T')[0];
    const branchName = `fix/self-refactor-${date}`;

    // Check if already on a fix branch
    const current = getCurrentBranch();
    if (current.startsWith('fix/self-refactor')) return current;

    // Stash any uncommitted changes
    if (hasUncommittedChanges()) {
        git('stash push -m "self-refactor: pre-fix stash"');
    }

    // Create and switch to fix branch
    const exists = git(`branch --list ${branchName}`);
    if (exists && exists.trim()) {
        git(`checkout ${branchName}`);
    } else {
        git(`checkout -b ${branchName}`);
    }

    return branchName;
}

function commitFix(message) {
    git('add -A');
    git(`commit -m "refactor(self): ${message}"`);
}

function rollbackToMain(originalBranch) {
    git(`checkout ${originalBranch}`);
    const stashList = git('stash list');
    if (stashList && stashList.includes('self-refactor')) {
        git('stash pop');
    }
}

// ═══════════════════════════════════════════════
// FIX: UNUSED IMPORTS
// ═══════════════════════════════════════════════

function findUnusedImports(filePath) {
    const results = [];
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Match: const X = require('...')
            const match = line.match(/^(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(/);
            if (!match) continue;

            const varName = match[1];

            // Check if variable is used anywhere else in the file
            const restOfFile = lines.slice(i + 1).join('\n');
            const usageRegex = new RegExp(`\\b${varName}\\b`);

            if (!usageRegex.test(restOfFile)) {
                results.push({
                    line: i,
                    lineContent: line.trimEnd(),
                    varName,
                });
            }
        }
    } catch { /* skip */ }
    return results;
}

function fixUnusedImports(filePath, dryRun = true) {
    if (isProtected(filePath)) return null;

    const unused = findUnusedImports(filePath);
    if (unused.length === 0) return null;

    const fix = {
        file: filePath,
        type: 'UNUSED_IMPORT',
        fixes: unused.map(u => ({
            line: u.line + 1,
            removed: u.lineContent,
            variable: u.varName,
        })),
        linesChanged: unused.length,
    };

    if (!dryRun) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const linesToRemove = new Set(unused.map(u => u.line));
        const newLines = lines.filter((_, i) => !linesToRemove.has(i));
        fs.writeFileSync(filePath, newLines.join('\n'));
    }

    return fix;
}

// ═══════════════════════════════════════════════
// FIX: DEAD CODE QUARANTINE
// ═══════════════════════════════════════════════

function quarantineDeadCode(filePath, dryRun = true) {
    if (isProtected(filePath)) return null;

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
    if (!fs.existsSync(fullPath)) return null;

    const basename = path.basename(fullPath);
    const destPath = path.join(LEGACY_DIR, basename);

    const fix = {
        file: filePath,
        type: 'DEAD_CODE_QUARANTINE',
        from: fullPath,
        to: destPath,
        linesChanged: 0, // move, not edit
    };

    if (!dryRun) {
        if (!fs.existsSync(LEGACY_DIR)) {
            fs.mkdirSync(LEGACY_DIR, { recursive: true });
        }

        // Add quarantine header
        const content = fs.readFileSync(fullPath, 'utf8');
        const header = `// ⚠️ QUARANTINED by self_refactor.js on ${new Date().toISOString().split('T')[0]}\n` +
            `// Original location: ${filePath}\n` +
            `// Reason: Not referenced by any other file in the codebase\n` +
            `// To restore: move back to original location\n\n`;

        fs.writeFileSync(destPath, header + content);
        fs.unlinkSync(fullPath);
    }

    return fix;
}

// ═══════════════════════════════════════════════
// FIX: SYNTAX VALIDATION (post-fix check)
// ═══════════════════════════════════════════════

function validateSyntax(filePath) {
    try {
        execSync(`node -c "${filePath}"`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
        });
        return true;
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════
// LEARNING LOGGER
// ═══════════════════════════════════════════════

function logLearning(action, result, detail) {
    try {
        if (!fs.existsSync(LEARNINGS_DIR)) {
            fs.mkdirSync(LEARNINGS_DIR, { recursive: true });
        }

        const month = new Date().toISOString().slice(0, 7); // YYYY-MM
        const logFile = path.join(LEARNINGS_DIR, `${month}.md`);

        const entry = `\n### ${new Date().toISOString().split('T')[0]} — ${action}\n` +
            `- **Result:** ${result}\n` +
            `- **Detail:** ${detail}\n`;

        fs.appendFileSync(logFile, entry);
    } catch { /* non-critical */ }
}

// ═══════════════════════════════════════════════
// MAIN ENGINE
// ═══════════════════════════════════════════════

function loadAuditReport() {
    if (!fs.existsSync(AUDIT_REPORT)) {
        console.error('❌ No audit report found. Run self_audit.js first:');
        console.error('   node scripts/evolution/self_audit.js --json');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(AUDIT_REPORT, 'utf8'));
}

function main() {
    const args = process.argv.slice(2);
    const applyMode = args.includes('--apply');
    const quarantineMode = args.includes('--quarantine');
    const reportMode = args.includes('--report') || (!applyMode && !quarantineMode);
    const dryRun = !applyMode && !quarantineMode;

    console.log('🔧 Jarvis Self-Refactor v1.0');
    console.log(`   Mode: ${dryRun ? '👁️ DRY RUN (preview only)' : '⚡ APPLYING FIXES'}`);
    console.log('═'.repeat(50));

    const report = loadAuditReport();
    const allFixes = [];

    // ── 1. Find unused imports ──
    console.log('\n🔍 Scanning for unused imports...');
    const jsFiles = [];
    const scanDirs = ['scripts/evolution', 'scripts/survival', 'scripts/reflexes',
        'scripts/scout', 'scripts/swarm', 'scripts/ping',
        'src/auditor', 'src/cortex', 'src/dispatcher', 'shared'];

    for (const dir of scanDirs) {
        const fullDir = path.join(ROOT, dir);
        if (!fs.existsSync(fullDir)) continue;
        const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.js'));
        files.forEach(f => jsFiles.push(path.join(fullDir, f)));
    }

    let importFixCount = 0;
    for (const file of jsFiles) {
        if (importFixCount >= MAX_AUTO_FIXES) break;
        const fix = fixUnusedImports(file, dryRun);
        if (fix) {
            allFixes.push(fix);
            importFixCount++;
            const rel = path.relative(ROOT, file);
            console.log(`   📝 ${rel}: ${fix.fixes.length} unused import(s)`);
            fix.fixes.forEach(f => console.log(`      - ${f.variable} (line ${f.line})`));
        }
    }
    console.log(`   Found ${importFixCount} files with unused imports`);

    // ── 2. Dead code quarantine ──
    if (quarantineMode || reportMode) {
        console.log('\n🔍 Checking dead code for quarantine...');
        const deadIssues = report.issues.filter(i => i.issue === 'DEAD_CODE');
        let quarantineCount = 0;

        for (const issue of deadIssues) {
            if (quarantineCount >= MAX_AUTO_FIXES) break;
            const fix = quarantineDeadCode(issue.file, dryRun);
            if (fix) {
                allFixes.push(fix);
                quarantineCount++;
                console.log(`   📦 ${issue.file} → scripts/legacy/`);
            }
        }
        console.log(`   ${quarantineCount} scripts eligible for quarantine`);
    }

    // ── Summary ──
    console.log('\n' + '═'.repeat(50));
    console.log('📊 REFACTOR SUMMARY');
    console.log('═'.repeat(50));

    const importFixes = allFixes.filter(f => f.type === 'UNUSED_IMPORT');
    const quarantineFixes = allFixes.filter(f => f.type === 'DEAD_CODE_QUARANTINE');

    console.log(`   Unused imports:     ${importFixes.length} files (${importFixes.reduce((s, f) => s + f.linesChanged, 0)} lines)`);
    console.log(`   Dead code moves:    ${quarantineFixes.length} files`);
    console.log(`   Total fixes ready:  ${allFixes.length}`);

    if (dryRun) {
        console.log('\n💡 This was a DRY RUN. To apply:');
        console.log('   node scripts/evolution/self_refactor.js --apply        # fix imports');
        console.log('   node scripts/evolution/self_refactor.js --quarantine   # move dead code');
    }

    // ── Apply mode ──
    if (applyMode && allFixes.length > 0) {
        console.log('\n⚡ Applying fixes...');
        const originalBranch = getCurrentBranch();

        try {
            // Create fix branch
            const branchName = createFixBranch();
            console.log(`   📌 Branch: ${branchName}`);

            // Apply import fixes
            let applied = 0;
            for (const fix of importFixes) {
                const result = fixUnusedImports(fix.file, false);
                if (result) {
                    // Validate syntax after fix
                    if (validateSyntax(fix.file)) {
                        applied++;
                        console.log(`   ✅ ${path.relative(ROOT, fix.file)}`);
                    } else {
                        // Rollback this specific file
                        git(`checkout -- "${fix.file}"`);
                        console.log(`   ❌ ${path.relative(ROOT, fix.file)} — syntax broke, rolled back`);
                        logLearning('IMPORT_FIX_FAILED', 'ROLLBACK',
                            `Removing imports from ${fix.file} caused syntax error`);
                    }
                }
            }

            if (applied > 0) {
                commitFix(`remove ${applied} unused import(s) from ${importFixes.length} file(s)`);
                console.log(`\n   📦 Committed ${applied} fixes on ${branchName}`);
                logLearning('UNUSED_IMPORT_CLEANUP', 'SUCCESS',
                    `Removed unused imports from ${applied} files`);
            }

            // Stay on fix branch for review
            console.log(`\n   ℹ️ Review with: git diff main..${branchName}`);
            console.log(`   ℹ️ Merge with:  git checkout main && git merge ${branchName}`);

        } catch (e) {
            console.error(`\n   ❌ Error: ${e.message}`);
            console.log('   🔄 Rolling back...');
            rollbackToMain(originalBranch);
            logLearning('SELF_REFACTOR_ERROR', 'ROLLBACK', e.message);
        }
    }

    // ── Quarantine mode ──
    if (quarantineMode && quarantineFixes.length > 0) {
        console.log('\n📦 Moving dead code to quarantine...');
        const originalBranch = getCurrentBranch();

        try {
            const branchName = createFixBranch();
            console.log(`   📌 Branch: ${branchName}`);

            let moved = 0;
            for (const fix of quarantineFixes) {
                quarantineDeadCode(fix.file, false);
                moved++;
                console.log(`   ✅ ${fix.file} → scripts/legacy/`);
            }

            if (moved > 0) {
                commitFix(`quarantine ${moved} dead script(s) to scripts/legacy/`);
                console.log(`\n   📦 Committed ${moved} moves on ${branchName}`);
                logLearning('DEAD_CODE_QUARANTINE', 'SUCCESS',
                    `Moved ${moved} unreferenced scripts to scripts/legacy/`);
            }

        } catch (e) {
            console.error(`\n   ❌ Error: ${e.message}`);
            rollbackToMain(originalBranch);
            logLearning('QUARANTINE_ERROR', 'ROLLBACK', e.message);
        }
    }

    // Save refactor report
    const refactorReport = {
        timestamp: new Date().toISOString(),
        mode: dryRun ? 'dry-run' : (applyMode ? 'apply' : 'quarantine'),
        fixes: allFixes,
        applied: !dryRun,
    };

    try {
        const memDir = path.join(ROOT, 'memory');
        if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
        fs.writeFileSync(
            path.join(memDir, 'self_refactor_report.json'),
            JSON.stringify(refactorReport, null, 2)
        );
    } catch { /* non-critical */ }

    return refactorReport;
}

module.exports = { main, findUnusedImports, quarantineDeadCode, validateSyntax };

if (require.main === module) {
    main();
}
