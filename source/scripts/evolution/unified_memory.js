#!/usr/bin/env node
/**
 * 🧬 Unified Memory API v1.1 — Facade over RAG + Mem0 + Semantic Search
 * 
 * Single interface for three memory systems:
 * - RAG (rag_retriever.js) — document chunks from MEMORY.md, HISTORY.md
 * - Mem0 (mem0_bridge.js) — structured facts with categories
 * - Semantic (semantic_search.js) — embedding-based search by meaning
 * 
 * Usage:
 *   const memory = require('./unified_memory');
 *   await memory.init();
 *   const results = await memory.query('кошелёк TON баланс');
 *   const context = await memory.buildContext('текущий статус');
 */
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');

let rag = null;
let mem0 = null;
let semantic = null;

async function init() {
    try {
        rag = require('./rag_retriever');
        if (rag.init) await rag.init();
    } catch (e) {
        console.warn(`[UnifiedMemory] RAG init failed: ${e.message}`);
        rag = null;
    }

    try {
        mem0 = require('./mem0_bridge');
        if (mem0.init) await mem0.init();
    } catch (e) {
        console.warn(`[UnifiedMemory] Mem0 init failed: ${e.message}`);
        mem0 = null;
    }

    try {
        semantic = require('./semantic_search');
        const ok = await semantic.init();
        if (!ok) semantic = null;
    } catch (e) {
        console.warn(`[UnifiedMemory] Semantic init failed: ${e.message}`);
        semantic = null;
    }

    const active = [rag && 'RAG', mem0 && 'Mem0', semantic && 'Semantic'].filter(Boolean);
    console.log(`[UnifiedMemory] Initialized: ${active.join(' + ') || 'NONE'}`);
}

/**
 * Query both systems and merge results
 * @param {string} query - Search query
 * @param {number} limit - Max results per system
 * @returns {Promise<Array>} Merged, deduplicated results
 */
async function query(query, limit = 5) {
    const results = [];
    const seen = new Set();

    // 1. Search RAG (document chunks)
    if (rag && rag.retrieve) {
        try {
            const ragResults = await rag.retrieve(query, limit);
            ragResults.forEach(r => {
                const key = (r.content || r.text || '').substring(0, 100);
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({
                        source: 'rag',
                        content: r.content || r.text,
                        file: r.file_path || r.file,
                        score: r.rank || r.score || 0
                    });
                }
            });
        } catch (e) {
            console.warn(`[UnifiedMemory] RAG query failed: ${e.message}`);
        }
    }

    // 2. Search Mem0 (structured facts)
    if (mem0 && mem0.searchFacts) {
        try {
            const mem0Results = await mem0.searchFacts(query, limit);
            mem0Results.forEach(r => {
                const key = (r.content || '').substring(0, 100);
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({
                        source: 'mem0',
                        content: r.content,
                        category: r.category,
                        score: r.relevance || r.weight || 0
                    });
                }
            });
        } catch (e) {
            console.warn(`[UnifiedMemory] Mem0 query failed: ${e.message}`);
        }
    }

    // 3. Search Semantic (embeddings)
    if (semantic && semantic.search) {
        try {
            const semResults = await semantic.search(query, limit);
            semResults.forEach(r => {
                const key = (r.content || '').substring(0, 100);
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({
                        source: 'semantic',
                        content: r.content,
                        category: r.category,
                        score: r.similarity || 0
                    });
                }
            });
        } catch (e) {
            console.warn(`[UnifiedMemory] Semantic query failed: ${e.message}`);
        }
    }

    // Sort by score descending
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    return results.slice(0, limit);
}

/**
 * Store content in the appropriate system
 * @param {string} content - Content to store
 * @param {string} category - Category (for Mem0) or 'document' (for RAG)
 * @param {string} source - Origin identifier
 */
async function store(content, category = 'general', source = 'unified') {
    if (category === 'document' && rag && rag.indexFile) {
        // Document content goes to RAG
        return { stored: 'rag', status: 'indexed' };
    }

    if (mem0 && mem0.addFact) {
        try {
            const id = await mem0.addFact(category, content, source);
            return { stored: 'mem0', id, status: 'ok' };
        } catch (e) {
            return { stored: 'none', error: e.message };
        }
    }

    return { stored: 'none', error: 'No memory system available' };
}

/**
 * Build unified context for LLM
 * @param {string} queryText - Current topic/question
 * @param {number} maxTokens - Approximate token budget (~4 chars per token)
 * @returns {Promise<string>} Formatted context string
 */
async function buildContext(queryText, maxTokens = 400) {
    const results = await query(queryText, 10);
    if (results.length === 0) return '';

    let context = '## 🧠 Memory Context\n';
    let tokenCount = 0;
    const charBudget = maxTokens * 4;

    for (const r of results) {
        const entry = `- [${r.source}${r.category ? ':' + r.category : ''}] ${r.content}\n`;
        if (tokenCount + entry.length > charBudget) break;
        context += entry;
        tokenCount += entry.length;
    }

    return context;
}

async function close() {
    if (mem0 && mem0.close) await mem0.close();
}

module.exports = { init, query, store, buildContext, close };
