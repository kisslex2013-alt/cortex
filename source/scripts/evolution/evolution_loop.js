#!/usr/bin/env node
/**
 * scripts/evolution/evolution_loop.js — AGI Evolution Orchestrator v1.0
 * 
 * 🔄 Master loop that chains all 5 phases:
 *   Phase 1: self_audit.js    → diagnose codebase health
 *   Phase 2: self_refactor.js → auto-fix safe issues
 *   Phase 3: improvement_engine.js → classify & prioritize
 *   Phase 4: self_learning.js → record lessons & trends
 *   Phase 5: web_scout.js     → internet intelligence
 * 
 * Modes:
 *   --full       Full cycle: audit + refactor + improve + learn + scout (default)
 *   --quick      Quick cycle: audit + improve only (no web requests)
 *   --telegram   Output as Telegram digest
 *   --auto-fix   Actually apply AUTO-level fixes (import cleanup)
 *   --dry-run    Show what would happen without doing anything
 * 
 * Designed to run via cron:
 *   Full cycle:  Every day at 09:00
 *   Quick check: Every 6 hours
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const MEMORY_DIR = path.join(ROOT, 'memory');
const DIGEST_FILE = path.join(MEMORY_DIR, 'evolution_digest.json');

// ═══════════════════════════════════════════════
// PHASE RUNNERS
// ═══════════════════════════════════════════════

function runPhase(name, script, args = '') {
    try {
        const cmd = `node "${path.join(ROOT, script)}" ${args}`;
        const output = execSync(cmd, {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: 120000, // 2 min max per phase
            env: { ...process.env, JARVIS_ROOT: ROOT },
        });
        return { success: true, output: output.trim() };
    } catch (err) {
        return { success: false, output: err.stderr || err.message };
    }
}

function loadReport(filePath) {
    const full = path.join(ROOT, filePath);
    if (fs.existsSync(full)) {
        try { return JSON.parse(fs.readFileSync(full, 'utf8')); }
        catch { return null; }
    }
    return null;
}

// ═══════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════

async function main() {
    const args = process.argv.slice(2);
    const telegramMode = args.includes('--telegram');
    const quickMode = args.includes('--quick');
    const autoFix = args.includes('--auto-fix');
    const dryRun = args.includes('--dry-run');

    const startTime = Date.now();
    const results = {
        timestamp: new Date().toISOString(),
        mode: quickMode ? 'quick' : 'full',
        autoFix,
        dryRun,
        phases: {},
        summary: {},
    };

    const log = (msg) => { if (!telegramMode) console.log(msg); };

    log('🔄 Jarvis Evolution Loop v1.0');
    log('═'.repeat(50));
    log(`   Mode: ${quickMode ? '⚡ Quick' : '🔄 Full'} | Auto-fix: ${autoFix ? '✅' : '❌'} | Dry-run: ${dryRun ? '✅' : '❌'}`);
    log('═'.repeat(50));

    // ── Phase 1: Self-Audit ──
    log('\n📋 Phase 1: Self-Audit...');
    const auditResult = runPhase('Audit', 'scripts/evolution/self_audit.js', '--json');
    results.phases.audit = auditResult.success;

    let auditReport = null;
    if (auditResult.success) {
        try { auditReport = JSON.parse(auditResult.output); } catch { }
    }
    if (!auditReport) {
        auditReport = loadReport('memory/self_audit_report.json');
    }

    if (auditReport) {
        results.summary.health = auditReport.health;
        log(`   Health: ${auditReport.health.healthScore}/100 (${auditReport.health.grade})`);
        log(`   Issues: ${auditReport.health.totalIssues} (${auditReport.health.critical} critical)`);
    } else {
        log('   ⚠️ Audit failed or no report');
    }

    // ── Phase 2: Self-Refactor (AUTO only) ──
    if (autoFix && !dryRun) {
        log('\n🔧 Phase 2: Self-Refactor (AUTO fixes)...');
        const refactorResult = runPhase('Refactor', 'scripts/evolution/self_refactor.js', '--apply');
        results.phases.refactor = refactorResult.success;

        if (refactorResult.success) {
            // Parse how many fixes were applied
            const match = refactorResult.output.match(/Applied.*?(\d+)/);
            const fixCount = match ? parseInt(match[1]) : 0;
            results.summary.autoFixes = fixCount;
            log(`   Applied ${fixCount} auto-fixes`);
        }
    } else if (autoFix && dryRun) {
        log('\n🔧 Phase 2: Self-Refactor (DRY RUN)...');
        const refactorResult = runPhase('Refactor', 'scripts/evolution/self_refactor.js', '--report');
        results.phases.refactor = refactorResult.success;
        log('   Dry-run complete (no changes applied)');
    } else {
        log('\n🔧 Phase 2: Self-Refactor — skipped (use --auto-fix to enable)');
        results.phases.refactor = 'skipped';
    }

    // ── Phase 3: Improvement Engine ──
    log('\n💡 Phase 3: Improvement Engine...');
    const improveResult = runPhase('Improve', 'scripts/evolution/improvement_engine.js', '--json');
    results.phases.improve = improveResult.success;

    let improveReport = null;
    if (improveResult.success) {
        try { improveReport = JSON.parse(improveResult.output); } catch { }
    }

    if (improveReport) {
        const auto = (improveReport.proposals || []).filter(p => p.classification === 'AUTO').length;
        const notify = (improveReport.proposals || []).filter(p => p.classification === 'NOTIFY').length;
        const ask = (improveReport.proposals || []).filter(p => p.classification === 'ASK').length;
        results.summary.proposals = { auto, notify, ask, total: auto + notify + ask };
        log(`   Proposals: ${auto} AUTO | ${notify} NOTIFY | ${ask} ASK`);
    }

    // ── Phase 4: Self-Learning ──
    log('\n📝 Phase 4: Self-Learning...');
    const learnResult = runPhase('Learn', 'scripts/evolution/self_learning.js');
    results.phases.learn = learnResult.success;

    if (learnResult.success) {
        // Record this evolution cycle as a learning
        if (!dryRun) {
            const grade = auditReport ? auditReport.health.grade : '?';
            const score = auditReport ? auditReport.health.healthScore : '?';
            runPhase('LogLearn', 'scripts/evolution/self_learning.js',
                `--log "Evolution cycle: Health ${score}/100 (${grade}). Mode: ${quickMode ? 'quick' : 'full'}"`);
        }
        log('   Learning recorded');
    }

    // ── Phase 5: Web Scout (full mode only) ──
    if (!quickMode) {
        log('\n🌐 Phase 5: Web Scout...');
        const scoutResult = runPhase('Scout', 'scripts/evolution/web_scout.js', '--json');
        results.phases.scout = scoutResult.success;

        let scoutReport = null;
        if (scoutResult.success) {
            try { scoutReport = JSON.parse(scoutResult.output); } catch { }
        }

        if (scoutReport) {
            results.summary.webIntel = {
                findings: scoutReport.totalFindings || 0,
                proposals: (scoutReport.proposals || []).length,
            };
            log(`   Found ${scoutReport.totalFindings || 0} relevant items`);
        }
    } else {
        log('\n🌐 Phase 5: Web Scout — skipped (quick mode)');
        results.phases.scout = 'skipped';
    }

    // ═══════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    results.summary.elapsedSeconds = parseFloat(elapsed);

    const passed = Object.values(results.phases).filter(v => v === true).length;
    const total = Object.values(results.phases).filter(v => v !== 'skipped').length;
    results.summary.phasesOk = `${passed}/${total}`;

    // Save digest
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

    const history = [];
    if (fs.existsSync(DIGEST_FILE)) {
        try { history.push(...JSON.parse(fs.readFileSync(DIGEST_FILE, 'utf8'))); } catch { }
    }
    history.push(results);
    fs.writeFileSync(DIGEST_FILE, JSON.stringify(history.slice(-30), null, 2));

    // ── Output ──
    if (telegramMode) {
        console.log(formatTelegram(results));
    } else {
        log('\n' + '═'.repeat(50));
        log('📊 EVOLUTION CYCLE COMPLETE');
        log('═'.repeat(50));
        const h = results.summary.health;
        if (h) log(`   🏥 Health: ${h.healthScore}/100 (${h.grade})`);
        log(`   ✅ Phases: ${results.summary.phasesOk}`);
        if (results.summary.autoFixes) log(`   🔧 Auto-fixes: ${results.summary.autoFixes}`);
        if (results.summary.proposals) {
            const p = results.summary.proposals;
            log(`   💡 Proposals: ${p.total} (${p.auto} auto, ${p.notify} notify, ${p.ask} ask)`);
        }
        if (results.summary.webIntel) {
            log(`   🌐 Web intel: ${results.summary.webIntel.findings} findings`);
        }
        log(`   ⏱️ Time: ${elapsed}s`);
        log(`\n   📄 Digest saved to: memory/evolution_digest.json`);
    }
}

// ═══════════════════════════════════════════════
// TELEGRAM FORMAT
// ═══════════════════════════════════════════════

function formatTelegram(results) {
    const lines = [];
    const h = results.summary.health;

    lines.push('🔄 **Evolution Cycle Report**');
    lines.push(`Mode: ${results.mode} | ${results.summary.phasesOk} phases OK`);
    lines.push('');

    if (h) {
        const emoji = h.healthScore >= 75 ? '🟢' : h.healthScore >= 40 ? '🟡' : '🔴';
        lines.push(`${emoji} Health: **${h.healthScore}/100** (${h.grade})`);
        lines.push(`   Critical: ${h.critical} | Warnings: ${h.warnings}`);
    }

    if (results.summary.autoFixes) {
        lines.push(`🔧 Auto-fixed: ${results.summary.autoFixes} issues`);
    }

    if (results.summary.proposals) {
        const p = results.summary.proposals;
        if (p.ask > 0) {
            lines.push(`\n🔴 **${p.ask} action(s) need your approval** — run improvement_engine for details`);
        }
        if (p.notify > 0) {
            lines.push(`📢 ${p.notify} notification(s)`);
        }
    }

    if (results.summary.webIntel && results.summary.webIntel.findings > 0) {
        lines.push(`\n🌐 Web Scout: ${results.summary.webIntel.findings} items found`);
    }

    lines.push(`\n⏱️ ${results.summary.elapsedSeconds}s`);
    return lines.join('\n');
}

module.exports = { main };

if (require.main === module) {
    main().catch(e => console.error('❌ Evolution loop error:', e.message));
}
