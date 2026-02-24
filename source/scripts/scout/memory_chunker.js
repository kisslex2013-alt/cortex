#!/usr/bin/env node
/**
 * scripts/scout/memory_chunker.js
 * 🦾 Jarvis Scout: Memory Chunker
 * Indexes Markdown files into SQLite for fast semantic-lite retrieval.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(process.cwd(), 'jarvis_knowledge.db');
const FILES_TO_INDEX = ['MEMORY.md', 'ROADMAP.md', 'USER.md', 'SOUL.md', 'AGENTS_ANCHOR.md'];

const db = new sqlite3.Database(DB_PATH);

function chunkMarkdown(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const chunks = [];
    let currentHeader = 'Root';
    let currentContent = [];

    for (const line of lines) {
        if (line.startsWith('#')) {
            // Save previous chunk
            if (currentContent.length > 0) {
                chunks.push({ header: currentHeader, content: currentContent.join('\n').trim() });
            }
            currentHeader = line.replace(/#/g, '').trim();
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    }
    // Last chunk
    if (currentContent.length > 0) {
        chunks.push({ header: currentHeader, content: currentContent.join('\n').trim() });
    }
    return chunks;
}

async function indexFiles() {
    console.log("🦾 Jarvis Indexer: Slicing memory into SQL...");
    
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("DELETE FROM content_chunks", (err) => {
                if (err) reject(err);
            });

            const stmt = db.prepare("INSERT INTO content_chunks (file_path, header, content) VALUES (?, ?, ?)");
            
            for (const file of FILES_TO_INDEX) {
                const chunks = chunkMarkdown(file);
                chunks.forEach(c => {
                    stmt.run(file, c.header, c.content);
                });
                console.log(`  └ Indexed ${file}: ${chunks.length} chunks.`);
            }
            stmt.finalize((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

indexFiles().then(() => {
    db.close();
    console.log("✅ Hybrid Memory Update Complete.");
}).catch(err => {
    console.error("❌ Indexing failed:", err);
    db.close();
});
