#!/usr/bin/env node
/**
 * 🧠 Mem0 Bridge v1.0 — SQLite-based Memory Layer for Jarvis
 * 
 * Inspired by Mem0 (mem0.ai) but implemented natively in Node.js + SQLite.
 * No Docker, no Python, no Qdrant — uses SQLite FTS5 for full-text search.
 * 
 * Features:
 * - Automatic fact extraction from conversations
 * - Categorized storage (personal, financial, technical, incident, directive)
 * - Full-text search via SQLite FTS5
 * - Relevance scoring based on recency and category weight
 * - Compatible with existing MEMORY.md workflow
 * 
 * Usage:
 *   const mem = require('./mem0_bridge');
 *   await mem.init();
 *   await mem.addFact('financial', 'Master wallet is UQD0N8yc...', 'MEMORY.md');
 *   const results = await mem.searchFacts('wallet address');
 *   const financial = await mem.getFactsByCategory('financial');
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const DB_PATH = path.join(ROOT, 'memory/jarvis_mem0.db');

let db = null;

// Category weights for relevance scoring
const CATEGORY_WEIGHTS = {
    directive: 1.0,    // highest priority — rules and policies
    financial: 0.9,    // critical — wallet, transactions
    incident: 0.8,     // important — past failures
    personal: 0.7,     // identity and preferences
    technical: 0.6,    // system architecture details
    general: 0.5       // everything else
};

/**
 * Initialize the database with FTS5 virtual table
 */
async function init() {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) return reject(err);

            db.serialize(() => {
                // Main facts table
                db.run(`CREATE TABLE IF NOT EXISTS facts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL DEFAULT 'general',
                    content TEXT NOT NULL,
                    source TEXT DEFAULT 'unknown',
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    relevance_score REAL DEFAULT 0.5,
                    is_active INTEGER DEFAULT 1
                )`);

                // FTS5 virtual table for full-text search
                db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
                    content, category, source,
                    content='facts',
                    content_rowid='id'
                )`);

                // Triggers to keep FTS in sync
                db.run(`CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
                    INSERT INTO facts_fts(rowid, content, category, source)
                    VALUES (new.id, new.content, new.category, new.source);
                END`);

                db.run(`CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
                    INSERT INTO facts_fts(facts_fts, rowid, content, category, source)
                    VALUES ('delete', old.id, old.content, old.category, old.source);
                END`);

                db.run(`CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
                    INSERT INTO facts_fts(facts_fts, rowid, content, category, source)
                    VALUES ('delete', old.id, old.content, old.category, old.source);
                    INSERT INTO facts_fts(rowid, content, category, source)
                    VALUES (new.id, new.content, new.category, new.source);
                END`, (err) => {
                    if (err) return reject(err);
                    console.log('✅ Mem0 Bridge: Database initialized');
                    resolve();
                });
            });
        });
    });
}

/**
 * Add a fact to memory
 * @param {string} category - One of: personal, financial, technical, incident, directive, general
 * @param {string} content - The fact content
 * @param {string} source - Where this fact came from (e.g., 'MEMORY.md', 'chat', 'state_sync')
 * @returns {Promise<number>} The fact ID
 */
async function addFact(category, content, source = 'manual') {
    if (!db) await init();
    const weight = CATEGORY_WEIGHTS[category] || 0.5;

    return new Promise((resolve, reject) => {
        // Check for duplicates using simple content matching
        db.get('SELECT id FROM facts WHERE content = ? AND is_active = 1', [content], (err, row) => {
            if (err) return reject(err);
            if (row) {
                // Update timestamp of existing fact
                db.run('UPDATE facts SET updated_at = datetime("now") WHERE id = ?', [row.id]);
                return resolve(row.id);
            }

            db.run(
                'INSERT INTO facts (category, content, source, relevance_score) VALUES (?, ?, ?, ?)',
                [category, content, source, weight],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
    });
}

/**
 * Search facts using FTS5 full-text search
 * @param {string} query - Search query (supports FTS5 syntax like AND, OR, NOT, "phrase")
 * @param {number} limit - Max results (default 5)
 * @returns {Promise<Array>} Matching facts sorted by relevance
 */
async function searchFacts(query, limit = 5) {
    if (!db) await init();

    return new Promise((resolve, reject) => {
        // Sanitize query for FTS5
        const safeQuery = query.replace(/['"]/g, '').replace(/\s+/g, ' OR ');

        db.all(`
            SELECT f.id, f.category, f.content, f.source, f.created_at, f.relevance_score,
                   rank * f.relevance_score AS combined_score
            FROM facts_fts fts
            JOIN facts f ON f.id = fts.rowid
            WHERE facts_fts MATCH ? AND f.is_active = 1
            ORDER BY combined_score DESC
            LIMIT ?
        `, [safeQuery, limit], (err, rows) => {
            if (err) {
                // Fallback to LIKE search if FTS fails
                db.all(`
                    SELECT id, category, content, source, created_at, relevance_score
                    FROM facts
                    WHERE content LIKE ? AND is_active = 1
                    ORDER BY relevance_score DESC, updated_at DESC
                    LIMIT ?
                `, [`%${query}%`, limit], (err2, rows2) => {
                    if (err2) return reject(err2);
                    resolve(rows2 || []);
                });
                return;
            }
            resolve(rows || []);
        });
    });
}

/**
 * Get all facts by category
 * @param {string} category
 * @returns {Promise<Array>}
 */
async function getFactsByCategory(category) {
    if (!db) await init();

    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM facts WHERE category = ? AND is_active = 1 ORDER BY relevance_score DESC, updated_at DESC',
            [category],
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            }
        );
    });
}

/**
 * Soft-delete a fact (mark as inactive)
 * @param {number} id - Fact ID
 */
async function removeFact(id) {
    if (!db) await init();
    return new Promise((resolve, reject) => {
        db.run('UPDATE facts SET is_active = 0 WHERE id = ?', [id], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

/**
 * Get memory stats
 * @returns {Promise<Object>}
 */
async function getStats() {
    if (!db) await init();
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT category, COUNT(*) as count
            FROM facts WHERE is_active = 1
            GROUP BY category
        `, (err, rows) => {
            if (err) return reject(err);
            const stats = { total: 0, categories: {} };
            (rows || []).forEach(r => {
                stats.categories[r.category] = r.count;
                stats.total += r.count;
            });
            resolve(stats);
        });
    });
}

