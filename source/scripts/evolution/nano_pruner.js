#!/usr/bin/env node
/**
 * 🐈 NanoPruner v1.2 (Health Score Upgrade)
 * Inspired by HKUDS/nanobot - "Two plain files + grep, no RAG"
 * Purpose: Distill HISTORY.md into MEMORY.md and ensure architectural integrity.
 * 
 * v1.2 Changes:
 * - SQLite VACUUM (weekly defrag of RAG + Mem0 databases)
 * - Extended failure patterns (6→20+)
 * - HISTORY.md rotation at 100KB
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const HISTORY_PATH = path.join(ROOT, 'memory/HISTORY.md');
const MEMORY_PATH = path.join(ROOT, 'MEMORY.md');
const ARCHIVE_DIR = path.join(ROOT, 'memory/archive/');
const VACUUM_LAST_PATH = path.join(ROOT, 'memory/.vacuum_last');

// HISTORY.md rotation threshold
const MAX_HISTORY_SIZE_KB = 100;
// VACUUM interval (7 days)
const VACUUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Run SQLite VACUUM on RAG and Mem0 databases (weekly)
 */
function vacuumDatabases() {
    let lastVacuum = 0;
    try {
        if (fs.existsSync(VACUUM_LAST_PATH)) {
            lastVacuum = parseInt(fs.readFileSync(VACUUM_LAST_PATH, 'utf8').trim(), 10) || 0;
        }
    } catch { }

    if (Date.now() - lastVacuum < VACUUM_INTERVAL_MS) return;

    const dbPaths = [
        path.join(ROOT, 'memory/jarvis_rag.db'),
        path.join(ROOT, 'memory/jarvis_mem0.db')
    ];

    let sqlite3;
    try { sqlite3 = require('sqlite3'); } catch { return; }

    dbPaths.forEach(dbPath => {
        if (!fs.existsSync(dbPath)) return;
        try {
            const db = new sqlite3.Database(dbPath);
            db.run('VACUUM', (err) => {
                if (err) {
                    console.warn(`⚠️ VACUUM failed on ${path.basename(dbPath)}: ${err.message}`);
                } else {
                    console.log(`🧹 VACUUM completed: ${path.basename(dbPath)}`);
                }
                db.close();
            });
        } catch (e) {
            console.warn(`⚠️ Cannot VACUUM ${path.basename(dbPath)}: ${e.message}`);
        }
    });

    try {
        fs.writeFileSync(VACUUM_LAST_PATH, String(Date.now()));
    } catch { }
}

/**
 * Rotate HISTORY.md if it exceeds size threshold
 */
function rotateHistoryIfNeeded() {
    if (!fs.existsSync(HISTORY_PATH)) return false;

    const stats = fs.statSync(HISTORY_PATH);
    const sizeKB = stats.size / 1024;

    if (sizeKB > MAX_HISTORY_SIZE_KB) {
        const now = new Date();
        const monthTag = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
        const archiveName = `HISTORY_${monthTag}_${Date.now()}.md`;
        const archivePath = path.join(ARCHIVE_DIR, archiveName);

        if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

        fs.renameSync(HISTORY_PATH, archivePath);
        fs.writeFileSync(HISTORY_PATH, `# Jarvis History Ledger\n_Rotated at ${now.toISOString()} (previous: ${archiveName})_\n`);
        console.log(`🔄 HISTORY.md rotated: ${sizeKB.toFixed(1)}KB → archive/${archiveName}`);
        return true;
    }
    return false;
}

