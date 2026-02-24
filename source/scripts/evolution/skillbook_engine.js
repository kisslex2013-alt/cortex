#!/usr/bin/env node
/**
 * 🧠 Skillbook Engine v1.0 — Self-Improving Agent Memory
 * 
 * Inspired by ACE (Agentic Context Engine) from Stanford/SambaNova.
 * Instead of depending on external Python package, this is a native JS implementation
 * of the Skillbook pattern:
 * 
 * 1. Agent executes tasks
 * 2. Reflector analyzes what worked / failed
 * 3. SkillManager updates the Skillbook (learned strategies)
 * 4. Skillbook is injected into future prompts
 * 
 * The Skillbook is a markdown file: memory/skillbook/jarvis_skills.md
 * It grows automatically from execution feedback.
 * 
 * Usage:
 *   const skillbook = require('./skillbook_engine');
 *   await skillbook.init();
 *   
 *   // Get current skills for prompt injection
 *   const context = skillbook.getSkillsContext();
 *   
 *   // Learn from execution result
 *   await skillbook.learn({ task, result, success, feedback });
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const SKILLBOOK_DIR = path.join(ROOT, 'memory/skillbook');
const SKILLBOOK_PATH = path.join(SKILLBOOK_DIR, 'jarvis_skills.md');
const FEEDBACK_LOG = path.join(SKILLBOOK_DIR, 'feedback_log.jsonl');
const MAX_SKILLS = 50;

/**
 * Initialize skillbook directory and files
 */
function init() {
    if (!fs.existsSync(SKILLBOOK_DIR)) {
        fs.mkdirSync(SKILLBOOK_DIR, { recursive: true });
    }

    if (!fs.existsSync(SKILLBOOK_PATH)) {
        const initial = `# 🧠 Jarvis Skillbook
_Auto-generated strategies from execution feedback_
_Last updated: ${new Date().toISOString()}_

## Core Strategies

### 🔒 Security
- Always run sandbox_guard.js checks before file writes
- Never log sensitive data (API keys, seed phrases)
- Use simulation mode for financial operations by default

### 💰 Financial
- Check wallet balance BEFORE initiating any transaction
- Reserve 2x gas estimate as safety margin
- Use CoinGecko price feed for USD-aware risk thresholds

### 🧠 Memory
- Use unified_memory.js for cross-system queries
- Never load full MEMORY.md into context — use RAG chunks
- VACUUM SQLite databases weekly via nano_pruner

### 🔄 Operations
- Route critical prompts through PRO model (PRO-First)
- Fallback chain: Google → OpenRouter → DeepSeek
- Throttle restarts: 5-min cooldown via watchdog

## Learned Patterns
_New patterns are added below automatically_

`;
        fs.writeFileSync(SKILLBOOK_PATH, initial);
        console.log('[Skillbook] ✅ Initialized with default strategies');
    }
}

/**
 * Get current skillbook content for prompt injection
 * @param {number} maxChars - Max characters to return
 * @returns {string} Formatted skillbook context
 */
function getSkillsContext(maxChars = 2000) {
    if (!fs.existsSync(SKILLBOOK_PATH)) {
        init();
    }

    const content = fs.readFileSync(SKILLBOOK_PATH, 'utf8');

    if (content.length <= maxChars) return content;

    // Truncate smartly — keep headers and recent patterns
    const lines = content.split('\n');
    let result = '';
    for (const line of lines) {
        if (result.length + line.length > maxChars) break;
        result += line + '\n';
    }
    return result + '\n_... (truncated, see full skillbook in memory/skillbook/)_';
}

/**
 * Learn from execution feedback
 * @param {Object} feedback
 * @param {string} feedback.task - What was attempted
 * @param {string} feedback.result - What happened
 * @param {boolean} feedback.success - Did it succeed?
 * @param {string} feedback.category - Category (security/financial/memory/operations)
 * @param {string} [feedback.lesson] - Explicit lesson learned
 */
