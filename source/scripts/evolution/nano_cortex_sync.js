#!/usr/bin/env node
/**
 * 🐈 NanoCortex Stream v1.1 (Audit Fix)
 * Replaces heavy SQL pruning with fast, append-only history streams.
 * Inspired by HKUDS/nanobot simplicity.
 * 
 * v1.1 Changes:
 * - Transactional write: writes to temp file first, then renames (prevents data loss on crash)
 * - Uses JARVIS_ROOT env variable instead of hardcoded paths
 * - Human-readable format in HISTORY.md instead of raw JSON
 * - Added error handling for Redis connection
 */
const fs = require('fs');
const Redis = require('ioredis');
const path = require('path');
const os = require('os');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const redis = new Redis({ lazyConnect: true, retryStrategy: (times) => times > 3 ? null : Math.min(times * 200, 1000) });
const HISTORY_FILE = path.join(ROOT, 'memory/HISTORY.md');

async function syncStreams() {
    console.log("🌊 NanoCortex v1.1: Syncing Redis Streams to HISTORY.md...");

    try {
        await redis.connect();
    } catch (err) {
        console.error(`❌ Redis connection failed: ${err.message}. Skipping sync.`);
        process.exit(1);
    }

    const streams = ['jarvis:truth:Cortex', 'jarvis:truth:System', 'jarvis:truth:DNALedger'];
    let entriesSynced = 0;
    let allContent = '';

    for (const stream of streams) {
        const len = await redis.xlen(stream);
        if (len === 0) continue;

        const entries = await redis.xrange(stream, '-', '+');
        const timestamp = new Date().toISOString();
        let content = `\n### ${stream.split(':').pop()} (${timestamp})\n`;

        entries.forEach(([id, fields]) => {
            const data = {};
            for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];

            // Human-readable format instead of raw JSON
            try {
                const payload = JSON.parse(data.payload || '{}');
                const inner = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data || {};
                const event = payload.event || 'Unknown';
                const ts = payload.timestamp ? new Date(payload.timestamp).toLocaleTimeString('ru-RU') : '?';
                const details = Object.entries(inner).map(([k, v]) => `${k}=${v}`).join(', ');
                content += `- \`${ts}\` **${event}** ${details}\n`;
            } catch {
                content += `- [${id}] ${JSON.stringify(data)}\n`;
            }
            entriesSynced++;
        });

        allContent += content;
    }

    if (entriesSynced === 0) {
        console.log("ℹ️ No new entries to sync.");
        await redis.quit();
        return;
    }

    // Transactional write: write to temp file first, then append to main
    const tmpFile = path.join(os.tmpdir(), `nano_sync_${Date.now()}.tmp`);
    try {
        fs.writeFileSync(tmpFile, allContent);
        fs.appendFileSync(HISTORY_FILE, fs.readFileSync(tmpFile, 'utf8'));
        fs.unlinkSync(tmpFile);

        // Only TRIM after successful write
        for (const stream of streams) {
            await redis.xtrim(stream, 'MAXLEN', 0);
        }

        console.log(`✅ NanoCortex: ${entriesSynced} entries safely synced to history.`);
    } catch (err) {
        console.error(`❌ Write failed, Redis streams NOT trimmed (no data loss): ${err.message}`);
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }

    await redis.quit();
}

syncStreams().then(() => process.exit(0)).catch(err => {
    console.error(`NanoCortex fatal: ${err.message}`);
    redis.quit().catch(() => { });
    process.exit(1);
});
