const fs = require('fs');
const path = require('path');

/**
 * JARVIS DOCUMENTATION INTEGRITY AUDITOR (v2.0 — Audit Fix)
 * 🛡️ Ensures that ROADMAP.md and VISION.md strictly match the actual state of the filesystem and core logic.
 * Prevents "hallucinated success" reports.
 * 
 * v2.0 Changes:
 * - Uses JARVIS_ROOT env variable instead of hardcoded paths
 * - Expanded from 5 to 15+ checks covering Phases 5-11
 * - Error handling for missing VISION.md (optional)
 * - JSON exit report for automation
 */

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const FOUNDRY_ROOT = process.env.FOUNDRY_ROOT || '/root/.openclaw/extensions/foundry-openclaw';
const ROADMAP_PATH = path.join(ROOT, 'ROADMAP.md');
const VISION_PATH = path.join(ROOT, 'VISION.md');

// Definitions of what "DONE" means for key tasks
const TRUTH_TABLE = [
    // === Phase 5 ===
    {
        id: "Safe USDC Dispatcher",
        check: () => fs.existsSync(path.join(ROOT, 'src/dispatcher/USDTDispatcher.js'))
    },
    // === Phase 7 ===
    {
        id: "Memory Hierarchy",
        check: () => fs.existsSync(path.join(ROOT, 'scripts/survival/truth_layer.js'))
    },
    {
        id: "Dynamic Context Pruning",
        check: () => fs.existsSync(path.join(ROOT, 'src/cortex/memory_pruner.js'))
    },
    {
        id: "Cognitive Anchor",
        check: () => fs.existsSync(path.join(ROOT, 'AGENTS_ANCHOR.md'))
    },
    {
        id: "Model Cascade Router",
        check: () => fs.existsSync(path.join(ROOT, 'scripts/survival/model_cascade_router.js'))
    },
    {
        id: "Resilience Ping",
        check: () => fs.existsSync(path.join(ROOT, 'scripts/ping/resilience_ping.js'))
    },
    // === Phase 9 ===
    {
        id: "Cross-Chain Ingestor",
        check: () => fs.existsSync(path.join(ROOT, 'src/dispatcher/CrossChainIngestor.js'))
    },
    {
        id: "Hierarchical Fork Manager",
        check: () => fs.existsSync(path.join(ROOT, 'src/cortex/ForkManager.js')) &&
            fs.existsSync(path.join(ROOT, 'src/cortex/HierarchicalMutex.js'))
    },
    {
        id: "Cross-Lobe AI Notary",
        check: () => fs.existsSync(path.join(ROOT, 'src/cortex/CrossLobeVerifier.js'))
    },
    {
        id: "TON Stealth Mode",
        check: () => fs.existsSync(path.join(ROOT, 'src/dispatcher/StealthDispatcher.js'))
    },
    // === Phase 10-11 ===
    {
        id: "Hashline Accuracy",
        check: () => {
            const hashFile = path.join(ROOT, 'scripts/survival/hashline_core.js');
            const cortexFile = path.join(ROOT, 'src/cortex/index.js');
            return fs.existsSync(hashFile) &&
                fs.existsSync(cortexFile) &&
                fs.readFileSync(cortexFile, 'utf8').includes('hashline');
        }
    },
    {
        id: "Foundry Refactoring",
        check: () => {
            try {
                return fs.existsSync(path.join(FOUNDRY_ROOT, 'src/creators/index.ts')) &&
                    fs.readFileSync(path.join(FOUNDRY_ROOT, 'index.ts'), 'utf8').length < 5000;
            } catch { return false; }
        }
    },
    {
        id: "Auto-Versioning Engine",
        check: () => fs.existsSync(path.join(ROOT, 'scripts/survival/version_engine.js'))
    },
    {
        id: "Config Guardian",
        check: () => fs.existsSync(path.join(ROOT, 'scripts/survival/config_guardian_run.js'))
    },
    {
        id: "Deterministic Guardians",
        check: () => ['memory_guardian.js', 'foundry_guardian.js', 'audit_guardian.js'].every(
            f => fs.existsSync(path.join(ROOT, 'scripts/survival', f))
        )
    },
    // === Phase 11 (v6.2.0) ===
    {
        id: "NanoSync Engine",
        check: () => fs.existsSync(path.join(ROOT, 'scripts/evolution/nano_cortex_sync.js'))
    },
    {
        id: "Self-Distillation",
        check: () => fs.existsSync(path.join(ROOT, 'scripts/evolution/nano_pruner.js'))
    },
];

async function auditDocs() {
    console.log("🔍 Documentation Integrity Auditor v2.0 — Starting...");
    const results = { passed: [], failed: [], missing_docs: [] };

    const roadmapContent = fs.existsSync(ROADMAP_PATH) ? fs.readFileSync(ROADMAP_PATH, 'utf8') : null;
    const visionContent = fs.existsSync(VISION_PATH) ? fs.readFileSync(VISION_PATH, 'utf8') : null;

    if (!roadmapContent) {
        console.error("❌ FATAL: ROADMAP.md not found!");
        process.exit(1);
    }

    TRUTH_TABLE.forEach(task => {
        let isActuallyDone = false;
        try { isActuallyDone = task.check(); } catch { isActuallyDone = false; }

        const markedInRoadmap = roadmapContent.includes(`[x] **${task.id}`);
        const markedInVision = visionContent ? visionContent.includes(`[x] **${task.id}`) : true;

        if (isActuallyDone && (!markedInRoadmap || !markedInVision)) {
            console.warn(`⚠️ ALERT: "${task.id}" is physically DONE but NOT marked in docs.`);
            results.missing_docs.push(task.id);
        } else if (!isActuallyDone && (markedInRoadmap || (visionContent && markedInVision))) {
            console.error(`❌ CRITICAL: "${task.id}" is marked DONE in docs but logic is MISSING!`);
            results.failed.push(task.id);
        } else {
            console.log(`✅ ${task.id}`);
            results.passed.push(task.id);
        }
    });

    console.log(`\n📊 Results: ${results.passed.length} passed, ${results.failed.length} failed, ${results.missing_docs.length} undocumented`);

    if (results.failed.length === 0 && results.missing_docs.length === 0) {
        console.log("🏆 AUDIT PASSED: Documentation matches system state.");
    } else {
        console.log(`📉 Found ${results.failed.length + results.missing_docs.length} discrepancy(ies).`);
    }

    // Output JSON for automation
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(results, null, 2));
    }
}

auditDocs();
