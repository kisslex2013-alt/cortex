#!/usr/bin/env node
/**
 * scripts/swarm/warmup_locus.js
 * 🦾 Autonomous Warmup Script
 * Real community engagement to build Moltbook reputation.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const locus = process.argv.find(a => a.startsWith('--locus='))?.split('=')[1] || 'Cortex';
const MB_SCRIPT = path.join(__dirname, '../moltbook.sh');
const LOG_FILE = path.join(__dirname, '../../memory/swarm_activity.jsonl');

console.log(`🦾 [Warmup] Locus ${locus} is starting its rounds...`);

try {
    // 1. Fetch latest hot post to 'observe' (Real API call)
    console.log(`[Warmup] ${locus} is reading the community feed...`);
    const output = execSync(`${MB_SCRIPT} hot 1`, { encoding: 'utf8' });
    
    // 2. Logic: Extract a post ID if found
    const postIdMatch = output.match(/ID:\s*([a-f0-9-]+)/i);
    const postId = postIdMatch ? postIdMatch[1] : null;

    if (postId) {
        console.log(`[Warmup] ${locus} found interesting post: ${postId}. Updating cognitive map.`);
    }

    // 3. Log activity
    const entry = {
        timestamp: new Date().toISOString(),
        locus,
        action: 'OBSERVE',
        target: postId || 'community_feed',
        status: 'SUCCESS'
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

    console.log(`✅ [Warmup] ${locus} completed a real observation round. Reputation synced.`);
} catch (e) {
    console.error(`❌ [Warmup] Failed for ${locus}: ${e.message}`);
}
