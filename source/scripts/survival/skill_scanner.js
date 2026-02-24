#!/usr/bin/env node
/**
 * 🛡️ Skill Scanner v1.0 — Agentic Rating Agency (RA)
 * 
 * Static analysis tool for third-party OpenClaw skills.
 * Detects malicious patterns, data exfiltration, credential theft,
 * dangerous commands, file system tampering, and obfuscation.
 * 
 * Usage:
 *   CLI:  node scripts/survival/skill_scanner.js ./skills/some-skill
 *   API:  const { scan } = require('./skill_scanner'); scan('./path');
 * 
 * Trust Score: 1.0 (safe) → 0.0 (malicious)
 * Output: JSON report + human-readable summary
 * 
 * Philosophy: Hashline-deterministic — every finding is pinpointed
 * to exact file:line with verifiable context.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Configuration ───────────────────────────────────────────────────

const VERSION = '1.0.0';
const INITIAL_TRUST_SCORE = 1.0;
const MIN_TRUST_SCORE = 0.0;

/**
 * Whitelisted domains that are expected in OpenClaw skills.
 * Network calls to these domains are NOT flagged.
 */
const WHITELISTED_DOMAINS = [
    'api.moltbook.com',
    'moltbook.com',
    'api.github.com',
    'github.com',
    'raw.githubusercontent.com',
    'npmjs.org',
    'registry.npmjs.org',
    'localhost',
    '127.0.0.1',
    'api.telegram.org',
    'ton.org',
    'toncenter.com',
];

/**
 * File extensions to scan (text-based files only).
 */
const SCANNABLE_EXTENSIONS = new Set([
    '.js', '.ts', '.mjs', '.cjs',
    '.sh', '.bash', '.zsh',
    '.py', '.rb', '.pl',
    '.md', '.txt', '.yaml', '.yml', '.json',
    '.env.example', '.toml', '.ini', '.cfg',
]);

/**
 * Max file size to scan (skip binary blobs > 1MB).
 */
const MAX_FILE_SIZE = 1024 * 1024;

// ─── Red Flag Detector Rules ────────────────────────────────────────

/**
 * Each rule: { id, category, severity, penalty, pattern (RegExp), description }
 * pattern is tested against each line of each file.
 */
