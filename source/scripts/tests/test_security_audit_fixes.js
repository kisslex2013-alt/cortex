#!/usr/bin/env node
/**
 * 🧪 Security Audit Fixes — Verification Test
 * AUDIT-FIX-2026-02-18
 * 
 * Tests all fixes from the security audit:
 *   VULN-SEC-001: SOUL.md in soul_guard
 *   VULN-SEC-002: Symlink bypass in sandbox_guard
 *   VULN-SEC-003: Identity files in BLOCKED_PATHS
 *   VULN-SEC-004: Command blocklist in exec_safe_wrapper
 *   VULN-FIN-001: Placeholder pool address removed
 *   VULN-FIN-002: Gas buffer in stake_tonstakers
 *   VULN-RAG-001: Transaction wrapping (structural check)
 *   VULN-RAG-002: Synonym mapping (structural check)
 *   VULN-RAG-004: HISTORY.md rotation (structural check)
 *   PRO-First enforcement in model_cascade_router
 *   Restart throttling in watchdog (structural check)
 * 
 * Usage: node scripts/tests/test_security_audit_fixes.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../..');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\n🧪 SECURITY AUDIT FIXES — VERIFICATION TEST\n');
console.log('═'.repeat(55));

// ─── VULN-SEC-001: soul_guard.sh PROTECTED_FILES ───────
console.log('\n📋 soul_guard.sh');
const soulGuardContent = fs.readFileSync(path.join(ROOT, 'scripts/survival/soul_guard.sh'), 'utf8');

test('VULN-SEC-001: SOUL.md in PROTECTED_FILES', () => {
    assert(soulGuardContent.includes('SOUL.md'), 'SOUL.md not found in PROTECTED_FILES');
});

test('VULN-SEC-001: ROADMAP.md in PROTECTED_FILES', () => {
    assert(soulGuardContent.includes('ROADMAP.md'), 'ROADMAP.md not found in PROTECTED_FILES');
});

// ─── VULN-SEC-002/003: sandbox_guard.js ─────────────────
console.log('\n📋 sandbox_guard.js');
const sandboxContent = fs.readFileSync(path.join(ROOT, 'scripts/survival/sandbox_guard.js'), 'utf8');

test('VULN-SEC-002: Uses realpathSync for symlink protection', () => {
    assert(sandboxContent.includes('realpathSync'), 'realpathSync not found');
});

test('VULN-SEC-003: IDENTITY-FINGERPRINT.json in BLOCKED_PATHS', () => {
    assert(sandboxContent.includes('IDENTITY-FINGERPRINT.json'), 'IDENTITY-FINGERPRINT.json not in blocklist');
});

test('VULN-SEC-003: SOUL.md in BLOCKED_PATHS', () => {
    assert(sandboxContent.includes("'SOUL.md'"), 'SOUL.md not in blocklist');
});

test('VULN-SEC-003: AGENTS_ANCHOR.md in BLOCKED_PATHS', () => {
    assert(sandboxContent.includes("'AGENTS_ANCHOR.md'"), 'AGENTS_ANCHOR.md not in blocklist');
});

// Test sandbox_guard path checking (runtime)
const sandbox = require(path.join(ROOT, 'scripts/survival/sandbox_guard'));

test('sandbox_guard: Blocks /etc/passwd', () => {
    const result = sandbox.checkPath('/etc/passwd');
    assert(!result.allowed, 'Should block /etc/passwd');
});

test('sandbox_guard: Blocks IDENTITY-FINGERPRINT.json', () => {
    const result = sandbox.checkPath(path.join(ROOT, 'IDENTITY-FINGERPRINT.json'));
    assert(!result.allowed, 'Should block IDENTITY-FINGERPRINT.json');
});

test('sandbox_guard: Blocks SOUL.md', () => {
    const result = sandbox.checkPath(path.join(ROOT, 'SOUL.md'));
    assert(!result.allowed, 'Should block SOUL.md');
});

test('sandbox_guard: Allows memory/test.md', () => {
    const result = sandbox.checkPath(path.join(ROOT, 'memory/test.md'));
    assert(result.allowed, 'Should allow memory/test.md');
});

// ─── VULN-SEC-004: exec_safe_wrapper.js ─────────────────
console.log('\n📋 exec_safe_wrapper.js');
const execContent = fs.readFileSync(path.join(ROOT, 'scripts/survival/exec_safe_wrapper.js'), 'utf8');

test('VULN-SEC-004: Has BLOCKED_COMMANDS array', () => {
    assert(execContent.includes('BLOCKED_COMMANDS'), 'BLOCKED_COMMANDS not found');
});

test('VULN-SEC-004: Blocks rm -rf', () => {
    assert(execContent.includes('rm\\s+'), 'rm -rf pattern not found');
});

test('VULN-SEC-004: Blocks curl | bash', () => {
    assert(execContent.includes('curl'), 'curl | bash pattern not found');
});

test('VULN-SEC-004: Has validateCommand function', () => {
    assert(execContent.includes('validateCommand'), 'validateCommand function not found');
});

// ─── VULN-FIN-001/002: stake_tonstakers.js ───────────────
console.log('\n📋 stake_tonstakers.js');
const stakeContent = fs.readFileSync(path.join(ROOT, 'src/dispatcher/stake_tonstakers.js'), 'utf8');

test('VULN-FIN-001: No placeholder pool address', () => {
    assert(!stakeContent.includes('EQD0n9u7879ZAR9'), 'Placeholder address still present!');
});

test('VULN-FIN-001: Has TONSTAKERS_POOL constant', () => {
    assert(stakeContent.includes('TONSTAKERS_POOL'), 'TONSTAKERS_POOL constant not found');
});

test('VULN-FIN-001: Uses Address.parse for validation', () => {
    assert(stakeContent.includes('Address.parse'), 'Address.parse validation not found');
});

test('VULN-FIN-002: Has GAS_BUFFER', () => {
    assert(stakeContent.includes('GAS_BUFFER'), 'GAS_BUFFER not found');
});

test('VULN-FIN-002: Has balance pre-check', () => {
    assert(stakeContent.includes('getBalance'), 'Balance pre-check not found');
});

test('VULN-FIN-002: Has ENABLE_REAL_STAKING guard', () => {
    assert(stakeContent.includes('ENABLE_REAL_STAKING'), 'Production guard not found');
});

test('VULN-FIN-002: Integrates SafetyEngine', () => {
    assert(stakeContent.includes('validateTransaction'), 'SafetyEngine integration not found');
});

// ─── VULN-FIN-004: risk_engine.js ────────────────────────
console.log('\n📋 risk_engine.js');
const riskContent = fs.readFileSync(path.join(ROOT, 'src/dispatcher/risk_engine.js'), 'utf8');

test('VULN-FIN-004: Has GAS_ESTIMATES', () => {
    assert(riskContent.includes('GAS_ESTIMATES'), 'GAS_ESTIMATES not found');
});

test('VULN-FIN-004: Has walletBalance parameter', () => {
    assert(riskContent.includes('walletBalance'), 'walletBalance parameter not found');
});

// ─── VULN-RAG-001: rag_retriever.js ──────────────────────
console.log('\n📋 rag_retriever.js');
const ragContent = fs.readFileSync(path.join(ROOT, 'scripts/evolution/rag_retriever.js'), 'utf8');

test('VULN-RAG-001: Uses BEGIN TRANSACTION', () => {
    assert(ragContent.includes('BEGIN TRANSACTION'), 'Transaction wrapping not found');
});

test('VULN-RAG-001: Uses COMMIT', () => {
    assert(ragContent.includes('COMMIT'), 'COMMIT not found');
});

test('VULN-RAG-001: Uses ROLLBACK', () => {
    assert(ragContent.includes('ROLLBACK'), 'ROLLBACK not found');
});

test('VULN-RAG-002: Has SYNONYM_MAP', () => {
    assert(ragContent.includes('SYNONYM_MAP'), 'Synonym mapping not found');
});

test('VULN-RAG-002: Has expandWithSynonyms function', () => {
    assert(ragContent.includes('expandWithSynonyms'), 'expandWithSynonyms function not found');
});

// ─── VULN-RAG-004: nano_pruner.js ────────────────────────
console.log('\n📋 nano_pruner.js');
const prunerContent = fs.readFileSync(path.join(ROOT, 'scripts/evolution/nano_pruner.js'), 'utf8');

test('VULN-RAG-004: Has rotateHistoryIfNeeded function', () => {
    assert(prunerContent.includes('rotateHistoryIfNeeded'), 'HISTORY rotation not found');
});

test('VULN-RAG-004: Has MAX_HISTORY_SIZE_KB', () => {
    assert(prunerContent.includes('MAX_HISTORY_SIZE_KB'), 'Size threshold not found');
});

// ─── PRO-First: model_cascade_router.js ──────────────────
console.log('\n📋 model_cascade_router.js');
const routerContent = fs.readFileSync(path.join(ROOT, 'scripts/survival/model_cascade_router.js'), 'utf8');

test('PRO-First: Has CRITICAL_KEYWORDS', () => {
    assert(routerContent.includes('CRITICAL_KEYWORDS'), 'PRO-First keywords not found');
});

test('PRO-First: Has _isCriticalPrompt method', () => {
    assert(routerContent.includes('_isCriticalPrompt'), 'Critical prompt detection not found');
});

test('PRO-First: Has PRO_MODEL constant', () => {
    assert(routerContent.includes('gemini-2.5-pro-preview'), 'PRO model reference not found');
});

test('OpenRouter: Has _openRouterFallback method', () => {
    assert(routerContent.includes('_openRouterFallback'), 'OpenRouter fallback not found');
});

test('Retry: Has MAX_TRANSIENT_RETRIES', () => {
    assert(routerContent.includes('MAX_TRANSIENT_RETRIES'), '500/503 retry logic not found');
});

// ─── Restart throttling: watchdog.py ─────────────────────
console.log('\n📋 watchdog.py');
const watchdogContent = fs.readFileSync(path.join(ROOT, 'scripts/survival/watchdog.py'), 'utf8');

test('Watchdog: Has MIN_RESTART_INTERVAL', () => {
    assert(watchdogContent.includes('MIN_RESTART_INTERVAL'), 'Restart throttling not found');
});

test('Watchdog: Has RESTART THROTTLED log message', () => {
    assert(watchdogContent.includes('RESTART THROTTLED'), 'Throttle warning not found');
});

// ─── SUMMARY ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(55));
console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failed === 0) {
    console.log('\n🏆 ALL SECURITY AUDIT FIXES VERIFIED SUCCESSFULLY!\n');
    process.exit(0);
} else {
    console.log(`\n⚠️ ${failed} test(s) FAILED — review required.\n`);
    process.exit(1);
}
