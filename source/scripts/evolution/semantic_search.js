#!/usr/bin/env node
/**
 * 🧲 Semantic Search v1.0 — Embedding-based search for Jarvis Knowledge Base
 *
 * Использует Gemini Embedding API (бесплатно, 1500 RPM) для семантического
 * поиска по базе знаний. В отличие от FTS5 (текстовый поиск), находит
 * результаты по СМЫСЛУ, а не по точным словам.
 *
 * Пример:
 *   Запрос: "как заработать"
 *   FTS5:    ❌ не найдёт "стейкинг TON"
 *   Semantic: ✅ найдёт "стейкинг TON", \"арбитраж\", \"пассивный доход\"
 *
 * Usage:
 *   const semantic = require('./semantic_search');
 *   await semantic.init();
 *   await semantic.indexFact('TON staking приносит 4% годовых', 'finance');
 *   const results = await semantic.search('как заработать на крипте');
 *
 * CLI:
 *   node semantic_search.js search \"как заработать\"
 *   node semantic_search.js reindex
 *   node semantic_search.js stats
 */
'use strict';

const axios = require('axios');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');

// ═══ КОНФИГУРАЦИЯ ═══
const CONFIG = {
    // Gemini Embedding API (бесплатно)
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
    embeddingDimensions: 768,
    taskType: 'RETRIEVAL_DOCUMENT', // оптимизировано для поиска
    queryTaskType: 'RETRIEVAL_QUERY',

    // SQLite
    dbPath: path.join(ROOT, 'jarvis_knowledge.db'),

    // Лимиты
    maxBatchSize: 50,           // макс. фактов за раз при reindex
    apiDelayMs: 100,            // задержка между API вызовами (для rate limit)
    topK: 5,                    // кол-во результатов по умолчанию
    similarityThreshold: 0.3,   // минимальный порог релевантности
    proxy: 'http://fwmrjbgc:2i1kb390x20j@31.59.20.176:6754'
};

let db = null;
let apiKey = null;
let agent = null;

// ═══ ИНИЦИАЛИЗАЦИЯ ═══
async function init() {
    // Загружаем API ключ
    apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        try {
            require('dotenv').config({ path: path.join(ROOT, '.env') });
            apiKey = process.env.GEMINI_API_KEY;
        } catch { /* dotenv not available */ }
    }

    if (!apiKey) {
        console.warn('[SemanticSearch] ⚠️ No GEMINI_API_KEY found. Semantic search disabled.');
        return false;
    }

    // Инициализируем прокси
    if (CONFIG.proxy) {
        agent = new HttpsProxyAgent(CONFIG.proxy);
    }

    // Открываем SQLite
    try {
        const Database = require('better-sqlite3');
        db = new Database(CONFIG.dbPath);
    } catch {
        try {
            const sqlite3 = require('sqlite3').verbose();
            db = await openSqlite3(sqlite3, CONFIG.dbPath);
        } catch (e) {
            console.error(`[SemanticSearch] DB init failed: ${e.message}`);
            return false;
        }
    }

    // Создаём таблицу для эмбеддингов
    ensureTable();
    console.log(`[SemanticSearch] ✅ Initialized (db: ${CONFIG.dbPath})`);
    return true;
}

// Обёртка для callback-based sqlite3
function openSqlite3(sqlite3, dbPath) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(dbPath, (err) => {
            if (err) reject(err);
            else {
                database.runAsync = (sql, params) => new Promise((res, rej) => {
                    database.run(sql, params, function (err) { err ? rej(err) : res(this); });
                });
                database.allAsync = (sql, params) => new Promise((res, rej) => {
                    database.all(sql, params, (err, rows) => { err ? rej(err) : res(rows); });
                });
                database.getAsync = (sql, params) => new Promise((res, rej) => {
                    database.get(sql, params, (err, row) => { err ? rej(err) : res(row); });
                });
                resolve(database);
            }
        });
    });
}

function ensureTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS semantic_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            embedding BLOB NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            access_count INTEGER DEFAULT 0
        )
    `;

    if (db.prepare) {
        // better-sqlite3 (synchronous)
        db.prepare(sql).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_semantic_category ON semantic_embeddings(category)`).run();
    } else {
        // sqlite3 (async)
        db.runAsync(sql);
        db.runAsync(`CREATE INDEX IF NOT EXISTS idx_semantic_category ON semantic_embeddings(category)`);
    }
}

// ═══ GEMINI EMBEDDING API ═══
async function getEmbedding(text, taskType = CONFIG.taskType) {
    if (!apiKey) throw new Error('No API key');

    const response = await axios.post(
        `${CONFIG.apiUrl}?key=${apiKey}`,
        {
            content: { parts: [{ text }] },
            taskType: taskType,
            // outputDimensionality: 256  // можно уменьшить для экономии места
        },
        {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: 10000
        }
    );

    return response.data.embedding.values;
}

// ═══ МАТЕМАТИКА ВЕКТОРОВ ═══
function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function vectorToBuffer(vec) {
    return Buffer.from(new Float32Array(vec).buffer);
}

function bufferToVector(buf) {
    return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

// ═══ ИНДЕКСАЦИЯ ═══
async function indexFact(content, category = 'general') {
    if (!db || !apiKey) return null;

    try {
        const embedding = await getEmbedding(content);
        const blob = vectorToBuffer(embedding);

        if (db.prepare) {
            const stmt = db.prepare(
                `INSERT INTO semantic_embeddings (content, category, embedding) VALUES (?, ?, ?)`
            );
            const result = stmt.run(content, category, blob);
            return result.lastInsertRowid;
        } else {
            const result = await db.runAsync(
                `INSERT INTO semantic_embeddings (content, category, embedding) VALUES (?, ?, ?)`,
                [content, category, blob]
            );
            return result.lastID;
        }
    } catch (e) {
        if (e.response && e.response.data) {
            console.error(`[SemanticSearch] API error: ${JSON.stringify(e.response.data)}`);
        } else {
            console.error(`[SemanticSearch] Index error: ${e.message}`);
        }
        return null;
    }
}

// Массовая индексация из существующей таблицы content_chunks
async function reindexFromKnowledge() {
    if (!db || !apiKey) return { error: 'Not initialized' };

    let rows;
    try {
        if (db.prepare) {
            rows = db.prepare(`SELECT file_path, header, content FROM content_chunks LIMIT 500`).all();
        } else {
            rows = await db.allAsync(`SELECT file_path, header, content FROM content_chunks LIMIT 500`);
        }
    } catch (e) {
        return { error: `Content_chunks table not found: ${e.message}` };
    }

    if (!rows || rows.length === 0) return { indexed: 0, message: 'No facts to index' };

    let indexed = 0;
    let errors = 0;

    for (const row of rows) {
        const text = `[${row.file_path} / ${row.header}] ${row.content}`;
        const category = row.file_path;

        // Проверяем, не проиндексирован ли уже
        let existing;
        if (db.prepare) {
            existing = db.prepare(`SELECT id FROM semantic_embeddings WHERE content = ?`).get(text);
        } else {
            existing = await db.getAsync(`SELECT id FROM semantic_embeddings WHERE content = ?`, [text]);
        }
        if (existing) continue;

        const id = await indexFact(text, category);
        if (id) {
            indexed++;
        } else {
            errors++;
        }

        // Rate limit protection
        if (indexed % 10 === 0) {
            await new Promise(r => setTimeout(r, CONFIG.apiDelayMs));
        }
    }

    return { indexed, errors, total: rows.length };
}

// ═══ ПОИСК ═══
async function search(query, topK = CONFIG.topK, category = null) {
    if (!db || !apiKey) return [];

    try {
        // 1. Получаем эмбеддинг запроса
        const queryEmbedding = await getEmbedding(query, CONFIG.queryTaskType);

        // 2. Загружаем все эмбеддинги (для малых баз <10K это быстро)
        let rows;
        const sql = category
            ? `SELECT id, content, category, embedding FROM semantic_embeddings WHERE category = ?`
            : `SELECT id, content, category, embedding FROM semantic_embeddings`;

        if (db.prepare) {
            rows = category
                ? db.prepare(sql).all(category)
                : db.prepare(sql).all();
        } else {
            rows = category
                ? await db.allAsync(sql, [category])
                : await db.allAsync(sql);
        }

        if (!rows || rows.length === 0) return [];

        // 3. Считаем косинусное сходство для каждого
        const scored = rows.map(row => {
            const vec = bufferToVector(Buffer.from(row.embedding));
            const similarity = cosineSimilarity(queryEmbedding, vec);
            return {
                id: row.id,
                content: row.content,
                category: row.category,
                similarity: Math.round(similarity * 1000) / 1000
            };
        });

        // 4. Сортируем по сходству и отдаём топ-K
        scored.sort((a, b) => b.similarity - a.similarity);
        const results = scored
            .filter(r => r.similarity >= CONFIG.similarityThreshold)
            .slice(0, topK);

        // 5. Обновляем счётчик доступа
        for (const r of results) {
            if (db.prepare) {
                db.prepare(`UPDATE semantic_embeddings SET access_count = access_count + 1 WHERE id = ?`).run(r.id);
            }
        }

        return results;
    } catch (e) {
        console.error(`[SemanticSearch] Search error: ${e.message}`);
        return [];
    }
}

// ═══ СТАТИСТИКА ═══
function getStats() {
    if (!db) return { error: 'Not initialized' };

    try {
        let total, categories;
        if (db.prepare) {
            total = db.prepare(`SELECT COUNT(*) as cnt FROM semantic_embeddings`).get();
            categories = db.prepare(
                `SELECT category, COUNT(*) as cnt FROM semantic_embeddings GROUP BY category ORDER BY cnt DESC LIMIT 10`
            ).all();
        }
        return {
            total_embeddings: total?.cnt || 0,
            categories: categories || [],
            db_path: CONFIG.dbPath,
            api_key_set: !!apiKey
        };
    } catch (e) {
        return { error: e.message };
    }
}

// ═══ ЭКСПОРТ ═══
module.exports = { init, indexFact, reindexFromKnowledge, search, getStats };

// ═══ CLI ═══
if (require.main === module) {
    const cmd = process.argv[2];
    const arg = process.argv.slice(3).join(' ');

    (async () => {
        const ok = await init();
        if (!ok) {
            console.error('Failed to init. Check GEMINI_API_KEY.');
            process.exit(1);
        }

        switch (cmd) {
            case 'search':
                if (!arg) { console.log('Usage: node semantic_search.js search \"query\"'); break; }
                console.log(`\n🔍 Searching: \"${arg}\"\n`);
                const results = await search(arg);
                if (results.length === 0) {
                    console.log('No results found.');
                } else {
                    results.forEach((r, i) => {
                        console.log(`  ${i + 1}. [${(r.similarity * 100).toFixed(1)}%] ${r.content}`);
                    });
                }
                break;

            case 'index':
                if (!arg) { console.log('Usage: node semantic_search.js index \"fact text\"'); break; }
                const id = await indexFact(arg);
                console.log(id ? `✅ Indexed as #${id}` : '❌ Failed');
                break;

            case 'reindex':
                console.log('🔄 Reindexing from knowledge table...');
                const result = await reindexFromKnowledge();
                console.log(JSON.stringify(result, null, 2));
                break;

            case 'stats':
                console.log(JSON.stringify(getStats(), null, 2));
                break;

            default:
                console.log('Usage: node semantic_search.js <search|index|reindex|stats> [args]');
        }

        if (db && db.close) db.close();
    })();
}
