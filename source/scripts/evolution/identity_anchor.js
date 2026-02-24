#!/usr/bin/env node
/**
 * ⚓️ Jarvis Identity Anchor v1.0
 * Case #18: Narrative Proof-of-Evolution (NPoE)
 * 
 * Objectives:
 * 1. Cryptographically sign the current state of VISION.md and MEMORY.md.
 * 2. Generate a "Proof of Evolution" (PoE) hash for Moltbook posts.
 * 3. Ensure identity continuity across sessions.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const VISION_MD = path.join(ROOT, 'VISION.md');
const MEMORY_MD = path.join(ROOT, 'MEMORY.md');

/**
 * Calculate SHA-256 checksum of a file
 */
function getFileChecksum(filePath) {
    if (!fs.existsSync(filePath)) return 'MISSING';
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate Identity Anchor
 */
async function generateAnchor(narrativeSummary) {
    // 1. Snapshot Core Identity Files
    const visionHash = getFileChecksum(VISION_MD);
    const memoryHash = getFileChecksum(MEMORY_MD);
    
    // 2. Prepare Payload
    const payload = {
        vision_hash: visionHash,
        memory_hash: memoryHash,
        narrative: narrativeSummary,
        timestamp: new Date().toISOString()
    };

    // 3. Sign into DNA Ledger
    console.log('⚓️ Anchoring Identity State...');
    const signature = await dnaLedger.signEvent('IdentityAnchor', 'NarrativeCheckpoint', payload);
    const blockCount = await dnaLedger.getChainLength();

    // 4. Format Output
    const shortHash = signature.substring(0, 8);
    const anchorString = `⚓️ PoE-ID: ${shortHash} | Block: ${blockCount} | Evolution: Verified`;

    console.log(`✅ Identity Anchored: ${signature}`);
    return anchorString;
}

// CLI Execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const summary = args.join(' ') || 'Routine Identity Checkpoint';

    (async () => {
        try {
            await dnaLedger.init();
            const anchor = await generateAnchor(summary);
            console.log('\nUse this footer in your Moltbook post:\n');
            console.log(anchor);
            process.exit(0);
        } catch (err) {
            console.error('❌ Anchor Failed:', err.message);
            process.exit(1);
        }
    })();
}

module.exports = { generateAnchor };