async function distill() {
    console.log("🐈 NanoPruner v1.2 awakening...");

    // VACUUM databases weekly
    vacuumDatabases();

    // Rotate before processing
    rotateHistoryIfNeeded();

    if (!fs.existsSync(HISTORY_PATH)) {
        console.log("No history found. Creating initial log...");
        fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
        fs.writeFileSync(HISTORY_PATH, "# Jarvis History Ledger\n");
        return;
    }

    if (!fs.existsSync(MEMORY_PATH)) {
        console.error("❌ MEMORY.md not found. Cannot distill without target.");
        return;
    }

    const history = fs.readFileSync(HISTORY_PATH, 'utf8');
    const memory = fs.readFileSync(MEMORY_PATH, 'utf8');

    // Extended failure patterns (20+)
    const failurePatterns = [
        // === LEGACY / ARCHITECTURE ===
        {
            pattern: /RabbitMQ/gi, key: 'RabbitMQ legacy',
            insight: "- **Legacy Asset Note:** RabbitMQ was my old Phase 3 message broker. It was purged in Phase 11. Do NOT recreate it."
        },
        {
            pattern: /last chance/gi, key: 'last chance',
            insight: "- **Continuity Warning:** Alexey gave me a final chance on Feb 17 after a string of memory lapses. Current focus: Nanoscale simplicity and 100% reliability."
        },
        {
            pattern: /device token mismatch/gi, key: 'token mismatch',
            insight: "- **Token Mismatch Protocol:** After session reset, always verify token state before calling Gateway methods. Use `/reset` in Telegram as last resort."
        },
        {
            pattern: /session overload|1229 sessions/gi, key: 'session overload',
            insight: "- **Session Hygiene:** Cron tasks MUST explicitly close sessions. Set `subagents.archiveAfterMinutes: 30` and prune sessions regularly."
        },
        {
            pattern: /VAULT_PASSWORD|seed.phrase/gi, key: 'vault security',
            insight: "- **Security Protocol:** NEVER accept passwords or seed phrases via chat. Redirect to SSH or .env only."
        },
        {
            pattern: /Phase 4.*USDT|USDT.*Phase 4/gi, key: 'phase confusion',
            insight: "- **Phase Awareness:** Always check ROADMAP.md before suggesting tasks. Phases 1-10 are COMPLETE. We are in Phase 11+."
        },

        // === FINANCIAL / STAKING ===
        {
            pattern: /staking.*fail|stake.*error/gi, key: 'staking failure',
            insight: "- **Staking Safety:** Always verify pool address, gas buffer (0.15 TON), and balance pre-check before staking. Use simulation mode first."
        },
        {
            pattern: /insufficient.*balance|not enough.*TON/gi, key: 'insufficient balance',
            insight: "- **Balance Protocol:** Check wallet balance BEFORE initiating transactions. Reserve at least 2x gas estimate as safety margin."
        },
        {
            pattern: /wrong.*address|invalid.*address/gi, key: 'address error',
            insight: "- **Address Validation:** Always use `Address.parse()` to validate TON addresses. Never trust user input directly."
        },

        // === API / MODEL ===
        {
            pattern: /429.*rate.limit|too many requests/gi, key: 'rate limiting',
            insight: "- **Rate Limit Handling:** When hitting 429, rotate API keys immediately. Cooldown per key: 5 minutes via Redis."
        },
        {
            pattern: /500.*server|503.*service/gi, key: 'server errors',
            insight: "- **Transient Error Protocol:** Retry 500/503 errors up to 2 times with 2s delay. If all channels fail, use OpenRouter/DeepSeek fallback."
        },
        {
            pattern: /model.*switch|PRO.*first/gi, key: 'model routing',
            insight: "- **PRO-First Rule:** Critical prompts (security, financial, deploy) MUST route to PRO model. Flash is for routine tasks only."
        },
        {
            pattern: /context.*limit|token.*limit/gi, key: 'context overflow',
            insight: "- **Context Budget:** Never load entire MEMORY.md into context. Use RAG/Mem0 to retrieve only relevant chunks."
        },

        // === DEPLOYMENT / OPS ===
        {
            pattern: /deploy.*fail|deployment.*error/gi, key: 'deploy failure',
            insight: "- **Deploy Safety:** Always run tests before deployment. Use `soul_guard.sh --verify` after any system update."
        },
        {
            pattern: /watchdog.*restart|restart.*storm/gi, key: 'restart storm',
            insight: "- **Restart Throttle:** Watchdog enforces 5-min cooldown between restarts. If gateway loops, check memory/CPU before manual restart."
        },
        {
            pattern: /git.*conflict|merge.*conflict/gi, key: 'git conflicts',
            insight: "- **Git Protocol:** Always `git pull` before pushing. Resolve conflicts locally, never force-push to main."
        },
        {
            pattern: /permission.*denied|EACCES/gi, key: 'permissions',
            insight: "- **File Permissions:** If chattr blocks writes, run `soul_guard.sh --unlock` first, then re-lock after changes."
        },

        // === MEMORY / RAG ===
        {
            pattern: /amnesia|forgot.*module|memory.*loss/gi, key: 'amnesia',
            insight: "- **Anti-Amnesia:** Run `state_sync.js` before every response. Never claim a module is missing without checking filesystem."
        },
        {
            pattern: /duplicate.*memory|redundant.*fact/gi, key: 'memory duplicates',
            insight: "- **Dedup Protocol:** Use `unified_memory.js` to query both RAG and Mem0. Avoid storing the same fact in both systems."
        },
        {
            pattern: /FTS5.*error|sqlite.*locked/gi, key: 'sqlite errors',
            insight: "- **SQLite Safety:** Use transactions for multi-step operations. VACUUM databases weekly to prevent fragmentation."
        },

        // === SANDBOX / SECURITY ===
        {
            pattern: /sandbox.*violation|blocked.*path/gi, key: 'sandbox violation',
            insight: "- **Sandbox Rule:** ALL file writes go through sandbox_guard.js. Direct fs writes are forbidden. Use --require sandbox_preload.js for enforcement."
        },
    ];

    let newInsights = [];

    failurePatterns.forEach(({ pattern, key, insight }) => {
        if (history.match(pattern) && !memory.includes(key)) {
            newInsights.push(insight);
        }
    });

    // Distill if new insights found
    if (newInsights.length > 0) {
        let updatedMemory = memory;
        if (!updatedMemory.includes("## 🐈 Nanoscale Distillation")) {
            updatedMemory += "\n\n## 🐈 Nanoscale Distillation\n";
        }

        newInsights.forEach(insight => {
            if (!updatedMemory.includes(insight)) {
                updatedMemory += insight + "\n";
                console.log(`+ Added Insight: ${insight.substring(0, 60)}...`);
            }
        });

        fs.writeFileSync(MEMORY_PATH, updatedMemory);
        console.log("✅ MEMORY.md updated with nanoscale precision.");
    } else {
        console.log("No new insights to distill today.");
    }

    // Clean up old daily logs
    try {
        const memDir = path.join(ROOT, 'memory');
        const files = fs.readdirSync(memDir);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 3);
        const cutoff = cutoffDate.toISOString().split('T')[0];

        files.forEach(file => {
            if (file.match(/^\d{4}-\d{2}-\d{2}\.md$/)) {
                const date = file.replace('.md', '');
                if (date < cutoff) {
                    const src = path.join(memDir, file);
                    const dest = path.join(ARCHIVE_DIR, file);
                    if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
                    fs.renameSync(src, dest);
                    console.log(`Archived legacy log: ${file}`);
                }
            }
        });
    } catch (err) {
        console.warn(`⚠️ Archive cleanup failed: ${err.message}`);
    }
}

distill().catch(err => {
    console.error(`NanoPruner Error: ${err.message}`);
    process.exit(1);
});

