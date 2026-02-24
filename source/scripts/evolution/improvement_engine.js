#!/usr/bin/env node
/**
 * scripts/evolution/improvement_engine.js — AGI Proactive Improvement Engine v1.0
 * 
 * 🧠 Phase 3: Analyzes audit + refactor reports and proposes improvements
 * 
 * What it does:
 * 1. Reads self_audit_report.json + self_refactor_report.json
 * 2. Prioritizes improvements by impact/effort
 * 3. Classifies: AUTO (do it) / NOTIFY (tell owner) / ASK (need permission)
 * 4. Generates actionable Telegram summary (not spam — concise)
 * 5. Tracks improvement history over time
 * 
 * Usage:
 *   node scripts/evolution/improvement_engine.js              # full analysis
 *   node scripts/evolution/improvement_engine.js --telegram    # Telegram-ready summary
 *   node scripts/evolution/improvement_engine.js --json        # JSON for automation
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const MEMORY_DIR = path.join(ROOT, 'memory');
const AUDIT_REPORT = path.join(MEMORY_DIR, 'self_audit_report.json');
const REFACTOR_REPORT = path.join(MEMORY_DIR, 'self_refactor_report.json');
const HISTORY_FILE = path.join(MEMORY_DIR, 'improvement_history.json');

// ═══════════════════════════════════════════════
// IMPROVEMENT CATEGORIES
// ═══════════════════════════════════════════════

const CATEGORY = {
    AUTO: '✅ AUTO',       // Bot can do it without asking
    NOTIFY: '📢 NOTIFY',   // Do it, notify owner after
    ASK: '🔴 ASK',         // Need owner permission
};

const PRIORITY = {
    CRITICAL: { label: '🔴 CRITICAL', score: 100 },
    HIGH: { label: '🟠 HIGH', score: 75 },
    MEDIUM: { label: '🟡 MEDIUM', score: 50 },
    LOW: { label: '🟢 LOW', score: 25 },
    INFO: { label: 'ℹ️ INFO', score: 10 },
};

// ═══════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════

function analyzeAuditReport(report) {
    const proposals = [];
    if (!report || !report.issues) return proposals;

    // Group issues by type
    const byType = {};
    for (const issue of report.issues) {
        if (!byType[issue.issue]) byType[issue.issue] = [];
        byType[issue.issue].push(issue);
    }

    // ── Syntax Errors → AUTO fix ──
    if (byType.SYNTAX_ERROR && byType.SYNTAX_ERROR.length > 0) {
        proposals.push({
            id: 'fix-syntax',
            title: `Fix ${byType.SYNTAX_ERROR.length} syntax error(s)`,
            category: CATEGORY.AUTO,
            priority: PRIORITY.CRITICAL,
            action: 'Run: node scripts/evolution/self_refactor.js --apply',
            files: byType.SYNTAX_ERROR.map(i => i.file),
            effort: 'minimal',
            impact: 'high — broken code',
        });
    }

    // ── Unused Imports → AUTO cleanup ──
    const importFixes = byType.DEAD_CODE ? [] : []; // handled by refactor
    // Check refactor report for pending import fixes

    // ── Dead Code → NOTIFY + quarantine ──
    if (byType.DEAD_CODE && byType.DEAD_CODE.length > 10) {
        proposals.push({
            id: 'quarantine-dead-code',
            title: `Quarantine ${byType.DEAD_CODE.length} dead script(s)`,
            category: CATEGORY.NOTIFY,
            priority: PRIORITY.MEDIUM,
            action: 'Run: node scripts/evolution/self_refactor.js --quarantine',
            files: byType.DEAD_CODE.slice(0, 5).map(i => i.file),
            extraFiles: byType.DEAD_CODE.length > 5 ? byType.DEAD_CODE.length - 5 : 0,
            effort: 'low',
            impact: 'cleaner codebase, easier navigation',
        });
    }

    // ── Large Files → ASK for refactor ──
    if (byType.LARGE_FILE && byType.LARGE_FILE.length > 0) {
        const sorted = byType.LARGE_FILE.sort((a, b) => (b.lines || 0) - (a.lines || 0));
        const worst = sorted[0];
        proposals.push({
            id: 'split-large-files',
            title: `Split ${sorted.length} oversized file(s)`,
            category: CATEGORY.ASK,
            priority: PRIORITY.LOW,
            action: `Worst: ${worst.file} (${worst.lines} lines) — needs manual planning`,
            files: sorted.slice(0, 3).map(i => `${i.file} (${i.lines} lines)`),
            effort: 'high',
            impact: 'better maintainability',
        });
    }

    // ── Missing Tests → INFO ──
    if (byType.NO_TEST && byType.NO_TEST.length > 20) {
        const criticalFiles = byType.NO_TEST.filter(i =>
            i.file.includes('dispatcher') || i.file.includes('cortex') || i.file.includes('survival')
        );
        if (criticalFiles.length > 0) {
            proposals.push({
                id: 'add-critical-tests',
                title: `Add tests for ${criticalFiles.length} critical module(s)`,
                category: CATEGORY.ASK,
                priority: PRIORITY.LOW,
                action: 'Focus on: dispatcher/, cortex/, survival/ — highest impact',
                files: criticalFiles.slice(0, 5).map(i => i.file),
                effort: 'high',
                impact: 'prevents regressions',
            });
        }
    }

    // ── Research suggestions → NOTIFY ──
    if (report.researchSuggestions && report.researchSuggestions.length > 0) {
        const highPriority = report.researchSuggestions.filter(s =>
            s.priority === 'HIGH' || s.priority === 'CRITICAL'
        );
        if (highPriority.length > 0) {
            proposals.push({
                id: 'research-needed',
                title: `${highPriority.length} research topic(s) for self-improvement`,
                category: CATEGORY.NOTIFY,
                priority: PRIORITY.LOW,
                action: 'Review research prompts in self_audit report',
                details: highPriority.map(s => `[${s.priority}] ${s.area}: ${s.reason}`),
                effort: 'medium',
                impact: 'long-term capability growth',
            });
        }
    }

    return proposals;
}

function analyzeRefactorReport(report) {
    const proposals = [];
    if (!report) return proposals;

    // Check if there are pending fixes that weren't applied
    if (report.mode === 'dry-run' && report.fixes && report.fixes.length > 0) {
        const importFixes = report.fixes.filter(f => f.type === 'UNUSED_IMPORT');
        if (importFixes.length > 0) {
            proposals.push({
                id: 'apply-import-fixes',
                title: `Apply ${importFixes.length} pending import cleanup(s)`,
                category: CATEGORY.AUTO,
                priority: PRIORITY.HIGH,
                action: 'Run: node scripts/evolution/self_refactor.js --apply',
                files: importFixes.map(f => path.relative(ROOT, f.file)),
                effort: 'minimal',
                impact: 'cleaner code',
            });
        }
    }

    return proposals;
}

// ═══════════════════════════════════════════════
// HEALTH TREND
// ═══════════════════════════════════════════════

function loadHistory() {
    if (fs.existsSync(HISTORY_FILE)) {
        try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
        catch { return []; }
    }
    return [];
}

function saveHistory(entry) {
    const history = loadHistory();
    history.push(entry);
    // Keep last 90 entries (3 months daily)
    const trimmed = history.slice(-90);
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
}

function getTrend(history) {
    if (history.length < 2) return '📊 Not enough data for trend';

    const recent = history.slice(-7);
    const scores = recent.map(h => h.healthScore);
    const trend = scores[scores.length - 1] - scores[0];

    if (trend > 5) return `📈 Improving (+${trend} over ${recent.length} checks)`;
    if (trend < -5) return `📉 Declining (${trend} over ${recent.length} checks)`;
    return `➡️ Stable (±${Math.abs(trend)} over ${recent.length} checks)`;
}

// ═══════════════════════════════════════════════
// OUTPUT FORMATTERS
// ═══════════════════════════════════════════════

function formatTelegram(proposals, health, trend) {
    const lines = [];
    lines.push('🧬 **Self-Evolution Report**');
    lines.push(`Health: ${health.healthScore}/100 (${health.grade}) ${trend}`);
    lines.push('');

    // Sort by priority score
    const sorted = proposals.sort((a, b) => b.priority.score - a.priority.score);

    // Show top 5 max
    const top = sorted.slice(0, 5);
    for (const p of top) {
        lines.push(`${p.priority.label} ${p.category}`);
        lines.push(`  ${p.title}`);
        if (p.action) lines.push(`  → ${p.action}`);
        lines.push('');
    }

    if (sorted.length > 5) {
        lines.push(`... and ${sorted.length - 5} more suggestions`);
    }

    return lines.join('\n');
}

function formatConsole(proposals, health, trend) {
    console.log('🧠 Jarvis Improvement Engine v1.0');
    console.log('═'.repeat(50));
    console.log(`📊 Health: ${health.healthScore}/100 (Grade ${health.grade})`);
    console.log(`📈 Trend: ${trend}`);
    console.log(`💡 Proposals: ${proposals.length}`);
    console.log('═'.repeat(50));

    // Group by category
    const groups = {
        [CATEGORY.AUTO]: [],
        [CATEGORY.NOTIFY]: [],
        [CATEGORY.ASK]: [],
    };

    for (const p of proposals) {
        if (groups[p.category]) groups[p.category].push(p);
    }

    for (const [cat, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        console.log(`\n${cat} (${items.length}):`);
        for (const p of items) {
            console.log(`  ${p.priority.label} ${p.title}`);
            console.log(`     Effort: ${p.effort} | Impact: ${p.impact}`);
            if (p.action) console.log(`     → ${p.action}`);
            if (p.files) {
                p.files.slice(0, 3).forEach(f => console.log(`       · ${f}`));
                if (p.files.length > 3) console.log(`       ... +${p.files.length - 3} more`);
            }
        }
    }
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
    const args = process.argv.slice(2);
    const telegramMode = args.includes('--telegram');
    const jsonMode = args.includes('--json');

    // Load reports
    let auditReport = null;
    let refactorReport = null;

    if (fs.existsSync(AUDIT_REPORT)) {
        try { auditReport = JSON.parse(fs.readFileSync(AUDIT_REPORT, 'utf8')); }
        catch { console.error('⚠️ Could not parse audit report'); }
    }

    if (fs.existsSync(REFACTOR_REPORT)) {
        try { refactorReport = JSON.parse(fs.readFileSync(REFACTOR_REPORT, 'utf8')); }
        catch { /* optional */ }
    }

    if (!auditReport) {
        console.error('❌ No audit report found. Run self_audit.js first.');
        process.exit(1);
    }

    // Analyze
    const proposals = [
        ...analyzeAuditReport(auditReport),
        ...analyzeRefactorReport(refactorReport),
    ];

    // Sort by priority (highest first)
    proposals.sort((a, b) => b.priority.score - a.priority.score);

    // Health & trend
    const health = auditReport.health || { healthScore: 0, grade: '?' };
    const history = loadHistory();
    const trend = getTrend(history);

    // Save this check to history
    saveHistory({
        date: new Date().toISOString().split('T')[0],
        healthScore: health.healthScore,
        totalIssues: health.totalIssues,
        proposals: proposals.length,
        autoFixable: proposals.filter(p => p.category === CATEGORY.AUTO).length,
    });

    // Output
    if (jsonMode) {
        console.log(JSON.stringify({ health, trend, proposals }, null, 2));
    } else if (telegramMode) {
        console.log(formatTelegram(proposals, health, trend));
    } else {
        formatConsole(proposals, health, trend);
    }

    return { health, trend, proposals };
}

module.exports = { main, analyzeAuditReport, analyzeRefactorReport };

if (require.main === module) {
    main();
}
