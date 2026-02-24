#!/usr/bin/env node
/**
 * 🕵️ Claude-Mem Evolution Script v1.0
 * Purpose: Captures granular session artifacts into JasonIsntHappy ACID DB.
 * Part of Progressive Memory Layer (Phase 11).
 */
const fs = require('fs');
const path = require('path');
const db = require('../memory/jasonisnthappy');
const router = require('../survival/model_cascade_router');
const crypto = require('crypto');

const ROOT = '/root/.openclaw/workspace';
const SESSION_LOG = path.join(ROOT, 'scripts/survival/session_wal.jsonl');

/**
 * Summarizes the current session into a "Temporal Artifact".
 */
async function captureArtifact(taskId, summaryText = null) {
    console.log(`[Claude-Mem] 🧊 Capturing artifact for task: ${taskId}`);
    
    let content = summaryText;
    
    // If no summary provided, try to generate one from recent WAL
    if (!content && fs.existsSync(SESSION_LOG)) {
        const logs = fs.readFileSync(SESSION_LOG, 'utf8').split('\n').filter(l => l.trim()).slice(-50).join('\n');
        const prompt = `
Summarize the following tool calls and actions into a compact "Temporal Artifact".
Focus on DECISIONS made, BUGS fixed, and ARCHITECTURAL changes.
Avoid fluff. Use 2-3 bullet points.

LOGS:
${logs}
`;
        const result = await router.think(prompt, { model: 'gemini-3-flash-preview' });
        content = result.text;
    }

    if (!content) {
        console.warn("[Claude-Mem] No content found to capture.");
        return;
    }

    const artifact = {
        taskId,
        timestamp: new Date().toISOString(),
        content: content.trim(),
        version: "v6.2.2"
    };

    const id = crypto.createHash('md5').update(taskId + artifact.timestamp).digest('hex').substring(0, 12);
    
    try {
        const proof = await db.insert('temporal_artifacts', id, artifact);
        console.log(`✅ [Claude-Mem] Artifact ${id} secured in ACID DB. Hashline proof generated.`);
        return { id, proof };
    } catch (e) {
        console.error(`❌ [Claude-Mem] Failed to secure artifact: ${e.message}`);
    }
}

/**
 * Retrieves relevant artifacts for context injection.
 */
async function getTemporalContext(query = "") {
    if (!db.initialized) await db.init();
    
    const artifacts = await db.list('temporal_artifacts');
    if (artifacts.length === 0) return "";

    // In a full implementation, we would use vector search here.
    // For v1.0, we'll return the last 3 artifacts as "Short-Term Temporal Memory".
    const recent = artifacts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 3);
    
    let context = "### 🕒 Temporal Memory (Recent Artifacts)\n";
    for (const a of recent) {
        context += `- **[${a.timestamp}] Task: ${a.taskId}**: ${a.content}\n`;
    }
    return context;
}

if (require.main === module) {
    const action = process.argv[2];
    const taskId = process.argv[3] || "manual_capture";
    
    if (action === 'capture') {
        captureArtifact(taskId).then(() => process.exit(0));
    } else if (action === 'context') {
        getTemporalContext().then(ctx => {
            console.log(ctx);
            process.exit(0);
        });
    } else {
        console.log("Usage: node claude_mem.js <capture|context> [task_id]");
        process.exit(1);
    }
}

module.exports = { captureArtifact, getTemporalContext };
