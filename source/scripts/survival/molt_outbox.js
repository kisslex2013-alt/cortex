const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

/**
 * 🦾 Moltbook Outbox System (WAL-enabled)
 * Part of Jarvis v6.3.0 Resilience Layer
 */
class MoltOutbox {
    constructor(dbPath = '/root/.openclaw/workspace/memory/molt_outbox.db') {
        this.dbPath = dbPath;
        this.db = new sqlite3.Database(this.dbPath);
        this.initialized = false;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS queue (
                        id TEXT PRIMARY KEY,
                        identity TEXT NOT NULL,
                        action TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        status TEXT DEFAULT 'PENDING',
                        retry_count INTEGER DEFAULT 0,
                        next_retry_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        sent_at TIMESTAMP,
                        hash TEXT UNIQUE
                    )
                `);
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_status ON queue(status)`);
                this.initialized = true;
                resolve();
            });
        });
    }

    /**
     * Queues a post or reply. Prevents duplicates via hashing.
     */
    async enqueue(identity, action, payload) {
        if (!this.initialized) await this.init();

        const payloadStr = JSON.stringify(payload);
        const hash = crypto.createHash('sha256').update(`${identity}:${action}:${payloadStr}`).digest('hex');
        const id = crypto.randomUUID();

        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO queue (id, identity, action, payload, hash) VALUES (?, ?, ?, ?, ?)`,
                [id, identity, action, payloadStr, hash],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            console.log(`[MoltOutbox] Duplicate detected, skipping: ${hash}`);
                            return resolve({ status: 'DUPLICATE', hash });
                        }
                        return reject(err);
                    }
                    resolve({ id, status: 'PENDING', hash });
                }
            );
        });
    }

    async getPending() {
        if (!this.initialized) await this.init();
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM queue WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP) ORDER BY created_at ASC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async markSent(id) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE queue SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async markFailed(id, retryAfterSeconds = 3600) {
        return new Promise((resolve, reject) => {
            const nextRetry = new Date(Date.now() + retryAfterSeconds * 1000).toISOString().replace('T', ' ').substring(0, 19);
            this.db.run(
                `UPDATE queue SET retry_count = retry_count + 1, next_retry_at = ? WHERE id = ?`,
                [nextRetry, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}

module.exports = new MoltOutbox();