async function learn(feedback) {
    const { task, result, success, category = 'general', lesson } = feedback;

    // 1. Log raw feedback
    const entry = {
        timestamp: new Date().toISOString(),
        task,
        result: (result || '').substring(0, 500),
        success,
        category,
        lesson
    };

    try {
        fs.appendFileSync(FEEDBACK_LOG, JSON.stringify(entry) + '\n');
    } catch { }

    // 2. Extract pattern
    const pattern = lesson || extractPattern(task, result, success);
    if (!pattern) return;

    // 3. Check for duplicates
    const currentSkills = fs.readFileSync(SKILLBOOK_PATH, 'utf8');
    if (currentSkills.includes(pattern.substring(0, 60))) {
        return; // Already learned
    }

    // 4. Add to skillbook
    const categoryEmoji = {
        security: '🔒',
        financial: '💰',
        memory: '🧠',
        operations: '🔄',
        general: '📌'
    }[category] || '📌';

    const newEntry = `\n- ${categoryEmoji} **[${new Date().toISOString().split('T')[0]}]** ${pattern}`;

    // Check skill count
    const skillCount = (currentSkills.match(/^- /gm) || []).length;
    if (skillCount >= MAX_SKILLS) {
        // Rotate: remove oldest learned pattern (after "Learned Patterns" section)
        const learnedIndex = currentSkills.indexOf('## Learned Patterns');
        if (learnedIndex !== -1) {
            const afterLearned = currentSkills.substring(learnedIndex);
            const firstDash = afterLearned.indexOf('\n- ');
            if (firstDash !== -1) {
                const secondDash = afterLearned.indexOf('\n- ', firstDash + 3);
                if (secondDash !== -1) {
                    const trimmed = currentSkills.substring(0, learnedIndex) +
                        afterLearned.substring(0, firstDash) +
                        afterLearned.substring(secondDash);
                    fs.writeFileSync(SKILLBOOK_PATH, trimmed + newEntry);
                    console.log(`[Skillbook] 🔄 Rotated + added: ${pattern.substring(0, 60)}...`);
                    return;
                }
            }
        }
    }

    fs.writeFileSync(SKILLBOOK_PATH, currentSkills + newEntry);
    console.log(`[Skillbook] ✅ Learned: ${pattern.substring(0, 60)}...`);
}

/**
 * Auto-extract pattern from task and result
 */
function extractPattern(task, result, success) {
    if (!task) return null;

    const taskLower = (task || '').toLowerCase();
    const resultLower = (result || '').toLowerCase();

    if (!success) {
        // Failure patterns
        if (resultLower.includes('timeout')) return `Task "${task.substring(0, 40)}" timed out — increase timeout or add retry`;
        if (resultLower.includes('rate limit') || resultLower.includes('429')) return `API rate limit hit during "${task.substring(0, 40)}" — rotate keys or add delay`;
        if (resultLower.includes('insufficient') || resultLower.includes('balance')) return `Insufficient balance for "${task.substring(0, 40)}" — always pre-check balance`;
        if (resultLower.includes('permission') || resultLower.includes('blocked')) return `Permission denied for "${task.substring(0, 40)}" — check sandbox rules`;
        if (resultLower.includes('not found') || resultLower.includes('404')) return `Resource not found for "${task.substring(0, 40)}" — verify path/URL before calling`;

        return `FAILED: "${task.substring(0, 40)}" → ${(result || 'unknown error').substring(0, 80)}. Investigate and add guard.`;
    } else {
        // Success patterns (only learn from notable successes)
        if (taskLower.includes('stak')) return `Staking succeeded: ${(result || '').substring(0, 80)}`;
        if (taskLower.includes('deploy')) return `Deployment succeeded: verify with soul_guard.sh --verify after`;
        if (taskLower.includes('backup') || taskLower.includes('commit')) return `Backup/commit succeeded: ${(result || '').substring(0, 60)}`;

        return null; // Don't learn from routine successes
    }
}

/**
 * Get feedback statistics
 */
function getStats() {
    if (!fs.existsSync(FEEDBACK_LOG)) return { total: 0, success: 0, failure: 0 };

    const lines = fs.readFileSync(FEEDBACK_LOG, 'utf8').trim().split('\n').filter(Boolean);
    let success = 0, failure = 0;

    lines.forEach(line => {
        try {
            const entry = JSON.parse(line);
            if (entry.success) success++;
            else failure++;
        } catch { }
    });

    return { total: lines.length, success, failure, successRate: lines.length > 0 ? (success / lines.length * 100).toFixed(1) + '%' : 'N/A' };
}

module.exports = { init, getSkillsContext, learn, getStats, SKILLBOOK_PATH };
