#!/usr/bin/env node
/**
 * scripts/evolution/self_learning.js — AGI Self-Learning System v1.0
 * 
 * 📝 Phase 4: Learn from mistakes, track decisions, detect patterns
 * 
 * Features:
 * 1. Decision Journal — log every significant decision with outcome
 * 2. Learning Extractor — parse .learnings/ and find patterns
 * 3. Health Trend — visualize codebase health over time
 * 4. Anti-Repeat — warn when about to repeat a known mistake
 * 5. Research Prompt Generator — suggest learning topics based on gaps
 * 
 * Usage:
 *   node scripts/evolution/self_learning.js                  # show learning summary
 *   node scripts/evolution/self_learning.js --log "lesson"   # record a learning
 *   node scripts/evolution/self_learning.js --decide "what"  # log a decision
 *   node scripts/evolution/self_learning.js --patterns       # detect patterns
 *   node scripts/evolution/self_learning.js --trend          # health trend chart
 *   node scripts/evolution/self_learning.js --check "action" # anti-repeat check
 *   node scripts/evolution/self_learning.js --research       # gen research prompts
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const LEARNINGS_DIR = path.join(ROOT, '.learnings');
const MEMORY_DIR = path.join(ROOT, 'memory');
const DECISIONS_FILE = path.join(MEMORY_DIR, 'decision_journal.json');
const HISTORY_FILE = path.join(MEMORY_DIR, 'improvement_history.json');
const PATTERNS_FILE = path.join(MEMORY_DIR, 'learned_patterns.json');

// ═══════════════════════════════════════════════
// DECISION JOURNAL
// ═══════════════════════════════════════════════

function logDecision(description, context = {}) {
    const decisions = loadJson(DECISIONS_FILE, []);

    const entry = {
        id: `D-${Date.now()}`,
        timestamp: new Date().toISOString(),
        description,
        context: {
            trigger: context.trigger || 'manual',
            files: context.files || [],
            risk: context.risk || 'low',
            ...context,
        },
        outcome: null, // filled later via --outcome
    };

    decisions.push(entry);
    // Keep last 500 decisions
    const trimmed = decisions.slice(-500);
    saveJson(DECISIONS_FILE, trimmed);

    return entry;
}

function updateOutcome(decisionId, outcome, success) {
    const decisions = loadJson(DECISIONS_FILE, []);
    const idx = decisions.findIndex(d => d.id === decisionId);

    if (idx === -1) return null;

    decisions[idx].outcome = {
        result: success ? 'SUCCESS' : 'FAILURE',
        detail: outcome,
        resolvedAt: new Date().toISOString(),
    };

    saveJson(DECISIONS_FILE, decisions);

    // If failure, also record as learning
    if (!success) {
        recordLearning(
            `Decision "${decisions[idx].description}" failed: ${outcome}`,
            'decision-feedback'
        );
    }

    return decisions[idx];
}

// ═══════════════════════════════════════════════
// LEARNING RECORDER
// ═══════════════════════════════════════════════

function recordLearning(lesson, source = 'manual') {
    if (!fs.existsSync(LEARNINGS_DIR)) {
        fs.mkdirSync(LEARNINGS_DIR, { recursive: true });
    }

    const month = new Date().toISOString().slice(0, 7);
    const logFile = path.join(LEARNINGS_DIR, `${month}.md`);
    const date = new Date().toISOString().split('T')[0];

    const entry = `\n### ${date} [${source}]\n- ${lesson}\n`;
    fs.appendFileSync(logFile, entry);

    // Update patterns
    extractAndSavePattern(lesson);

    return { file: logFile, date, lesson };
}

// ═══════════════════════════════════════════════
// PATTERN DETECTION
// ═══════════════════════════════════════════════

const KNOWN_CATEGORIES = {
    'syntax': ['syntax', 'parse', 'bracket', 'semicolon', 'unexpected token'],
    'import': ['import', 'require', 'module', 'unused'],
    'config': ['config', '.env', 'environment', 'variable', 'key'],
    'deploy': ['deploy', 'push', 'git', 'branch', 'merge', 'conflict'],
    'performance': ['slow', 'memory', 'leak', 'timeout', 'crash', 'oom'],
    'api': ['api', 'endpoint', 'rate limit', 'quota', 'token', '401', '403', '429'],
    'logic': ['logic', 'wrong', 'incorrect', 'bug', 'fix', 'broken'],
};

function categorizeLesson(text) {
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(KNOWN_CATEGORIES)) {
        if (keywords.some(k => lower.includes(k))) return category;
    }
    return 'general';
}

function extractAndSavePattern(lesson) {
    const patterns = loadJson(PATTERNS_FILE, { categories: {}, recentLessons: [] });
    const category = categorizeLesson(lesson);

    if (!patterns.categories[category]) {
        patterns.categories[category] = { count: 0, lastSeen: null, examples: [] };
    }

    patterns.categories[category].count++;
    patterns.categories[category].lastSeen = new Date().toISOString();
    patterns.categories[category].examples.push(lesson);
    // Keep last 10 examples per category
    patterns.categories[category].examples =
        patterns.categories[category].examples.slice(-10);

    patterns.recentLessons.push({
        date: new Date().toISOString().split('T')[0],
        category,
        lesson,
    });
    patterns.recentLessons = patterns.recentLessons.slice(-50);

    saveJson(PATTERNS_FILE, patterns);
}

function detectPatterns() {
    const patterns = loadJson(PATTERNS_FILE, { categories: {}, recentLessons: [] });
    const warnings = [];

    for (const [category, data] of Object.entries(patterns.categories)) {
        if (data.count >= 3) {
            warnings.push({
                category,
                count: data.count,
                severity: data.count >= 5 ? 'HIGH' : 'MEDIUM',
                message: `Recurring issue in "${category}": ${data.count} lessons recorded`,
                lastExample: data.examples[data.examples.length - 1],
            });
        }
    }

    return warnings.sort((a, b) => b.count - a.count);
}

// ═══════════════════════════════════════════════
// ANTI-REPEAT CHECK
// ═══════════════════════════════════════════════

function antiRepeatCheck(proposedAction) {
    const patterns = loadJson(PATTERNS_FILE, { categories: {}, recentLessons: [] });
    const warnings = [];
    const lower = proposedAction.toLowerCase();

    // Check if this action matches a known failure pattern
    for (const lesson of patterns.recentLessons) {
        if (lesson.lesson.toLowerCase().includes('failed') ||
            lesson.lesson.toLowerCase().includes('rollback') ||
            lesson.lesson.toLowerCase().includes('broke')) {

            // Check similarity
            const words = lower.split(/\s+/);
            const lessonWords = lesson.lesson.toLowerCase().split(/\s+/);
            const overlap = words.filter(w => lessonWords.includes(w) && w.length > 3);

            if (overlap.length >= 2) {
                warnings.push({
                    type: 'PAST_FAILURE',
                    message: `⚠️ Similar action failed before: "${lesson.lesson}"`,
                    date: lesson.date,
                    overlap: overlap.join(', '),
                });
            }
        }
    }

    return warnings;
}

// ═══════════════════════════════════════════════
// HEALTH TREND
// ═══════════════════════════════════════════════

function showTrend() {
    const history = loadJson(HISTORY_FILE, []);

    if (history.length === 0) {
        console.log('📊 No health history yet. Run improvement_engine.js to start tracking.');
        return;
    }

    console.log('📈 HEALTH TREND');
    console.log('─'.repeat(50));

    // ASCII chart
    const maxScore = 100;
    const barWidth = 30;

    const recent = history.slice(-14); // Last 2 weeks
    for (const entry of recent) {
        const score = entry.healthScore || 0;
        const filled = Math.round((score / maxScore) * barWidth);
        const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
        const emoji = score >= 75 ? '🟢' : score >= 50 ? '🟡' : '🔴';
        console.log(`  ${entry.date} ${emoji} ${bar} ${score}/100`);
    }

    // Calculate trend
    if (recent.length >= 2) {
        const first = recent[0].healthScore || 0;
        const last = recent[recent.length - 1].healthScore || 0;
        const diff = last - first;
        if (diff > 0) console.log(`\n  📈 Trend: +${diff} over ${recent.length} checks`);
        else if (diff < 0) console.log(`\n  📉 Trend: ${diff} over ${recent.length} checks`);
        else console.log(`\n  ➡️ Trend: stable over ${recent.length} checks`);
    }
}

// ═══════════════════════════════════════════════
// RESEARCH PROMPT GENERATOR
// ═══════════════════════════════════════════════

function generateResearchPrompts() {
    const patterns = loadJson(PATTERNS_FILE, { categories: {}, recentLessons: [] });
    const prompts = [];

    // Generate prompts based on recurring patterns
    for (const [category, data] of Object.entries(patterns.categories)) {
        if (data.count >= 2) {
            const examples = data.examples.slice(-3).join('; ');
            prompts.push({
                area: category,
                urgency: data.count >= 5 ? 'HIGH' : 'MEDIUM',
                prompt: generatePromptForCategory(category, data.count, examples),
                reason: `${data.count} recurring issues in "${category}"`,
            });
        }
    }

    // Add prompts for gaps in knowledge
    const allCategories = Object.keys(KNOWN_CATEGORIES);
    const learnedCategories = new Set(Object.keys(patterns.categories));
    const gaps = allCategories.filter(c => !learnedCategories.has(c));

    if (gaps.length > 0) {
        prompts.push({
            area: 'knowledge-gaps',
            urgency: 'LOW',
            prompt: `As an autonomous Node.js AI agent, I have no recorded learnings in these areas: ${gaps.join(', ')}. What are the most common pitfalls and best practices for each? Focus on practical, actionable advice for a bot that manages itself on a VPS.`,
            reason: `No learnings recorded for: ${gaps.join(', ')}`,
        });
    }

    return prompts;
}

function generatePromptForCategory(category, count, examples) {
    const templates = {
        'syntax': `My autonomous agent has encountered ${count} syntax issues in its codebase. Examples: ${examples}. What AST-based tools can automatically detect and safely fix JavaScript syntax errors? Focus on Node.js-compatible solutions.`,
        'import': `My Node.js bot keeps having unused import issues (${count} occurrences). How can I implement a reliable automated import cleanup that also handles destructured imports and re-exports? Examples: ${examples}`,
        'config': `My AI agent has ${count} configuration-related issues: ${examples}. What are best practices for self-managing .env files and configuration in autonomous Node.js systems?`,
        'deploy': `My self-deploying bot has encountered ${count} deployment issues: ${examples}. What are robust patterns for automated git operations, branch management, and safe self-deployment?`,
        'performance': `My VPS-running bot (6GB RAM, 4 cores) has ${count} performance issues: ${examples}. What are Node.js-specific optimization patterns for memory management, garbage collection, and preventing OOM?`,
        'api': `My bot manages multiple API integrations and has ${count} API-related issues: ${examples}. How to implement robust retry logic, rate limit handling, and API key rotation in Node.js?`,
        'logic': `My autonomous agent has ${count} logic bugs: ${examples}. What testing and validation patterns help self-modifying agents catch logic errors before deployment?`,
    };

    return templates[category] ||
        `My AI agent has ${count} issues in category "${category}": ${examples}. What are best practices for handling this in Node.js autonomous agents?`;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function loadJson(filePath, defaultValue) {
    if (fs.existsSync(filePath)) {
        try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
        catch { return defaultValue; }
    }
    return defaultValue;
}

function saveJson(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getAllLearnings() {
    if (!fs.existsSync(LEARNINGS_DIR)) return [];

    const files = fs.readdirSync(LEARNINGS_DIR).filter(f => f.endsWith('.md')).sort();
    const learnings = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(LEARNINGS_DIR, file), 'utf8');
        const entries = content.split(/^###\s+/m).filter(Boolean);
        for (const entry of entries) {
            const lines = entry.trim().split('\n');
            const header = lines[0];
            const body = lines.slice(1).map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);
            learnings.push({ header, lessons: body, file });
        }
    }

    return learnings;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
    const args = process.argv.slice(2);

    // --log "lesson text"
    if (args[0] === '--log' && args[1]) {
        const result = recordLearning(args.slice(1).join(' '), 'manual');
        console.log(`📝 Learning recorded: ${result.lesson}`);
        console.log(`   Saved to: ${path.relative(ROOT, result.file)}`);
        return;
    }

    // --decide "description"
    if (args[0] === '--decide' && args[1]) {
        const entry = logDecision(args.slice(1).join(' '));
        console.log(`📋 Decision logged: ${entry.id}`);
        console.log(`   "${entry.description}"`);
        console.log(`   Track outcome with: --outcome ${entry.id} "result" success|failure`);
        return;
    }

    // --outcome D-ID "result" success|failure
    if (args[0] === '--outcome' && args[1] && args[2]) {
        const success = !args.includes('failure');
        const result = updateOutcome(args[1], args.slice(2).join(' ').replace(/(success|failure)/i, '').trim(), success);
        if (result) {
            console.log(`✅ Outcome recorded for ${args[1]}: ${result.outcome.result}`);
        } else {
            console.log(`❌ Decision ${args[1]} not found`);
        }
        return;
    }

    // --check "proposed action"
    if (args[0] === '--check' && args[1]) {
        const warnings = antiRepeatCheck(args.slice(1).join(' '));
        if (warnings.length === 0) {
            console.log('✅ No known issues with this action. Proceed.');
        } else {
            console.log('⚠️ ANTI-REPEAT WARNINGS:');
            warnings.forEach(w => console.log(`   ${w.message} (${w.date})`));
        }
        return;
    }

    // --patterns
    if (args.includes('--patterns')) {
        const warnings = detectPatterns();
        console.log('🔍 PATTERN ANALYSIS');
        console.log('─'.repeat(50));
        if (warnings.length === 0) {
            console.log('   No recurring patterns detected yet. Keep learning!');
        } else {
            warnings.forEach(w => {
                console.log(`   ${w.severity === 'HIGH' ? '🔴' : '🟡'} ${w.category}: ${w.count}× occurrences`);
                console.log(`      Last: ${w.lastExample}`);
            });
        }
        return;
    }

    // --trend
    if (args.includes('--trend')) {
        showTrend();
        return;
    }

    // --research
    if (args.includes('--research')) {
        const prompts = generateResearchPrompts();
        console.log('🔬 RESEARCH PROMPTS (based on learnings)');
        console.log('─'.repeat(50));
        if (prompts.length === 0) {
            console.log('   No specific research needed yet. Record more learnings!');
        } else {
            prompts.forEach((p, i) => {
                console.log(`\n${i + 1}. [${p.urgency}] ${p.area}`);
                console.log(`   Reason: ${p.reason}`);
                console.log(`   Prompt: "${p.prompt}"`);
            });
        }
        return;
    }

    // Default: show summary
    console.log('📝 Jarvis Self-Learning System v1.0');
    console.log('═'.repeat(50));

    // Learnings summary
    const allLearnings = getAllLearnings();
    console.log(`\n📚 Total learnings: ${allLearnings.reduce((s, l) => s + l.lessons.length, 0)}`);
    console.log(`   Files: ${new Set(allLearnings.map(l => l.file)).size}`);

    // Decisions summary
    const decisions = loadJson(DECISIONS_FILE, []);
    const resolved = decisions.filter(d => d.outcome);
    const successful = resolved.filter(d => d.outcome.result === 'SUCCESS');
    console.log(`\n📋 Decisions: ${decisions.length} total`);
    if (resolved.length > 0) {
        console.log(`   Resolved: ${resolved.length} (${successful.length} success, ${resolved.length - successful.length} failure)`);
        console.log(`   Success rate: ${Math.round((successful.length / resolved.length) * 100)}%`);
    }

    // Patterns
    const warnings = detectPatterns();
    console.log(`\n🔍 Recurring patterns: ${warnings.length}`);
    warnings.slice(0, 3).forEach(w => {
        console.log(`   ${w.severity === 'HIGH' ? '🔴' : '🟡'} ${w.category} (${w.count}×)`);
    });

    // Health trend
    console.log('');
    showTrend();

    // Recent learnings
    if (allLearnings.length > 0) {
        console.log('\n📝 Recent learnings:');
        const recent = allLearnings.slice(-3);
        recent.forEach(l => {
            console.log(`   ${l.header}`);
            l.lessons.slice(0, 2).forEach(lesson => console.log(`     - ${lesson}`));
        });
    }

    console.log('\n💡 Commands:');
    console.log('   --log "lesson"           Record a learning');
    console.log('   --decide "action"        Log a decision');
    console.log('   --check "action"         Anti-repeat check');
    console.log('   --patterns               Detect recurring issues');
    console.log('   --trend                  Health trend chart');
    console.log('   --research               Generate research prompts');
}

module.exports = {
    main, recordLearning, logDecision, updateOutcome,
    antiRepeatCheck, detectPatterns, generateResearchPrompts
};

if (require.main === module) {
    main();
}
