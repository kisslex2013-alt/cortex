#!/usr/bin/env node
/**
 * 🧹 Jarvis Repository Sanitizer v1.0
 * Case #17: The Code Warden
 * 
 * Objectives:
 * 1. Scan codebase for technical debt (TODO, FIXME).
 * 2. Detect hardcoded secrets or sensitive patterns.
 * 3. Identify stale files (not modified in >60 days).
 * 4. Generate a maintenance report.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const REPORT_FILE = path.join(ROOT, 'memory/maintenance_report.md');

// Directories to scan
const SCAN_DIRS = ['src', 'scripts', 'skills'];
// Files/Dirs to ignore
const IGNORE_PATTERNS = ['node_modules', '.git', 'package-lock.json', 'yarn.lock', '.DS_Store', 'dist', 'build'];

// Secret patterns (heuristic)
const SECRET_REGEX = [
    { name: 'OpenAI Key', regex: /sk-[a-zA-Z0-9]{20,}T3BlbkFJ/ }, // Typical sk-... pattern
    { name: 'Generic API Key', regex: /(api_key|token|secret)\s*[:=]\s*['"`][a-zA-Z0-9_\-]{20,}['"`]/i },
    { name: 'Private Key', regex: /-----BEGIN PRIVATE KEY-----/ }
];

// Debt patterns
const DEBT_REGEX = [
    { name: 'TODO', regex: /\/\/\s*TODO:/i },
    { name: 'FIXME', regex: /\/\/\s*FIXME:/i },
    { name: 'HACK', regex: /\/\/\s*HACK:/i }
];

let stats = {
    filesScanned: 0,
    debtItems: [],
    potentialSecrets: [],
    staleFiles: []
};

/**
 * Recursively scan directory
 */
function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        if (IGNORE_PATTERNS.includes(file)) continue;
        
        const fullPath = path.join(dir, file);
        const relPath = path.relative(ROOT, fullPath);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else {
            stats.filesScanned++;
            
            // Check Stale (modified > 60 days ago)
            const daysSinceMod = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
            if (daysSinceMod > 60) {
                stats.staleFiles.push({ path: relPath, days: Math.round(daysSinceMod) });
            }

            // Read content
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const lines = content.split('\n');

                lines.forEach((line, index) => {
                    // Check Debt
                    DEBT_REGEX.forEach(debt => {
                        if (debt.regex.test(line)) {
                            stats.debtItems.push({
                                type: debt.name,
                                path: relPath,
                                line: index + 1,
                                content: line.trim()
                            });
                        }
                    });

                    // Check Secrets (Simplified check, avoid logging actual secret)
                    SECRET_REGEX.forEach(sec => {
                        if (sec.regex.test(line)) {
                            stats.potentialSecrets.push({
                                type: sec.name,
                                path: relPath,
                                line: index + 1
                            });
                        }
                    });
                });
            } catch (e) {
                // Ignore binary files or read errors
            }
        }
    }
}

/**
 * Generate Report
 */
function generateReport() {
    let report = `# 🧹 Jarvis Code Warden Report\n`;
    report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
    report += `**Files Scanned:** ${stats.filesScanned}\n\n`;

    report += `## 🚨 Security Alerts (${stats.potentialSecrets.length})\n`;
    if (stats.potentialSecrets.length > 0) {
        report += `> **WARNING:** Review these files immediately for hardcoded secrets.\n\n`;
        stats.potentialSecrets.forEach(s => {
            report += `- [ ] **${s.type}** in \`${s.path}:${s.line}\`\n`;
        });
    } else {
        report += `✅ No obvious hardcoded secrets found.\n`;
    }
    report += `\n`;

    report += `## 🛠️ Technical Debt (${stats.debtItems.length})\n`;
    if (stats.debtItems.length > 0) {
        // Group by file
        const byFile = {};
        stats.debtItems.forEach(item => {
            if (!byFile[item.path]) byFile[item.path] = [];
            byFile[item.path].push(item);
        });

        for (const [file, items] of Object.entries(byFile)) {
            report += `### \`${file}\`\n`;
            items.forEach(i => {
                report += `- **${i.type}**: ${i.content.replace(/\/\/\s*(TODO|FIXME|HACK):/i, '').trim()} (L${i.line})\n`;
            });
            report += `\n`;
        }
    } else {
        report += `✅ Codebase is clean of TODO/FIXME tags.\n`;
    }

    report += `## 🏚️ Stale Files (>60 days) (${stats.staleFiles.length})\n`;
    if (stats.staleFiles.length > 0) {
        report += `Consider archiving or deleting:\n`;
        stats.staleFiles.sort((a, b) => b.days - a.days).slice(0, 10).forEach(f => {
            report += `- \`${f.path}\`: ${f.days} days old\n`;
        });
        if (stats.staleFiles.length > 10) report += `...and ${stats.staleFiles.length - 10} more.\n`;
    } else {
        report += `✅ All files are fresh.\n`;
    }

    fs.writeFileSync(REPORT_FILE, report);
    console.log(`✅ Report generated at: ${REPORT_FILE}`);
    return report;
}

// Execution
if (require.main === module) {
    console.log('🧹 Code Warden: Starting scan...');
    SCAN_DIRS.forEach(d => scanDir(path.join(ROOT, d)));
    generateReport();
}
