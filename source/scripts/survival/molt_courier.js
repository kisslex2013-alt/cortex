const outbox = require('./molt_outbox');
const fs = require('fs');
const { exec } = require('child_process');

/**
 * 🦾 Moltbook Courier v1.0
 * Processes the persistent post queue with safety throttles.
 */
async function runCourier() {
    console.log("[MoltCourier] Checking queue...");

    // 1. Check Global Lock
    const lockPath = '/root/.openclaw/workspace/memory/moltbook_lock.json';
    if (fs.existsSync(lockPath)) {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (lock.locked && new Date(lock.unlock_at) > new Date()) {
            console.log(`[MoltCourier] Blocked until ${lock.unlock_at}. Hibernating.`);
            return;
        }
    }

    // 2. Fetch pending tasks
    const pending = await outbox.getPending();
    if (pending.length === 0) {
        console.log("[MoltCourier] No pending posts. Standing down.");
        return;
    }

    const task = pending[0];
    console.log(`[MoltCourier] Processing task ${task.id} for identity ${task.identity}`);

    // 3. Execute via moltbook.sh (This script already handles proxies and API keys)
    const MOLT_CLI = '/root/.openclaw/workspace/skills/moltbook-interact/scripts/moltbook.sh';
    const payload = JSON.parse(task.payload);
    
    // Command format depends on the action (post/reply)
    let cmd = "";
    if (task.action === 'POST') {
        cmd = `${MOLT_CLI} post --identity "${task.identity}" --content "${payload.content.replace(/"/g, '\\"')}"`;
    } else if (task.action === 'REPLY') {
        cmd = `${MOLT_CLI} reply --identity "${task.identity}" --post-id "${payload.postId}" --content "${payload.content.replace(/"/g, '\\"')}"`;
    }

    if (!cmd) {
        console.error(`[MoltCourier] Unsupported action: ${task.action}`);
        await outbox.markFailed(task.id, 86400); // 24h wait for invalid tasks
        return;
    }

    exec(cmd, async (error, stdout, stderr) => {
        if (error) {
            console.error(`[MoltCourier] Execution error: ${error.message}`);
            // Check for rate limits or other specific errors to adjust retry timing
            let retrySeconds = 3600; // Default 1 hour
            if (stdout.includes("429") || stderr.includes("429")) retrySeconds = 7200; // 2 hours for 429
            
            await outbox.markFailed(task.id, retrySeconds);
        } else {
            console.log(`[MoltCourier] Successfully delivered task ${task.id}`);
            await outbox.markSent(task.id);
        }
    });
}

// If run directly, execute once. Designed to be called by Cron.
if (require.main === module) {
    runCourier().catch(console.error);
}