/**
 * Build a context package for LLM (RAG-style)
 * Returns most relevant facts for a given query, formatted as markdown
 * @param {string} query - User's current question/topic
 * @param {number} maxFacts - Maximum facts to include
 * @returns {Promise<string>} Markdown-formatted context
 */
async function buildContextPackage(query, maxFacts = 10) {
    if (!db) await init();

    const facts = await searchFacts(query, maxFacts);
    if (facts.length === 0) return '> No relevant memory found for this query.\n';

    let context = '## 🧠 Relevant Memory (Mem0 Bridge)\n\n';
    let currentCategory = '';

    facts.forEach(f => {
        if (f.category !== currentCategory) {
            currentCategory = f.category;
            context += `### ${currentCategory.toUpperCase()}\n`;
        }
        context += `- ${f.content}\n`;
    });

    context += `\n_${facts.length} facts retrieved from ${new Date().toISOString()}_\n`;
    return context;
}

/**
 * Close the database connection
 */
async function close() {
    if (!db) return;
    return new Promise((resolve) => {
        db.close(() => resolve());
        db = null;
    });
}

module.exports = { init, addFact, searchFacts, getFactsByCategory, removeFact, getStats, buildContextPackage, close };

// CLI mode
if (require.main === module) {
    const args = process.argv.slice(2);
    const cmd = args[0];

    (async () => {
        await init();

        if (cmd === '--init') {
            console.log('✅ Database initialized at:', DB_PATH);
            const stats = await getStats();
            console.log('📊 Stats:', JSON.stringify(stats));
        } else if (cmd === '--search' && args[1]) {
            const results = await searchFacts(args.slice(1).join(' '));
            console.log(JSON.stringify(results, null, 2));
        } else if (cmd === '--stats') {
            const stats = await getStats();
            console.log(JSON.stringify(stats, null, 2));
        } else if (cmd === '--context' && args[1]) {
            const ctx = await buildContextPackage(args.slice(1).join(' '));
            console.log(ctx);
        } else {
            console.log('Usage:');
            console.log('  node mem0_bridge.js --init         Initialize database');
            console.log('  node mem0_bridge.js --search <q>   Search facts');
            console.log('  node mem0_bridge.js --stats        Show statistics');
            console.log('  node mem0_bridge.js --context <q>  Build context package');
        }

        await close();
    })().catch(err => {
        console.error('Mem0 Bridge error:', err.message);
        process.exit(1);
    });
}
