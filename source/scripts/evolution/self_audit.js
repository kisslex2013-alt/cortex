#!/usr/bin/env node
/**
 * scripts/evolution/self_audit.js — AGI Self-Audit Module v1.0
 * 
 * 🧬 Phase 1: Observation Only (no modifications)
 * 
 * Scans the entire codebase and produces a health report:
 * 1. Dead code detection — scripts never imported/required anywhere
 * 2. Syntax validation — node -c on all .js files  
 * 3. Size anomalies — files > 300 lines (refactor candidates)
 * 4. Stale scripts — not modified in > 30 days
 * 5. Missing tests — scripts without corresponding test files
 * 6. Orphan research — research/ docs that reference non-existent files
 * 7. Research suggestions — areas where the bot needs to learn more
 * 
 * Usage:
 *   node scripts/evolution/self_audit.js              # human-readable
 *   node scripts/evolution/self_audit.js --json        # JSON for automation
 *   node scripts/evolution/self_audit.js --suggest     # generate research prompts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const REPORT_PATH = path.join(ROOT, 'memory', 'self_audit_report.json');

// Directories to scan
const SCAN_DIRS = [
    'scripts/evolution',
    'scripts/survival',
    'scripts/reflexes',
    'scripts/scout',
    'scripts/finance',
    'scripts/maintenance',
    'scripts/swarm',
    'scripts/ping',
    'scripts/ton',
    'scripts/tests',
    'scripts/ra',
    'src/auditor',
    'src/cortex',
    'src/dispatcher',
    'shared',
];

// Files that should NEVER be flagged as dead code
const PROTECTED_FILES = new Set([
    'model_cascade_router.js',  // loaded via require() by OpenClaw
    'heartbeat_runner.js',       // called by cron
    'verify.js',                 // called by cron
    'config_guardian_run.js',    // called by cron
    'platform_health.js',       // called by cron
    'battle_duty_once.js',      // called by cron
    'health_endpoint.js',       // HTTP endpoint
    'sandbox_preload.js',       // loaded by sandbox
    'self_audit.js',            // this file
]);

// ═══════════════════════════════════════════════
// AUDIT CHECKS
// ═══════════════════════════════════════════════

function getAllJsFiles() {
    const files = [];
    for (const dir of SCAN_DIRS) {
        const fullDir = path.join(ROOT, dir);
        if (!fs.existsSync(fullDir)) continue;
        const entries = fs.readdirSync(fullDir).filter(f => f.endsWith('.js'));
        for (const f of entries) {
            files.push({
                name: f,
                dir,
                fullPath: path.join(fullDir, f),
                relativePath: path.join(dir, f),
            });
        }
    }
    // Root-level scripts
    const rootScripts = fs.readdirSync(path.join(ROOT, 'scripts'))
        .filter(f => f.endsWith('.js'));
    for (const f of rootScripts) {
        files.push({
            name: f,
            dir: 'scripts',
            fullPath: path.join(ROOT, 'scripts', f),
            relativePath: path.join('scripts', f),
        });
    }
    return files;
}

/**
 * Check 1: Dead Code Detection
 * Finds .js files that are never referenced (imported/required) by other files
 */
function checkDeadCode(files) {
    const results = [];

    // Build a map of all file contents for cross-reference
    const allContents = [];
    for (const f of files) {
        try {
            allContents.push({
                path: f.relativePath,
                content: fs.readFileSync(f.fullPath, 'utf8'),
            });
        } catch { /* skip unreadable */ }
    }

    // Also check root-level .md files and shell scripts for references
    const mdFiles = ['HEARTBEAT.md', 'AGENTS.md', 'SOUL.md', 'ROADMAP.md', 'VISION.md'];
    for (const md of mdFiles) {
        const p = path.join(ROOT, md);
        if (fs.existsSync(p)) {
            allContents.push({ path: md, content: fs.readFileSync(p, 'utf8') });
        }
    }

    for (const file of files) {
        if (PROTECTED_FILES.has(file.name)) continue;

        const basename = file.name.replace('.js', '');
        const isReferenced = allContents.some(other => {
            if (other.path === file.relativePath) return false; // don't match self
            return other.content.includes(basename) ||
                other.content.includes(file.name) ||
                other.content.includes(file.relativePath);
        });

        if (!isReferenced) {
            results.push({
                file: file.relativePath,
                issue: 'DEAD_CODE',
                severity: 'LOW',
                detail: `Not referenced by any other file in the codebase`,
            });
        }
    }
    return results;
}

/**
 * Check 2: Syntax Validation
 */
function checkSyntax(files) {
    const results = [];
    for (const file of files) {
        try {
            execSync(`node -c "${file.fullPath}"`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 5000,
            });
        } catch (e) {
            results.push({
                file: file.relativePath,
                issue: 'SYNTAX_ERROR',
                severity: 'HIGH',
                detail: (e.stderr || e.message || '').split('\n')[0],
            });
        }
    }
    return results;
}

