#!/usr/bin/env node
/**
 * 🔄 Memory Migration v1.0 — MEMORY.md → Knowledge Graph + Mem0
 * 
 * Parses flat MEMORY.md into:
 * 1. memory/knowledge_graph.json — structured graph with categories
 * 2. SQLite facts via mem0_bridge.js — for FTS search
 * 
 * Categories:
 * - personal: identity, preferences, relationships
 * - financial: wallets, transactions, policies
 * - technical: architecture, modules, configs
 * - incident: failures, bugs, recovery
 * - directive: rules, protocols, restrictions
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const MEMORY_PATH = path.join(ROOT, 'MEMORY.md');
const GRAPH_PATH = path.join(ROOT, 'memory/knowledge_graph.json');

// Categorization rules: regex → category
const CATEGORY_RULES = [
    // Financial
    { pattern: /wallet|USDT|TON|transaction|USDC|balance|fund|stake|arbitrage|paper.?trad/i, category: 'financial' },
    // Incident
    { pattern: /crash|error|bug|fix|incident|failure|laps|lockdown|block|ban|suspend|vulner/i, category: 'incident' },
    // Directive
    { pattern: /MUST|NEVER|strict|protocol|policy|NO\s|do not|mandatory|safety|directive|rule/i, category: 'directive' },
    // Technical
    { pattern: /module|script|version|deploy|Redis|Docker|API|node|config|refactor|hash|guardian|engine|cortex|dispatcher/i, category: 'technical' },
    // Personal
    { pattern: /Alexey|Jarvis|identity|vibe|named|friend|sarcastic|activation/i, category: 'personal' },
];

/**
 * Determine category for a text entry
 */
function categorize(text) {
    for (const rule of CATEGORY_RULES) {
        if (rule.pattern.test(text)) return rule.category;
    }
    return 'general';
}

/**
 * Parse MEMORY.md into structured entries
 */
function parseMemory(content) {
    const entries = [];
    const lines = content.split('\n');

    let currentDate = '';
    let currentBlock = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip headers and empty lines
        if (trimmed.startsWith('#') || trimmed === '') {
            // Flush current block
            if (currentBlock.length > 0) {
                const text = currentBlock.join(' ').trim();
                if (text.length > 10) {
                    entries.push({
                        date: currentDate || 'unknown',
                        content: text,
                        category: categorize(text)
                    });
                }
                currentBlock = [];
            }

            // Check for section header with date
            if (trimmed.startsWith('#') && !trimmed.startsWith('##')) continue;
            continue;
        }

        // Extract date from entry
        const dateMatch = trimmed.match(/\*\*(\d{4}-\d{2}-\d{2}):\*\*/);
        if (dateMatch) {
            // Flush previous block
            if (currentBlock.length > 0) {
                const text = currentBlock.join(' ').trim();
                if (text.length > 10) {
                    entries.push({
                        date: currentDate || 'unknown',
                        content: text,
                        category: categorize(text)
                    });
                }
                currentBlock = [];
            }
            currentDate = dateMatch[1];
        }

        // Clean markdown formatting
        const cleaned = trimmed
            .replace(/^-\s*/, '')
            .replace(/\*\*\d{4}-\d{2}-\d{2}:\*\*\s*/, '')
            .replace(/⚓️🦾/g, '')
            .trim();

        if (cleaned.length > 5) {
            currentBlock.push(cleaned);
        }
    }

    // Flush last block
    if (currentBlock.length > 0) {
        const text = currentBlock.join(' ').trim();
        if (text.length > 10) {
            entries.push({
                date: currentDate || 'unknown',
                content: text,
                category: categorize(text)
            });
        }
    }

    return entries;
}

/**
 * Build knowledge graph structure
 */
function buildGraph(entries) {
    const graph = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        source: 'MEMORY.md',
        stats: {
            total_facts: entries.length,
            categories: {}
        },
        categories: {
            personal: [],
            financial: [],
            technical: [],
            incident: [],
            directive: [],
            general: []
        }
    };

    entries.forEach((entry, index) => {
        const fact = {
            id: index + 1,
            date: entry.date,
            content: entry.content,
            confidence: 1.0
        };

        const cat = entry.category;
        if (!graph.categories[cat]) graph.categories[cat] = [];
        graph.categories[cat].push(fact);

        // Stats
        graph.stats.categories[cat] = (graph.stats.categories[cat] || 0) + 1;
    });

    return graph;
}

/**
 * Main migration
 */
async function migrate() {
    console.log('🔄 Memory Migration: MEMORY.md → Knowledge Graph\n');

    if (!fs.existsSync(MEMORY_PATH)) {
        console.error('❌ MEMORY.md not found at:', MEMORY_PATH);
        process.exit(1);
    }

    const content = fs.readFileSync(MEMORY_PATH, 'utf8');
    const entries = parseMemory(content);

    console.log(`📊 Parsed ${entries.length} facts from MEMORY.md`);

    // Build and save knowledge graph
    const graph = buildGraph(entries);

    const dir = path.dirname(GRAPH_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2));
    console.log(`✅ Knowledge graph saved to: ${GRAPH_PATH}`);
    console.log(`\n📊 Category breakdown:`);
    Object.entries(graph.stats.categories).forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count} facts`);
    });

    // Try to populate Mem0 Bridge if available
    try {
        const mem0 = require('./mem0_bridge');
        await mem0.init();

        let imported = 0;
        for (const entry of entries) {
            await mem0.addFact(entry.category, entry.content, 'migration:MEMORY.md');
            imported++;
        }

        const stats = await mem0.getStats();
        console.log(`\n✅ Mem0 Bridge: ${imported} facts imported`);
        console.log(`📊 Mem0 stats:`, JSON.stringify(stats));
        await mem0.close();
    } catch (err) {
        console.log(`\nℹ️ Mem0 Bridge not available (${err.message}), skipping SQL import.`);
        console.log('   Run on VPS: node scripts/evolution/migrate_memory.js');
    }
}

migrate().catch(err => {
    console.error(`Migration error: ${err.message}`);
    process.exit(1);
});
