#!/usr/bin/env node
// scripts/state_sync.js
// Atomic State Sync v2.0 — проверяет РЕАЛЬНОЕ состояние системы
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// v2.1: Uses JARVIS_ROOT env variable (audit recommendation)
const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';

// v2.2: Load unified config (Audit Fix #1)
let JARVIS_CONFIG = {};
try {
    const configPath = path.join(ROOT, 'jarvis_config.json');
    if (fs.existsSync(configPath)) {
        JARVIS_CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        Object.freeze(JARVIS_CONFIG);
        Object.freeze(JARVIS_CONFIG.limits);
        Object.freeze(JARVIS_CONFIG.finance);
        Object.freeze(JARVIS_CONFIG.security);
    }
} catch (e) {
    console.error(`[state_sync] Failed to load jarvis_config.json: ${e.message}`);
}

function exec(cmd) {
    try { return execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim(); }
    catch { return null; }
}

async function syncState() {
    const state = {
        timestamp: new Date().toISOString(),
        verified: true,
    };

    // ═══ 1. ANCHOR FILES ═══
    state.files = {
        anchor_exists: fs.existsSync(path.join(ROOT, 'AGENTS_ANCHOR.md')),
        memory_exists: fs.existsSync(path.join(ROOT, 'MEMORY.md')),
        roadmap_exists: fs.existsSync(path.join(ROOT, 'ROADMAP.md')),
        env_exists: fs.existsSync(path.join(ROOT, '.env')),
    };

    // ═══ 2. CORE MODULES INTEGRITY ═══
    state.modules = {
        cortex_ready: fs.existsSync(path.join(ROOT, 'src/cortex/index.js')),
        dispatcher_ready: fs.existsSync(path.join(ROOT, 'src/dispatcher/index.js')),
        nexus_core: fs.existsSync(path.join(ROOT, 'scripts/survival/nexus_core.js')),
        battle_duty: fs.existsSync(path.join(ROOT, 'scripts/survival/battle_duty.js')),
        model_router: fs.existsSync(path.join(ROOT, 'scripts/survival/model_cascade_router.js')),
        truth_layer: fs.existsSync(path.join(ROOT, 'scripts/survival/truth_layer.js')),
        dna_ledger: fs.existsSync(path.join(ROOT, 'scripts/survival/dna_ledger.js')),
        watchdog: fs.existsSync(path.join(ROOT, 'scripts/survival/watchdog.py')),
        // Phase 9 modules
        fork_manager: fs.existsSync(path.join(ROOT, 'src/cortex/ForkManager.js')),
        cross_lobe_verifier: fs.existsSync(path.join(ROOT, 'src/cortex/CrossLobeVerifier.js')),
        hierarchical_mutex: fs.existsSync(path.join(ROOT, 'src/cortex/HierarchicalMutex.js')),
        cross_chain_ingestor: fs.existsSync(path.join(ROOT, 'src/dispatcher/CrossChainIngestor.js')),
        stealth_dispatcher: fs.existsSync(path.join(ROOT, 'src/dispatcher/StealthDispatcher.js')),
        reputation_engine: fs.existsSync(path.join(ROOT, 'src/cortex/reputation.js')),
    };

    // ═══ 3. IDENTITY VERSION ═══
    try {
        const fpPath = path.join(ROOT, 'IDENTITY-FINGERPRINT.json');
        if (fs.existsSync(fpPath)) {
            const fp = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
            state.identity = { name: fp.name, version: fp.version };
        } else {
            state.identity = { error: 'fingerprint_missing' };
        }
    } catch { state.identity = { error: 'parse_failed' }; }

    // ═══ 4. GIT STATUS ═══
    state.git = {
        last_commit: exec(`git -C "${ROOT}" log -1 --format="%h %s" 2>/dev/null`),
        dirty_files: parseInt(exec(`git -C "${ROOT}" status --porcelain 2>/dev/null | wc -l`) || '0'),
    };

    // ═══ 5. PROCESSES ═══
    state.processes = {
        redis_alive: exec('redis-cli PING 2>/dev/null') === 'PONG',
        battle_duty: exec('pgrep -f battle_duty 2>/dev/null') !== null,
        resilience_ping: exec('pgrep -f resilience_ping 2>/dev/null') !== null,
    };

    // ═══ 6. REDIS STREAMS ═══
    if (state.processes.redis_alive) {
        state.streams = {
            truth_system: exec('redis-cli XLEN jarvis:truth:System 2>/dev/null'),
            consciousness: exec('redis-cli XLEN jarvis:consciousness:stream 2>/dev/null'),
            db_keys: exec('redis-cli DBSIZE 2>/dev/null'),
        };
    }

    // ═══ 7. RESOURCES ═══
    state.resources = {
        ram_percent: parseInt(exec("free | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}'") || '0'),
        cpu_load: parseFloat(exec("cat /proc/loadavg 2>/dev/null")?.split(' ')[0] || '0'),
        uptime: exec('uptime -p 2>/dev/null'),
    };

    // ═══ 8. ROADMAP PHASES ═══
    const roadmapPath = path.join(ROOT, 'ROADMAP.md');
    if (fs.existsSync(roadmapPath)) {
        const content = fs.readFileSync(roadmapPath, 'utf8');
        const phases = content.match(/Phase \d+.*?(COMPLETE|ACTIVE|PLANNED|IN.PROGRESS)/gi) || [];
        state.phases = phases.reduce((acc, p) => {
            const m = p.match(/Phase (\d+).*?(COMPLETE|ACTIVE|PLANNED|IN.PROGRESS)/i);
            if (m) acc[`phase_${m[1]}`] = m[2];
            return acc;
        }, {});
    }

    return state;
}

// Export for programmatic use
module.exports = { syncState, JARVIS_CONFIG };

// CLI mode
if (require.main === module) {
    syncState().then(state => {
        console.log(JSON.stringify(state, null, 2));
    }).catch(err => {
        console.error(JSON.stringify({ error: err.message, verified: false }));
    });
}