/**
 * Check 3: Size Anomalies (files > 300 lines)
 */
function checkSizeAnomalies(files) {
    const results = [];
    const THRESHOLD = 300;
    for (const file of files) {
        try {
            const content = fs.readFileSync(file.fullPath, 'utf8');
            const lines = content.split('\n').length;
            if (lines > THRESHOLD) {
                results.push({
                    file: file.relativePath,
                    issue: 'LARGE_FILE',
                    severity: 'INFO',
                    detail: `${lines} lines (threshold: ${THRESHOLD}). Consider splitting.`,
                    lines,
                });
            }
        } catch { /* skip */ }
    }
    return results.sort((a, b) => b.lines - a.lines);
}

/**
 * Check 4: Stale Scripts (not modified in > 30 days)
 */
function checkStaleScripts(files) {
    const results = [];
    const STALE_DAYS = 30;
    const now = Date.now();

    for (const file of files) {
        try {
            const stats = fs.statSync(file.fullPath);
            const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (ageDays > STALE_DAYS) {
                results.push({
                    file: file.relativePath,
                    issue: 'STALE',
                    severity: 'INFO',
                    detail: `Last modified ${Math.floor(ageDays)} days ago`,
                    ageDays: Math.floor(ageDays),
                });
            }
        } catch { /* skip */ }
    }
    return results.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Check 5: Missing Tests
 */
function checkMissingTests(files) {
    const results = [];
    const testDir = path.join(ROOT, 'scripts', 'tests');
    const existingTests = fs.existsSync(testDir)
        ? new Set(fs.readdirSync(testDir).map(f => f.toLowerCase()))
        : new Set();

    // Only check important directories
    const importantDirs = ['scripts/survival', 'scripts/evolution', 'src/cortex', 'src/dispatcher', 'shared'];

    for (const file of files) {
        if (!importantDirs.some(d => file.dir.startsWith(d))) continue;
        if (file.name.startsWith('test_')) continue; // skip test files themselves

        const testName = `test_${file.name}`.toLowerCase();
        const altTestName = `test_${file.name.replace('.js', '')}.js`.toLowerCase();

        if (!existingTests.has(testName) && !existingTests.has(altTestName)) {
            results.push({
                file: file.relativePath,
                issue: 'NO_TEST',
                severity: 'LOW',
                detail: `No corresponding test file found in scripts/tests/`,
            });
        }
    }
    return results;
}

/**
 * Check 6: Broken Dependencies
 * Detects require() calls pointing to non-existent files
 * and destructured imports that don't exist in the target module
 */
function checkBrokenDependencies(files) {
    const results = [];

    for (const file of files) {
        try {
            const content = fs.readFileSync(file.fullPath, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Match: require('./local/path') or require('../relative')
                // Skip comments and string examples
                const trimmed = line.trim();
                if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

                const reqMatch = line.match(/require\s*\(['"](\.[\.\/\w\-]+)['"]\)/);
                if (!reqMatch) continue;

                const reqPath = reqMatch[1];
                // Skip placeholder/example paths
                if (reqPath === '...' || reqPath === './local/path' || reqPath.length < 3) continue;
                const fileDir = path.dirname(file.fullPath);

                // Resolve the required file path
                let resolvedPath = path.resolve(fileDir, reqPath);

                // Try with .js extension if not specified
                const candidates = [
                    resolvedPath,
                    resolvedPath + '.js',
                    path.join(resolvedPath, 'index.js'),
                ];

                const exists = candidates.some(c => fs.existsSync(c));

                if (!exists) {
                    results.push({
                        file: file.relativePath,
                        issue: 'BROKEN_REQUIRE',
                        severity: 'HIGH',
                        detail: `Line ${i + 1}: require('${reqPath}') — file not found`,
                        line: i + 1,
                    });
                    continue;
                }

                // Check destructured imports: const { X } = require('...')
                const destructMatch = line.match(/const\s*\{\s*([^}]+)\}\s*=\s*require/);
                if (destructMatch && exists) {
                    const importedNames = destructMatch[1].split(',').map(s => s.trim());

                    // Find the actual file
                    const actualFile = candidates.find(c => fs.existsSync(c));
                    if (actualFile) {
                        try {
                            const targetContent = fs.readFileSync(actualFile, 'utf8');

                            for (const name of importedNames) {
                                if (!name) continue;
                                // Check if the name appears in module.exports
                                const exportPattern = new RegExp(
                                    `(module\\.exports\\s*=.*\\b${name}\\b|exports\\.${name}\\s*=|${name}\\s*[:=])`
                                );

                                // Simple check: is the name defined or exported?
                                const isDefined = targetContent.includes(`function ${name}`) ||
                                    targetContent.includes(`const ${name}`) ||
                                    targetContent.includes(`let ${name}`) ||
                                    targetContent.includes(`var ${name}`) ||
                                    targetContent.includes(`class ${name}`);

                                const isExported = targetContent.includes(`exports`) &&
                                    targetContent.includes(name);

                                if (!isDefined && !isExported) {
                                    results.push({
                                        file: file.relativePath,
                                        issue: 'BROKEN_IMPORT',
                                        severity: 'HIGH',
                                        detail: `Line ${i + 1}: { ${name} } imported from '${reqPath}' but '${name}' is not defined in target module`,
                                        line: i + 1,
                                    });
                                }
                            }
                        } catch { /* skip unreadable */ }
                    }
                }
            }
        } catch { /* skip */ }
    }

    return results;
}

/**
 * Check 7: Codebase Health Summary
 */
function getHealthSummary(files, allIssues) {
    const totalFiles = files.length;
    const criticalCount = allIssues.filter(i => i.severity === 'HIGH').length;
    const warningCount = allIssues.filter(i => i.severity === 'MEDIUM' || i.severity === 'LOW').length;
    const infoCount = allIssues.filter(i => i.severity === 'INFO').length;

    let healthScore = 100;
    healthScore -= criticalCount * 20;  // Syntax errors: heavy penalty
    healthScore -= warningCount * 0.5;  // Dead code/no tests: very minor
    healthScore -= infoCount * 0.25;    // Large files: informational
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    return {
        totalFiles,
        totalIssues: allIssues.length,
        critical: criticalCount,
        warnings: warningCount,
        info: infoCount,
        healthScore,
        grade: healthScore >= 90 ? 'A' : healthScore >= 75 ? 'B' : healthScore >= 60 ? 'C' : healthScore >= 40 ? 'D' : 'F',
    };
}

// ═══════════════════════════════════════════════
// RESEARCH LOOP — Self-Improvement Suggestions
// ═══════════════════════════════════════════════

function generateResearchSuggestions(allIssues, files) {
    const suggestions = [];

    // Based on audit findings
    const deadCount = allIssues.filter(i => i.issue === 'DEAD_CODE').length;
    const largeCount = allIssues.filter(i => i.issue === 'LARGE_FILE').length;
    const syntaxCount = allIssues.filter(i => i.issue === 'SYNTAX_ERROR').length;

    if (deadCount > 5) {
        suggestions.push({
            area: 'Code Cleanup',
            priority: 'HIGH',
            prompt: `I have a Node.js bot codebase with ${deadCount} potentially unused scripts. What are the best practices for safely identifying and removing dead code in a production JavaScript project? Include: 1) How to verify a file is truly unused (not just unreferenced in code but also called by cron, config, or external tools). 2) Safe archival strategies. 3) How to prevent dead code accumulation.`,
            reason: `Found ${deadCount} unreferenced scripts that may be dead code`,
        });
    }

    if (largeCount > 3) {
        suggestions.push({
            area: 'Code Architecture',
            priority: 'MEDIUM',
            prompt: `My Node.js project has ${largeCount} files exceeding 300 lines. What are modern patterns for splitting large JavaScript modules? Focus on: 1) When to split vs when to keep together. 2) Maintaining backward compatibility when refactoring. 3) Node.js specific module patterns (factory, strategy, facade).`,
            reason: `Found ${largeCount} oversized files that may need splitting`,
        });
    }

    if (syntaxCount > 0) {
        suggestions.push({
            area: 'Code Quality',
            priority: 'CRITICAL',
            prompt: `My automated audit found ${syntaxCount} JavaScript files with syntax errors. How should an autonomous agent safely fix syntax errors in its own codebase? Cover: 1) AST-based analysis vs regex. 2) Safe patching strategies. 3) Rollback protocols if a fix breaks something else.`,
            reason: `Found ${syntaxCount} files with syntax errors`,
        });
    }

    // General self-improvement prompts
    suggestions.push({
        area: 'Self-Evolution',
        priority: 'LOW',
        prompt: `I'm building an autonomous AI agent that can improve its own codebase. What safety patterns do real self-modifying systems use? Cover: 1) Sandbox testing before applying changes. 2) Rollback mechanisms. 3) How to prevent recursive self-modification loops. 4) Real-world examples (AutoGPT, Devin, SWE-Agent). Keep it practical, not theoretical.`,
        reason: 'Foundational research for safe self-modification capability',
    });

    suggestions.push({
        area: 'Proactive Intelligence',
        priority: 'LOW',
        prompt: `How can an AI agent running on a VPS with Node.js become truly proactive? Not just respond to commands, but: 1) Identify problems before they become critical. 2) Suggest improvements to its owner. 3) Learn from past mistakes. 4) Prioritize its own development tasks. Focus on practical architectures, not AGI theory.`,
        reason: 'Improving proactive behavior',
    });

    return suggestions;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
    const args = process.argv.slice(2);
    const jsonMode = args.includes('--json');
    const suggestMode = args.includes('--suggest');

    if (!jsonMode) {
        console.log('🧬 Jarvis Self-Audit v1.0 — Observation Mode');
        console.log('═'.repeat(50));
    }

    // Collect all files
    const files = getAllJsFiles();
    if (!jsonMode) console.log(`📁 Found ${files.length} JavaScript files to audit\n`);

    // Run all checks
    const allIssues = [];

    if (!jsonMode) console.log('🔍 Check 1: Dead Code Detection...');
    const deadCode = checkDeadCode(files);
    allIssues.push(...deadCode);
    if (!jsonMode) console.log(`   Found ${deadCode.length} unreferenced files\n`);

    if (!jsonMode) console.log('🔍 Check 2: Syntax Validation...');
    const syntaxErrors = checkSyntax(files);
    allIssues.push(...syntaxErrors);
    if (!jsonMode) console.log(`   Found ${syntaxErrors.length} syntax errors\n`);

    if (!jsonMode) console.log('🔍 Check 3: Size Anomalies...');
    const sizeIssues = checkSizeAnomalies(files);
    allIssues.push(...sizeIssues);
    if (!jsonMode) console.log(`   Found ${sizeIssues.length} oversized files\n`);

    if (!jsonMode) console.log('🔍 Check 4: Stale Scripts...');
    const staleScripts = checkStaleScripts(files);
    allIssues.push(...staleScripts);
    if (!jsonMode) console.log(`   Found ${staleScripts.length} stale scripts\n`);

    if (!jsonMode) console.log('🔍 Check 5: Missing Tests...');
    const missingTests = checkMissingTests(files);
    allIssues.push(...missingTests);
    if (!jsonMode) console.log(`   Found ${missingTests.length} scripts without tests\n`);

    if (!jsonMode) console.log('🔍 Check 6: Broken Dependencies...');
    const brokenDeps = checkBrokenDependencies(files);
    allIssues.push(...brokenDeps);
    if (!jsonMode) console.log(`   Found ${brokenDeps.length} broken imports\n`);

    // Health summary
    const health = getHealthSummary(files, allIssues);

    // Research suggestions
    const suggestions = generateResearchSuggestions(allIssues, files);

    // Build full report
    const report = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        health,
        issues: allIssues,
        researchSuggestions: suggestions,
    };

    // Save report
    try {
        const memDir = path.dirname(REPORT_PATH);
        if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    } catch (e) {
        console.error(`⚠️ Could not save report: ${e.message}`);
    }

    // Output
    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log('═'.repeat(50));
        console.log(`📊 HEALTH SCORE: ${health.healthScore}/100 (Grade: ${health.grade})`);
        console.log(`   Files: ${health.totalFiles} | Issues: ${health.totalIssues}`);
        console.log(`   🔴 Critical: ${health.critical} | ⚠️ Warnings: ${health.warnings} | ℹ️ Info: ${health.info}`);
        console.log('═'.repeat(50));

        // Show critical issues first
        if (syntaxErrors.length > 0) {
            console.log('\n🔴 CRITICAL — Syntax Errors:');
            syntaxErrors.forEach(i => console.log(`   ${i.file}: ${i.detail}`));
        }

        // Show dead code
        if (deadCode.length > 0) {
            console.log('\n⚠️ Potentially Dead Code:');
            deadCode.slice(0, 10).forEach(i => console.log(`   ${i.file}`));
            if (deadCode.length > 10) console.log(`   ... and ${deadCode.length - 10} more`);
        }

        // Show large files
        if (sizeIssues.length > 0) {
            console.log('\nℹ️ Large Files (refactor candidates):');
            sizeIssues.slice(0, 5).forEach(i => console.log(`   ${i.file} (${i.lines} lines)`));
        }

        if (suggestMode && suggestions.length > 0) {
            console.log('\n🧬 RESEARCH SUGGESTIONS FOR SELF-IMPROVEMENT:');
            console.log('─'.repeat(50));
            suggestions.forEach((s, idx) => {
                console.log(`\n${idx + 1}. [${s.priority}] ${s.area}`);
                console.log(`   Reason: ${s.reason}`);
                console.log(`   Prompt for Deep Research:`);
                console.log(`   "${s.prompt}"`);
            });
        }

        console.log(`\n📄 Full report saved to: memory/self_audit_report.json`);
    }

    return report;
}

module.exports = { main, getAllJsFiles, checkDeadCode, checkSyntax, checkBrokenDependencies };

if (require.main === module) {
    main();
}
