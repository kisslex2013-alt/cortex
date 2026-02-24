const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

/**
 * 🦾 Task WAL (Write-Ahead Log for Sub-agents)
 * Ensures multi-step tasks survive gateway restarts.
 */
class TaskWAL {
    constructor(dbPath = '/root/.openclaw/workspace/memory/subtask_wal.db') {
        this.dbPath = dbPath;
        this.db = new sqlite3.Database(this.dbPath);
        this.initialized = false;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS tasks (
                        id TEXT PRIMARY KEY,
                        parent_session TEXT NOT NULL,
                        label TEXT,
                        agent_id TEXT,
                        instruction TEXT NOT NULL,
                        steps TEXT, -- JSON array of steps
                        current_step INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'PLANNING',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                this.initialized = true;
                resolve();
            });
        });
    }

    async createTask(parentSession, label, agentId, instruction, steps = []) {
        if (!this.initialized) await this.init();
        const id = crypto.randomUUID();
        const stepsStr = JSON.stringify(steps);

        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO tasks (id, parent_session, label, agent_id, instruction, steps) VALUES (?, ?, ?, ?, ?, ?)`,
                [id, parentSession, label, agentId, instruction, stepsStr],
                function(err) {
                    if (err) reject(err);
                    else resolve(id);
                }
            );
        });
    }

    async updateProgress(id, currentStep, status = 'ACTIVE') {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE tasks SET current_step = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [currentStep, status, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getActiveTasks() {
        if (!this.initialized) await this.init();
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM tasks WHERE status NOT IN ('COMPLETED', 'FAILED')`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
}

module.exports = new TaskWAL();
