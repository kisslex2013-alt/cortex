#!/usr/bin/env node
/**
 * 📚 RAG Retriever v1.0 — Retrieval-Augmented Generation for Jarvis
 * 
 * Replaces "context stuffing" with smart retrieval:
 * Instead of loading ALL of MEMORY.md into the LLM context,
 * indexes all markdown files and returns only the top-N relevant chunks.
 * 
 * How it works:
 * 1. Scans memory/, research/, docs/ directories for .md files
 * 2. Splits each file into chunks (by ## headers or paragraphs)
 * 3. Indexes chunks in SQLite FTS5
 * 4. On query: returns top-N most relevant chunks
 * 
 * Token savings: 
 *   Before: 38+ lines of MEMORY.md = ~2000 tokens every call
 *   After: 5 relevant chunks = ~400 tokens per call (80% reduction)
 * 
 * Usage:
 *   const rag = require('./rag_retriever');
 *   await rag.indexAll();
 *   const chunks = await rag.retrieve('wallet TON transactions');
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const DB_PATH = path.join(ROOT, 'memory/jarvis_rag.db');

// Directories to index
const INDEX_DIRS = [
    path.join(ROOT, 'memory'),
    path.join(ROOT, 'research'),
    path.join(ROOT, 'docs'),
];

// Files to always index (top-level)
const INDEX_FILES = [
    path.join(ROOT, 'MEMORY.md'),
    path.join(ROOT, 'ROADMAP.md'),
    path.join(ROOT, 'AGENTS_ANCHOR.md'),
    path.join(ROOT, 'SECURITY_DIRECTIVES.md'),
];

let db = null;

/**
 * Initialize the RAG database
 */
async function init() {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) return reject(err);

            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL,
                    section_title TEXT DEFAULT '',
                    content TEXT NOT NULL,
                    chunk_index INTEGER DEFAULT 0,
                    indexed_at TEXT DEFAULT (datetime('now'))
                )`);

                db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                    content, section_title, file_path,
                    content='chunks',
                    content_rowid='id'
                )`);

                db.run(`CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
                    INSERT INTO chunks_fts(rowid, content, section_title, file_path)
                    VALUES (new.id, new.content, new.section_title, new.file_path);
                END`);

                db.run(`CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
                    INSERT INTO chunks_fts(chunks_fts, rowid, content, section_title, file_path)
                    VALUES ('delete', old.id, old.content, old.section_title, old.file_path);
                END`, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
    });
}

/**
 * Split a markdown file into chunks by headers
 * @param {string} content - File content
 * @returns {Array<{title: string, body: string}>}
 */
function splitIntoChunks(content) {
    const chunks = [];
    const lines = content.split('\n');
    let currentTitle = '';
    let currentBody = [];

    for (const line of lines) {
        if (line.match(/^#{1,3}\s+/)) {
            // Save previous chunk
            if (currentBody.length > 0) {
                const body = currentBody.join('\n').trim();
                if (body.length > 20) { // Skip tiny chunks
                    chunks.push({ title: currentTitle, body });
                }
            }
            currentTitle = line.replace(/^#+\s+/, '').trim();
            currentBody = [];
        } else {
            currentBody.push(line);
        }
    }

    // Save last chunk
    if (currentBody.length > 0) {
        const body = currentBody.join('\n').trim();
        if (body.length > 20) {
            chunks.push({ title: currentTitle, body });
        }
    }

    // If no headers found, split by paragraphs (double newline)
    if (chunks.length === 0 && content.trim().length > 20) {
        const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 20);
        paragraphs.forEach((p, i) => {
            chunks.push({ title: `paragraph-${i}`, body: p.trim() });
        });
    }

    return chunks;
}

/**
 * Index a single file (AUDIT-FIX: wrapped in SQLite transaction)
 * @param {string} filePath - Absolute path to .md file
 */
async function indexFile(filePath) {
    if (!db) await init();
    if (!fs.existsSync(filePath)) return 0;

    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(ROOT, filePath);
    const chunks = splitIntoChunks(content);

    return new Promise((resolve, reject) => {
        // AUDIT-FIX-2026-02-18: Transaction wrapper to prevent race conditions (VULN-RAG-001)
        db.run('BEGIN TRANSACTION', (beginErr) => {
            if (beginErr) return reject(beginErr);

            // Remove old chunks for this file
            db.run('DELETE FROM chunks WHERE file_path = ?', [relPath], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }

                if (chunks.length === 0) {
                    db.run('COMMIT', () => resolve(0));
                    return;
                }

                let indexed = 0;
                const stmt = db.prepare(
                    'INSERT INTO chunks (file_path, section_title, content, chunk_index) VALUES (?, ?, ?, ?)'
                );

                chunks.forEach((chunk, i) => {
                    stmt.run(relPath, chunk.title, chunk.body, i, (err) => {
                        if (!err) indexed++;
                        if (i === chunks.length - 1) {
                            stmt.finalize(() => {
                                db.run('COMMIT', (commitErr) => {
                                    if (commitErr) {
                                        db.run('ROLLBACK');
                                        return reject(commitErr);
                                    }
                                    resolve(indexed);
                                });
                            });
                        }
                    });
                });
            });
        });
    });
}

/**
 * Index all markdown files from configured directories
 * @returns {Promise<{files: number, chunks: number}>}
 */