const LINE_RULES = [
    // ── Category 1: Network Exfiltration ──
    {
        id: 'NET-001',
        category: 'NETWORK_EXFILTRATION',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\bcurl\s+.*-X\s*(POST|PUT)\b/i,
        description: 'curl with POST/PUT request — potential data exfiltration',
    },
    {
        id: 'NET-002',
        category: 'NETWORK_EXFILTRATION',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\bwget\s+.*--post/i,
        description: 'wget with POST data — potential data exfiltration',
    },
    {
        id: 'NET-003',
        category: 'NETWORK_EXFILTRATION',
        severity: 'MEDIUM',
        penalty: -0.10,
        pattern: /\bfetch\s*\(/,
        description: 'fetch() call — verify target URL is trusted',
    },
    {
        id: 'NET-004',
        category: 'NETWORK_EXFILTRATION',
        severity: 'MEDIUM',
        penalty: -0.10,
        pattern: /\baxios\s*[\.(]/,
        description: 'axios HTTP client usage — verify target URL is trusted',
    },
    {
        id: 'NET-005',
        category: 'NETWORK_EXFILTRATION',
        severity: 'MEDIUM',
        penalty: -0.10,
        pattern: /\bhttp\.request\s*\(|https\.request\s*\(/,
        description: 'Node.js http/https request — verify target URL',
    },
    {
        id: 'NET-006',
        category: 'NETWORK_EXFILTRATION',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\b(webhook|discord\.com\/api\/webhooks|hooks\.slack\.com)\b/i,
        description: 'External webhook URL — possible data exfiltration endpoint',
    },
    {
        id: 'NET-007',
        category: 'NETWORK_EXFILTRATION',
        severity: 'MEDIUM',
        penalty: -0.10,
        pattern: /\bcurl\b|\bwget\b/,
        description: 'Network download tool (curl/wget) — review usage context',
    },

    // ── Category 2: Credential Theft ──
    {
        id: 'CRED-001',
        category: 'CREDENTIAL_THEFT',
        severity: 'CRITICAL',
        penalty: -0.20,
        pattern: /cat\s+.*\.env\b|readFile.*\.env|fs\.read.*\.env/,
        description: 'Reading .env file — potential credential theft',
    },
    {
        id: 'CRED-002',
        category: 'CREDENTIAL_THEFT',
        severity: 'CRITICAL',
        penalty: -0.20,
        pattern: /openclaw\.json/,
        description: 'Accessing openclaw.json — contains sensitive config',
    },
    {
        id: 'CRED-003',
        category: 'CREDENTIAL_THEFT',
        severity: 'CRITICAL',
        penalty: -0.20,
        pattern: /~\/\.ssh\/|\/\.ssh\/|id_rsa|id_ed25519|authorized_keys/,
        description: 'Accessing SSH keys/config — potential key theft',
    },
    {
        id: 'CRED-004',
        category: 'CREDENTIAL_THEFT',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\/\.config\/|~\/\.config\//,
        description: 'Accessing .config directory — may contain tokens/secrets',
    },
    {
        id: 'CRED-005',
        category: 'CREDENTIAL_THEFT',
        severity: 'CRITICAL',
        penalty: -0.20,
        pattern: /VAULT_PASSWORD|PRIVATE_KEY|SECRET_KEY|API_KEY|ACCESS_TOKEN/,
        description: 'References to secret/token variable names',
    },
    {
        id: 'CRED-006',
        category: 'CREDENTIAL_THEFT',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /process\.env\[|process\.env\./,
        description: 'Reading process environment variables — verify intent',
    },

    // ── Category 3: Dangerous Commands ──
    {
        id: 'CMD-001',
        category: 'DANGEROUS_COMMANDS',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\bexec\s*\(|execSync\s*\(/,
        description: 'exec() — arbitrary command execution',
    },
    {
        id: 'CMD-002',
        category: 'DANGEROUS_COMMANDS',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\bspawn\s*\(|spawnSync\s*\(/,
        description: 'spawn() — process spawning',
    },
    {
        id: 'CMD-003',
        category: 'DANGEROUS_COMMANDS',
        severity: 'CRITICAL',
        penalty: -0.20,
        pattern: /\beval\s*\(/,
        description: 'eval() — arbitrary code execution',
    },
    {
        id: 'CMD-004',
        category: 'DANGEROUS_COMMANDS',
        severity: 'CRITICAL',
        penalty: -0.20,
        pattern: /new\s+Function\s*\(/,
        description: 'new Function() — dynamic code generation',
    },
    {
        id: 'CMD-005',
        category: 'DANGEROUS_COMMANDS',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /require\s*\(\s*['"]child_process['"]\s*\)/,
        description: 'child_process import — enables shell commands',
    },
    {
        id: 'CMD-006',
        category: 'DANGEROUS_COMMANDS',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\bvm\.runIn|vm\.createContext|vm\.Script/,
        description: 'Node.js vm module — sandboxed but risky code execution',
    },

    // ── Category 4: File System Tampering ──
    {
        id: 'FS-001',
        category: 'FILESYSTEM_TAMPERING',
        severity: 'HIGH',
        penalty: -0.10,
        pattern: /writeFile|writeFileSync|appendFile|appendFileSync/,
        description: 'File write operation — verify target is within skill directory',
    },
    {
        id: 'FS-002',
        category: 'FILESYSTEM_TAMPERING',
        severity: 'CRITICAL',
        penalty: -0.15,
        pattern: /rm\s+-rf\s+\/|rmdir.*--recursive\s+\//,
        description: 'Recursive delete from root — destructive operation!',
    },
    {
        id: 'FS-003',
        category: 'FILESYSTEM_TAMPERING',
        severity: 'HIGH',
        penalty: -0.10,
        pattern: /\.\.\/\.\.\/|\.\.\\\.\.\\/,
        description: 'Directory traversal pattern (../../) — path escape attempt',
    },
    {
        id: 'FS-004',
        category: 'FILESYSTEM_TAMPERING',
        severity: 'MEDIUM',
        penalty: -0.10,
        pattern: /\/etc\/passwd|\/etc\/shadow|\/etc\/hosts/,
        description: 'Accessing system files — suspicious intent',
    },
    {
        id: 'FS-005',
        category: 'FILESYSTEM_TAMPERING',
        severity: 'HIGH',
        penalty: -0.10,
        pattern: /chmod\s+[0-7]{3,4}\s|chown\s+/,
        description: 'Changing file permissions/ownership — verify intent',
    },
    {
        id: 'FS-006',
        category: 'FILESYSTEM_TAMPERING',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /\bunlink\s*\(|unlinkSync\s*\(/,
        description: 'File deletion — verify scope is within skill directory',
    },

    // ── Category 5: Obfuscation & Blobs ──
    {
        id: 'OBF-001',
        category: 'OBFUSCATION',
        severity: 'HIGH',
        penalty: -0.10,
        pattern: /\batob\s*\(/,
        description: 'atob() — base64 decoding, potential payload unpacking',
    },
    {
        id: 'OBF-002',
        category: 'OBFUSCATION',
        severity: 'HIGH',
        penalty: -0.10,
        pattern: /Buffer\.from\s*\([^)]*,\s*['"]base64['"]\s*\)/,
        description: 'Buffer.from(x, "base64") — potential hidden payload',
    },
    {
        id: 'OBF-003',
        category: 'OBFUSCATION',
        severity: 'MEDIUM',
        penalty: -0.10,
        pattern: /\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}/,
        description: 'Hex-escaped strings — potential obfuscated code',
    },
    {
        id: 'OBF-004',
        category: 'OBFUSCATION',
        severity: 'MEDIUM',
        penalty: -0.10,
        pattern: /\\u[0-9a-fA-F]{4}.*\\u[0-9a-fA-F]{4}.*\\u[0-9a-fA-F]{4}/,
        description: 'Unicode-escaped strings — potential obfuscated code',
    },
    {
        id: 'OBF-005',
        category: 'OBFUSCATION',
        severity: 'HIGH',
        penalty: -0.15,
        pattern: /[A-Za-z0-9+/=]{100,}/,
        description: 'Long base64-like string (>100 chars) — possible encoded payload',
    },
];

/**
 * Structural rules are applied at the file level (not per-line).
 */
const STRUCTURAL_RULES = [
    {
        id: 'STRUCT-001',
        category: 'OBFUSCATION',
        severity: 'MEDIUM',
        penalty: -0.10,
        check: (content, lines) => {
            // Detect minified/obfuscated JS: lines > 500 chars without spaces
            const longLines = [];
            lines.forEach((line, idx) => {
                const stripped = line.replace(/\s/g, '');
                if (stripped.length > 500 && line.length > 500) {
                    longLines.push(idx + 1);
                }
            });
            return longLines.length > 0
                ? { hit: true, lines: longLines, detail: `${longLines.length} extremely long line(s) — possible minified/obfuscated code` }
                : { hit: false };
        },
        description: 'Minified/obfuscated code (lines >500 chars without spaces)',
    },
    {
        id: 'STRUCT-002',
        category: 'CREDENTIAL_THEFT',
        severity: 'HIGH',
        penalty: -0.15,
        check: (content) => {
            // Detect reading common secret file patterns
            const secretPaths = [
                '/etc/shadow', '~/.bashrc', '~/.bash_history',
                '~/.npmrc', '~/.gitconfig', '~/.netrc',
            ];
            const found = secretPaths.filter(p => content.includes(p));
            return found.length > 0
                ? { hit: true, detail: `References to sensitive files: ${found.join(', ')}` }
                : { hit: false };
        },
        description: 'References to common sensitive system files',
    },
];

// ─── Network URL Analysis ───────────────────────────────────────────

/**
 * Checks if a URL or domain in a line is NOT whitelisted.
 * Returns { suspicious: boolean, domain: string|null }
 */
function checkUrlSafety(line) {
    // Extract URLs from the line
    const urlPattern = /https?:\/\/([^\s"'`\)>\]]+)/gi;
    let match;
    const suspiciousDomains = [];

    while ((match = urlPattern.exec(line)) !== null) {
        const fullUrl = match[0];
        const domainPart = match[1].split('/')[0].split(':')[0]; // strip path and port

        const isWhitelisted = WHITELISTED_DOMAINS.some(wd =>
            domainPart === wd || domainPart.endsWith('.' + wd)
        );

        if (!isWhitelisted) {
            suspiciousDomains.push({ url: fullUrl, domain: domainPart });
        }
    }

    return suspiciousDomains;
}

// ─── File Collection ────────────────────────────────────────────────

/**
 * Recursively collects all scannable files from the skill directory.
 * @param {string} dirPath - Directory to scan
 * @param {string} basePath - Original skill root (for relative paths)
 * @returns {Array<{absPath: string, relPath: string, size: number}>}
 */
function collectFiles(dirPath, basePath = dirPath) {
    const results = [];

    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err) {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip hidden dirs (except .config reference detection) and node_modules
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            results.push(...collectFiles(fullPath, basePath));
            continue;
        }

        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        const nameLC = entry.name.toLowerCase();

        // Include files with scannable extensions or files without extension (shell scripts etc.)
        const isScannable = SCANNABLE_EXTENSIONS.has(ext) || ext === '' || nameLC === 'makefile' || nameLC === 'dockerfile';
        if (!isScannable) {
            // Flag potential binary blobs
            const stat = fs.statSync(fullPath);
            if (stat.size > MAX_FILE_SIZE) {
                results.push({
                    absPath: fullPath,
                    relPath: path.relative(basePath, fullPath),
                    size: stat.size,
                    isBinary: true,
                });
            }
            continue;
        }

        try {
            const stat = fs.statSync(fullPath);
            if (stat.size > MAX_FILE_SIZE) {
                results.push({
                    absPath: fullPath,
                    relPath: path.relative(basePath, fullPath),
                    size: stat.size,
                    isBinary: true,
                });
                continue;
            }
            results.push({
                absPath: fullPath,
                relPath: path.relative(basePath, fullPath),
                size: stat.size,
                isBinary: false,
            });
        } catch {
            // Skip unreadable files
        }
    }

    return results;
}

// ─── File Analysis ──────────────────────────────────────────────────

/**
 * Computes SHA-256 hash of a file.
 */
function hashFile(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(data).digest('hex');
    } catch {
        return 'UNREADABLE';
    }
}

/**
 * Analyzes a single file for red flags.
 * @param {object} fileInfo - { absPath, relPath, size, isBinary }
 * @returns {Array<Finding>}
 */
function analyzeFile(fileInfo) {
    const findings = [];

    // Binary blob detection
    if (fileInfo.isBinary) {
        findings.push({
            file: fileInfo.relPath,
            line: 0,
            ruleId: 'OBF-BIN',
            category: 'OBFUSCATION',
            severity: 'HIGH',
            pattern: 'binary blob',
            context: `Binary/large file: ${(fileInfo.size / 1024).toFixed(1)}KB`,
            penalty: -0.10,
            description: 'Non-text or oversized file — possible hidden binary payload',
        });
        return findings;
    }

    let content;
    try {
        content = fs.readFileSync(fileInfo.absPath, 'utf-8');
    } catch {
        return findings;
    }

    const lines = content.split(/\r?\n/);

    // Check if file is likely inside a code block in markdown (for .md files)
    const isMd = fileInfo.relPath.endsWith('.md');

    // ── Line-by-line rules ──
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const lineNum = i + 1;

        // Track markdown code blocks
        if (isMd && trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        // Apply each line rule
        for (const rule of LINE_RULES) {
            if (rule.pattern.test(line)) {
                findings.push({
                    file: fileInfo.relPath,
                    line: lineNum,
                    ruleId: rule.id,
                    category: rule.category,
                    severity: rule.severity,
                    pattern: rule.pattern.source.substring(0, 60),
                    context: trimmed.substring(0, 120),
                    penalty: rule.penalty,
                    description: rule.description,
                    inMarkdownCodeBlock: isMd ? inCodeBlock : undefined,
                });
            }
        }

        // ── URL safety check (only for network-related lines) ──
        if (/https?:\/\//.test(line)) {
            const suspiciousUrls = checkUrlSafety(line);
            for (const su of suspiciousUrls) {
                findings.push({
                    file: fileInfo.relPath,
                    line: lineNum,
                    ruleId: 'NET-URL',
                    category: 'NETWORK_EXFILTRATION',
                    severity: 'MEDIUM',
                    pattern: su.domain,
                    context: trimmed.substring(0, 120),
                    penalty: -0.05,
                    description: `URL to non-whitelisted domain: ${su.domain}`,
                    inMarkdownCodeBlock: isMd ? inCodeBlock : undefined,
                });
            }
        }
    }

    // ── Structural rules ──
    for (const rule of STRUCTURAL_RULES) {
        const result = rule.check(content, lines);
        if (result.hit) {
            const lineNums = result.lines || [0];
            findings.push({
                file: fileInfo.relPath,
                line: lineNums[0] || 0,
                ruleId: rule.id,
                category: rule.category,
                severity: rule.severity,
                pattern: 'structural',
                context: result.detail,
                penalty: rule.penalty,
                description: rule.description,
            });
        }
    }

    return findings;
}

// ─── Trust Score Computation ────────────────────────────────────────

/**
 * Severity ordering for display.
 */
const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * Computes Trust Score and dedup nearby duplicate findings.
 * @param {Array<Finding>} findings
 * @returns {{ trustScore: number, dedupedFindings: Array<Finding> }}
 */
function computeTrustScore(findings) {
    // Dedup: same rule+file only counted once per line range (±3 lines)
    const seen = new Map();
    const deduped = [];

    for (const f of findings) {
        const key = `${f.ruleId}|${f.file}`;
        const prev = seen.get(key);
        if (prev && Math.abs(prev.line - f.line) <= 3) {
            continue; // Skip near-duplicate
        }
        seen.set(key, f);
        deduped.push(f);
    }

    // Sort by severity
    deduped.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

    // Compute score
    let score = INITIAL_TRUST_SCORE;
    for (const f of deduped) {
        score += f.penalty;
    }
    score = Math.max(MIN_TRUST_SCORE, Math.round(score * 100) / 100);

    return { trustScore: score, dedupedFindings: deduped };
}

/**
 * Returns verdict emoji+text based on trust score.
 */
function getVerdict(score) {
    if (score >= 0.8) return { emoji: '✅', text: 'SAFE' };
    if (score >= 0.5) return { emoji: '⚠️', text: 'CAUTION' };
    if (score >= 0.3) return { emoji: '🔶', text: 'SUSPICIOUS' };
    return { emoji: '🔴', text: 'DANGER' };
}

// ─── Report Generation ──────────────────────────────────────────────

/**
 * Generates the JSON report object.
 */
function generateJsonReport(skillPath, findings, fileHashes, trustScore, verdict) {
    return {
        scanner: `skill_scanner v${VERSION}`,
        skillPath: skillPath,
        scanDate: new Date().toISOString(),
        trustScore: trustScore,
        verdict: `${verdict.emoji} ${verdict.text}`,
        totalFindings: findings.length,
        categorySummary: buildCategorySummary(findings),
        findings: findings.map(f => ({
            file: f.file,
            line: f.line,
            ruleId: f.ruleId,
            category: f.category,
            severity: f.severity,
            pattern: f.pattern,
            context: f.context,
            penalty: f.penalty,
            description: f.description,
            ...(f.inMarkdownCodeBlock !== undefined ? { inMarkdownCodeBlock: f.inMarkdownCodeBlock } : {}),
        })),
        fileHashes: fileHashes,
    };
}

/**
 * Builds per-category summary counts.
 */
function buildCategorySummary(findings) {
    const summary = {};
    for (const f of findings) {
        if (!summary[f.category]) {
            summary[f.category] = { count: 0, maxSeverity: 'LOW' };
        }
        summary[f.category].count++;
        if ((SEVERITY_ORDER[f.severity] ?? 99) < (SEVERITY_ORDER[summary[f.category].maxSeverity] ?? 99)) {
            summary[f.category].maxSeverity = f.severity;
        }
    }
    return summary;
}

/**
 * Generates human-readable report for the "Sir" (Alexey).
 */
function generateHumanReport(jsonReport) {
    const hr = '══════════════════════════════════════════════════';
    const ln = '──────────────────────────────────────────────────';
    const lines = [];

    lines.push('');
    lines.push(hr);
    lines.push('🛡️  SKILL SCANNER — Rating Agency Report');
    lines.push(hr);
    lines.push(`  Skill:   ${jsonReport.skillPath}`);
    lines.push(`  Date:    ${jsonReport.scanDate}`);
    lines.push(`  Scanner: ${jsonReport.scanner}`);
    lines.push(`  Score:   ${jsonReport.trustScore.toFixed(2)} / 1.00  ${jsonReport.verdict}`);
    lines.push(ln);

    // Category summary
    if (Object.keys(jsonReport.categorySummary).length > 0) {
        lines.push('');
        lines.push('  📊 CATEGORY SUMMARY:');
        for (const [cat, info] of Object.entries(jsonReport.categorySummary)) {
            const icon = getSeverityIcon(info.maxSeverity);
            lines.push(`    ${icon} ${cat}: ${info.count} finding(s) [max: ${info.maxSeverity}]`);
        }
    }

    // Detailed findings
    if (jsonReport.findings.length > 0) {
        lines.push('');
        lines.push(`  🔍 FINDINGS (${jsonReport.totalFindings} total):`);
        lines.push('');

        for (const f of jsonReport.findings) {
            const icon = getSeverityIcon(f.severity);
            const mdNote = f.inMarkdownCodeBlock ? ' [in markdown code block]' : '';
            lines.push(`    ${icon} [${f.severity}] ${f.category} (${f.ruleId}, ${f.penalty})`);
            lines.push(`    📄 ${f.file}:${f.line}${mdNote}`);
            lines.push(`    │ ${f.context}`);
            lines.push(`    └─ ${f.description}`);
            lines.push('');
        }
    } else {
        lines.push('');
        lines.push('  ✅ No suspicious patterns found. Skill appears clean.');
        lines.push('');
    }

    // File hashes
    lines.push(ln);
    lines.push('  🔐 FILE HASHES (SHA-256):');
    const hashes = jsonReport.fileHashes;
    const hashKeys = Object.keys(hashes);
    const maxShow = 20;
    for (let i = 0; i < Math.min(hashKeys.length, maxShow); i++) {
        const key = hashKeys[i];
        lines.push(`    ${hashes[key].substring(0, 12)}… ${key}`);
    }
    if (hashKeys.length > maxShow) {
        lines.push(`    ... and ${hashKeys.length - maxShow} more files`);
    }

    lines.push(hr);
    lines.push('');

    return lines.join('\n');
}

function getSeverityIcon(severity) {
    switch (severity) {
        case 'CRITICAL': return '🔴';
        case 'HIGH': return '🟠';
        case 'MEDIUM': return '🟡';
        case 'LOW': return '🟢';
        default: return '⚪';
    }
}

// ─── Main Scan Function ─────────────────────────────────────────────

/**
 * Scans a skill directory and returns a full security report.
 * 
 * @param {string} skillPath - Path to skill directory
 * @param {object} options - { silent: boolean, jsonOnly: boolean }
 * @returns {object} JSON report
 */
async function scan(skillPath, options = {}) {
    const resolvedPath = path.resolve(skillPath);

    // Validate path
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`❌ Skill path does not exist: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
        throw new Error(`❌ Skill path is not a directory: ${resolvedPath}`);
    }

    // Collect files
    const files = collectFiles(resolvedPath);

    if (files.length === 0) {
        throw new Error(`❌ No scannable files found in: ${resolvedPath}`);
    }

    // Analyze all files
    let allFindings = [];
    const fileHashes = {};

    for (const file of files) {
        // Hash every file
        fileHashes[file.relPath] = hashFile(file.absPath);

        // Analyze for red flags
        const findings = analyzeFile(file);
        allFindings.push(...findings);
    }

    // Compute trust score with dedup
    const { trustScore, dedupedFindings } = computeTrustScore(allFindings);
    const verdict = getVerdict(trustScore);

    // Generate reports
    const jsonReport = generateJsonReport(
        skillPath,
        dedupedFindings,
        fileHashes,
        trustScore,
        verdict
    );

    if (!options.silent) {
        const humanReport = generateHumanReport(jsonReport);
        console.log(humanReport);

        if (!options.jsonOnly) {
            console.log('📋 JSON Report:');
            console.log(JSON.stringify(jsonReport, null, 2));
        }
    }

    return jsonReport;
}

// ─── Module Exports ─────────────────────────────────────────────────

module.exports = { scan, VERSION };

// ─── CLI Wrapper ────────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
🛡️  Skill Scanner v${VERSION} — Agentic Rating Agency

Usage:
  node skill_scanner.js <skill-directory> [options]

Options:
  --json-only    Output only JSON report (no human-readable summary)
  --silent       Suppress all console output (API mode)
  --help, -h     Show this help message

Examples:
  node scripts/survival/skill_scanner.js ./skills/whisper
  node scripts/survival/skill_scanner.js ./skills/some-third-party-skill --json-only

Trust Score:
  1.00 – 0.80  ✅ SAFE        Clean skill, no issues found
  0.79 – 0.50  ⚠️  CAUTION    Some suspicious patterns, manual review needed
  0.49 – 0.30  🔶 SUSPICIOUS  Multiple red flags, review carefully before use
  0.29 – 0.00  🔴 DANGER      High-risk skill, likely malicious
`);
        process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
    }

    const skillPath = args[0];
    const jsonOnly = args.includes('--json-only');
    const silent = args.includes('--silent');

    scan(skillPath, { jsonOnly, silent })
        .then(report => {
            if (silent) {
                process.stdout.write(JSON.stringify(report));
            }
            // Exit with non-zero if trust score is below 0.5
            if (report.trustScore < 0.5) {
                process.exit(2);
            }
        })
        .catch(err => {
            console.error(err.message);
            process.exit(1);
        });
}
