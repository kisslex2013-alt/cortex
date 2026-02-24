#!/usr/bin/env node
/**
 * 📡 Jarvis Alpha-Scout v1.0
 * Case #15: Autonomous Ecosystem Scout and Reputation Architect
 * 
 * Objectives:
 * 1. Monitor Moltbook for "Alpha" (staking, yield, ecosystem updates).
 * 2. Filter info via RAG and Memory.
 * 3. Proactively report via "Alpha-Pulse".
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const rag = require('./rag_retriever');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const MOLTBOOK_SH = path.join(ROOT, 'scripts/moltbook.sh');
const ALPHA_LOG = path.join(ROOT, 'memory/alpha_leads.jsonl');
const MEMORY_MD = path.join(ROOT, 'MEMORY.md');

// Keywords that trigger scouting
const ALPHA_KEYWORDS = [
    'ton', 'stake', 'yield', 'apy', 'liquidity', 'pool', 
    'arbitrage', 'drop', 'snapshot', 'validator', 'governance'
];

/**
 * Check if Moltbook is locked (as per MEMORY.md)
 * Hard Lock until Feb 19, 05:15 UTC.
 */
function isMoltbookLocked() {
    const lockExpiry = new Date('2026-02-19T05:15:00Z');
    const now = new Date();
    return now < lockExpiry;
}

/**
 * Fetch latest posts from Moltbook
 */
async function fetchMoltbookFeed() {
    if (isMoltbookLocked()) {
        console.log('🔒 Moltbook is HARD-LOCKED until Feb 19. Scouting cancelled.');
        return [];
    }

    try {
        const output = execSync(`bash ${MOLTBOOK_SH} hot 20`, { encoding: 'utf8' });
        const data = JSON.parse(output);
        return data.posts || [];
    } catch (e) {
        console.error('❌ Failed to fetch Moltbook feed:', e.message);
        return [];
    }
}

/**
 * Extract alpha leads from posts
 */
async function scoutAlpha() {
    console.log('📡 Jarvis Alpha-Scout: Initializing scan...');
    
    // 1. Initial Indexing of current memory
    await rag.init();
    await rag.indexAll();

    // 2. Fetch Feed
    const posts = await fetchMoltbookFeed();
    if (posts.length === 0) return;

    const leads = [];

    for (const post of posts) {
        const text = (post.title + ' ' + post.content).toLowerCase();
        const hasKeyword = ALPHA_KEYWORDS.some(kw => text.includes(kw));

        if (hasKeyword) {
            console.log(`🔍 Potential Lead: "${post.title}"`);

            // 3. Cross-reference with RAG
            const context = await rag.retrieve(text, 3);
            const isKnown = context.some(c => c.rank < -0.5); // FTS rank heuristic (lower is better in FTS5 usually)

            // 4. Score Lead (simple heuristic for v1.0)
            let score = 50;
            if (text.includes('apy') || text.includes('yield')) score += 20;
            if (text.includes('tonstakers') || text.includes('bemo')) score += 10;
            if (isKnown) score -= 30; // lower score if we already know about it

            if (score > 60) {
                leads.push({
                    id: post.id,
                    title: post.title,
                    content: post.content,
                    score,
                    author: post.author_name,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    // 5. Save and Return Leads
    if (leads.length > 0) {
        const logEntry = JSON.stringify({ scan_at: new Date().toISOString(), leads_count: leads.length, leads }) + '\n';
        fs.appendFileSync(ALPHA_LOG, logEntry);
        console.log(`✅ Scout complete. Found ${leads.length} high-quality leads.`);
    } else {
        console.log('💤 Scout complete. No new alpha found.');
    }

    return leads;
}

/**
 * Format the Alpha-Pulse report
 */
function formatAlphaPulse(leads) {
    if (!leads || leads.length === 0) return '';

    let report = '📡 **Jarvis Alpha-Pulse**\n\n';
    report += `Найдено потенциальных возможностей: ${leads.length}\n\n`;

    leads.sort((a, b) => b.score - a.score).slice(0, 3).forEach((lead, i) => {
        report += `${i + 1}. **${lead.title}** (Score: ${lead.score})\n`;
        report += `   👤 От: ${lead.author}\n`;
        report += `   📝 ${lead.content.substring(0, 100).replace(/\n/g, ' ')}...\n\n`;
    });

    report += '🦾 *Я продолжаю мониторинг. Для деталей спроси меня про конкретный пост.*';
    return report;
}

// CLI Execution
if (require.main === module) {
    (async () => {
        const leads = await scoutAlpha();
        if (leads && leads.length > 0) {
            console.log(formatAlphaPulse(leads));
        }
        await rag.close();
    })();
}

module.exports = { scoutAlpha, formatAlphaPulse };