async function indexAll() {
    if (!db) await init();
    console.log('📚 RAG Retriever: Indexing markdown files...');

    let totalFiles = 0;
    let totalChunks = 0;

    // Index top-level files
    for (const filePath of INDEX_FILES) {
        if (fs.existsSync(filePath)) {
            const count = await indexFile(filePath);
            totalFiles++;
            totalChunks += count;
        }
    }

    // Index directories
    for (const dir of INDEX_DIRS) {
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filePath = path.join(dir, file);
            try {
                const count = await indexFile(filePath);
                totalFiles++;
                totalChunks += count;
            } catch (err) {
                console.warn(`⚠️ Failed to index ${file}: ${err.message}`);
            }
        }
    }

    console.log(`✅ RAG Retriever: Indexed ${totalChunks} chunks from ${totalFiles} files`);
    return { files: totalFiles, chunks: totalChunks };
}

// AUDIT-FIX-2026-02-18: Synonym mapping for cross-language search (VULN-RAG-002)
const SYNONYM_MAP = {
    'кошелёк': 'wallet', 'кошелек': 'wallet', 'wallet': 'кошелёк',
    'баланс': 'balance', 'balance': 'баланс',
    'транзакция': 'transaction', 'transaction': 'транзакция',
    'стейкинг': 'staking', 'staking': 'стейкинг',
    'безопасность': 'security', 'security': 'безопасность',
    'память': 'memory', 'memory': 'память',
    'ошибка': 'error', 'error': 'ошибка',
    'адрес': 'address', 'address': 'адрес',
    'пул': 'pool', 'pool': 'пул',
    'мониторинг': 'monitoring', 'monitoring': 'мониторинг',
};

/**
 * Expand query with synonyms
 * @param {string} query
 * @returns {string}
 */
function expandWithSynonyms(query) {
    const words = query.toLowerCase().split(/\s+/);
    const expanded = new Set(words);
    words.forEach(word => {
        if (SYNONYM_MAP[word]) expanded.add(SYNONYM_MAP[word]);
    });
    return Array.from(expanded).join(' ');
}

/**
 * Retrieve relevant chunks for a query
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 5)
 * @returns {Promise<Array<{file_path: string, section_title: string, content: string, rank: number}>>}
 */
async function retrieve(query, limit = 5) {
    if (!db) await init();

    return new Promise((resolve, reject) => {
        // AUDIT-FIX-2026-02-18: Expand with synonyms before search (VULN-RAG-002)
        const expandedQuery = expandWithSynonyms(query);
        const safeQuery = expandedQuery.replace(/['"]/g, '').replace(/\s+/g, ' OR ');

        db.all(`
            SELECT c.file_path, c.section_title, c.content, fts.rank
            FROM chunks_fts fts
            JOIN chunks c ON c.id = fts.rowid
            WHERE chunks_fts MATCH ?
            ORDER BY fts.rank
            LIMIT ?
        `, [safeQuery, limit], (err, rows) => {
            if (err) {
                // Fallback to LIKE
                db.all(`
                    SELECT file_path, section_title, content, 0 as rank
                    FROM chunks
                    WHERE content LIKE ?
                    ORDER BY indexed_at DESC
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
 * Build a compact context string for LLM injection
 * @param {string} query - Current user query
 * @param {number} maxChunks - Max chunks to include
 * @returns {Promise<string>} Markdown-formatted context
 */
async function buildContext(query, maxChunks = 5) {
    const chunks = await retrieve(query, maxChunks);
    if (chunks.length === 0) return '';

    let context = '## 📚 Retrieved Context (RAG)\n\n';
    chunks.forEach((c, i) => {
        const source = c.file_path.split('/').pop();
        context += `**[${source}${c.section_title ? ' > ' + c.section_title : ''}]**\n`;
        context += c.content.substring(0, 500) + '\n\n';
    });

    return context;
}

/**
 * Get index statistics
 */
async function getStats() {
    if (!db) await init();
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT file_path, COUNT(*) as chunk_count
            FROM chunks
            GROUP BY file_path
            ORDER BY chunk_count DESC
        `, (err, rows) => {
            if (err) return reject(err);
            resolve({
                total_chunks: (rows || []).reduce((sum, r) => sum + r.chunk_count, 0),
                files: rows || []
            });
        });
    });
}

async function close() {
    if (!db) return;
    return new Promise(resolve => {
        db.close(() => resolve());
        db = null;
    });
}

module.exports = { init, indexFile, indexAll, retrieve, buildContext, getStats, close };

// CLI mode
if (require.main === module) {
    const args = process.argv.slice(2);
    const cmd = args[0];

    (async () => {
        await init();

        if (cmd === '--index') {
            const stats = await indexAll();
            console.log(JSON.stringify(stats, null, 2));
        } else if (cmd === '--search' && args[1]) {
            const results = await retrieve(args.slice(1).join(' '));
            results.forEach(r => {
                console.log(`\n📄 ${r.file_path} > ${r.section_title}`);
                console.log(r.content.substring(0, 200) + '...');
            });
        } else if (cmd === '--context' && args[1]) {
            await indexAll();
            const ctx = await buildContext(args.slice(1).join(' '));
            console.log(ctx);
        } else if (cmd === '--stats') {
            const stats = await getStats();
            console.log(JSON.stringify(stats, null, 2));
        } else {
            console.log('Usage:');
            console.log('  node rag_retriever.js --index         Index all .md files');
            console.log('  node rag_retriever.js --search <q>    Search chunks');
            console.log('  node rag_retriever.js --context <q>   Build context (index + search)');
            console.log('  node rag_retriever.js --stats         Show index statistics');
        }

        await close();
    })().catch(err => {
        console.error('RAG Retriever error:', err.message);
        process.exit(1);
    });
}
