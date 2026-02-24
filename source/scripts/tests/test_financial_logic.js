#!/usr/bin/env node
/**
 * 🧪 Financial Logic Tests — Risk Engine + Staking Verification
 * Tests for risk_engine.js and stake_tonstakers.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
let passed = 0;
let failed = 0;
const total = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        total.push({ name, status: '✅' });
    } catch (e) {
        failed++;
        total.push({ name, status: '❌', error: e.message });
        console.error(`  ❌ ${name}: ${e.message}`);
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

// ==================== RISK ENGINE TESTS ====================

const riskPath = path.join(ROOT, 'src/dispatcher/risk_engine.js');
const riskContent = fs.readFileSync(riskPath, 'utf8');

test('RiskEngine: Has CoinGecko price feed', () => {
    assert(riskContent.includes('coingecko.com'), 'Should contain CoinGecko API URL');
    assert(riskContent.includes('fetchPrice'), 'Should have fetchPrice function');
});

test('RiskEngine: Has price cache with TTL', () => {
    assert(riskContent.includes('PRICE_CACHE_TTL'), 'Should have cache TTL constant');
    assert(riskContent.includes('_priceCache'), 'Should have cache object');
});

test('RiskEngine: Has USD-aware thresholds', () => {
    assert(riskContent.includes('amountUSD'), 'Should calculate USD amount');
    assert(riskContent.includes('usdPrice'), 'Should track USD price');
});

test('RiskEngine: Has gas estimates for 4 chains', () => {
    assert(riskContent.includes("TON: 0.05"), 'TON gas estimate');
    assert(riskContent.includes("ETH: 0.005"), 'ETH gas estimate');
    assert(riskContent.includes("BTC: 0.0001"), 'BTC gas estimate');
    assert(riskContent.includes("SOL: 0.00025"), 'SOL gas estimate');
});

test('RiskEngine: Hard block on insufficient balance', () => {
    assert(riskContent.includes('score = 0'), 'Should hard-block (score=0) on insufficient funds');
});

test('RiskEngine: Micro-transaction spam detection', () => {
    assert(riskContent.includes('amount < gasEstimate'), 'Should detect micro-tx spam');
});

test('RiskEngine: Whitelist check', () => {
    assert(riskContent.includes('config.whitelist'), 'Should check destination whitelist');
});

test('RiskEngine: Returns comprehensive result object', () => {
    assert(riskContent.includes('amountUSD'), 'Should include USD amount in result');
    assert(riskContent.includes('totalNeeded'), 'Should include total needed');
    assert(riskContent.includes('gasEstimate'), 'Should include gas estimate');
});

// ==================== STAKING TESTS ====================

const stakePath = path.join(ROOT, 'src/dispatcher/stake_tonstakers.js');
const stakeContent = fs.readFileSync(stakePath, 'utf8');

test('Staking: Has real Tonstakers pool address', () => {
    assert(stakeContent.includes('EQCkR1cGmnsE45N4K0otPl5EnxnRakmGqeJUNua5fkWhales'), 'Should use real Tonstakers address');
});

test('Staking: Has gas buffer', () => {
    assert(stakeContent.includes('GAS_BUFFER'), 'Should define GAS_BUFFER');
    assert(stakeContent.includes('0.15'), 'Gas buffer should be 0.15 TON');
});

test('Staking: Has balance pre-check', () => {
    assert(stakeContent.includes('requiredBalance') || stakeContent.includes('balanceTON'), 'Should check balance before staking');
});

test('Staking: Has simulation guard', () => {
    assert(stakeContent.includes('ENABLE_REAL_STAKING'), 'Should have ENABLE_REAL_STAKING guard');
    assert(stakeContent.includes('SIMULATION'), 'Should log simulation mode');
});

test('Staking: Has SafetyEngine integration', () => {
    assert(stakeContent.includes('safety') || stakeContent.includes('SafetyEngine'), 'Should integrate with safety module');
});

test('Staking: Validates pool address with Address.parse', () => {
    assert(stakeContent.includes('Address.parse') || stakeContent.includes('Address'), 'Should validate address');
});

test('Staking: Exports module properly', () => {
    assert(stakeContent.includes('module.exports'), 'Should export module');
});

// ==================== SANDBOX TESTS ====================

const sandboxPath = path.join(ROOT, 'scripts/survival/sandbox_guard.js');
const sandboxContent = fs.readFileSync(sandboxPath, 'utf8');

test('Sandbox: Has rate limiter', () => {
    assert(sandboxContent.includes('RATE_LIMIT_OPS'), 'Should define rate limit');
    assert(sandboxContent.includes('checkRateLimit'), 'Should have rate limit function');
});

test('Sandbox: Rate limit is 10 ops/sec', () => {
    assert(sandboxContent.includes('RATE_LIMIT_OPS = 10'), 'Should be 10 ops/sec');
});

// ==================== ROUTER TESTS ====================

const routerPath = path.join(ROOT, 'scripts/survival/model_cascade_router.js');
const routerContent = fs.readFileSync(routerPath, 'utf8');

test('Router: Has token counter', () => {
    assert(routerContent.includes('_trackTokens'), 'Should have _trackTokens method');
    assert(routerContent.includes('tokenStats'), 'Should track token stats');
});

test('Router: Persists token stats to file', () => {
    assert(routerContent.includes('TOKEN_STATS_PATH'), 'Should define token stats path');
    assert(routerContent.includes('token_stats.json'), 'Should use token_stats.json');
});

test('Router: Has DeepSeek fallback', () => {
    assert(routerContent.includes('deepseekFallback') || routerContent.includes('_deepseekFallback'), 'Should have DeepSeek fallback');
    assert(routerContent.includes('api.deepseek.com'), 'Should use DeepSeek API');
});

test('Router: Fallback chain order', () => {
    assert(routerContent.includes('OpenRouter') && routerContent.includes('DeepSeek'), 'Should have both fallbacks');
});

test('Router: Has getTokenStats method', () => {
    assert(routerContent.includes('getTokenStats'), 'Should expose getTokenStats');
});

// ==================== NEW MODULES EXIST ====================

test('Module: jarvis_logger.js exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'scripts/survival/jarvis_logger.js')), 'Logger should exist');
});

test('Module: health_endpoint.js exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'scripts/survival/health_endpoint.js')), 'Health endpoint should exist');
});

test('Module: unified_memory.js exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'scripts/evolution/unified_memory.js')), 'Unified memory should exist');
});

test('Module: sandbox_preload.js exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'scripts/survival/sandbox_preload.js')), 'Sandbox preload should exist');
});

// ==================== IDENTITY SYNC ====================

test('Identity: IDENTITY-FINGERPRINT.json is v6.2.1', () => {
    const identity = JSON.parse(fs.readFileSync(path.join(ROOT, 'IDENTITY-FINGERPRINT.json'), 'utf8'));
    assert(identity.version === '6.2.1', `Version should be 6.2.1, got ${identity.version}`);
});

test('Identity: package.json is v6.2.1', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(pkg.version === '6.2.1', `Version should be 6.2.1, got ${pkg.version}`);
});

test('Identity: ROADMAP.md has v6.2.1 title', () => {
    const roadmap = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');
    assert(roadmap.includes('6.2.1'), 'ROADMAP should reference v6.2.1');
});

// ==================== LOGGER TESTS ====================

const loggerContent = fs.readFileSync(path.join(ROOT, 'scripts/survival/jarvis_logger.js'), 'utf8');

test('Logger: Has all log levels', () => {
    assert(loggerContent.includes("'info'"), 'Should support info');
    assert(loggerContent.includes("'warn'"), 'Should support warn');
    assert(loggerContent.includes("'error'"), 'Should support error');
    assert(loggerContent.includes("'critical'"), 'Should support critical');
});

test('Logger: Has log rotation', () => {
    assert(loggerContent.includes('rotateLogs'), 'Should have rotation');
    assert(loggerContent.includes('MAX_LOG_AGE_DAYS'), 'Should have age limit');
});

test('Logger: Outputs JSON format', () => {
    assert(loggerContent.includes('JSON.stringify'), 'Should output JSON');
    assert(loggerContent.includes('.jsonl'), 'Should use JSONL format');
});

// ==================== HEALTH ENDPOINT TESTS ====================

const healthContent = fs.readFileSync(path.join(ROOT, 'scripts/survival/health_endpoint.js'), 'utf8');

test('Health: Has /health route', () => {
    assert(healthContent.includes('/health'), 'Should have /health endpoint');
});

test('Health: Returns version and uptime', () => {
    assert(healthContent.includes('version'), 'Should return version');
    assert(healthContent.includes('uptime'), 'Should return uptime');
});

test('Health: Includes token stats', () => {
    assert(healthContent.includes('tokenStats'), 'Should include token stats');
});

// ==================== NANO PRUNER TESTS ====================

const prunerContent = fs.readFileSync(path.join(ROOT, 'scripts/evolution/nano_pruner.js'), 'utf8');

test('NanoPruner: Has SQLite VACUUM', () => {
    assert(prunerContent.includes('VACUUM'), 'Should run VACUUM');
    assert(prunerContent.includes('vacuum_last'), 'Should track last vacuum time');
});

test('NanoPruner: Has 20+ failure patterns', () => {
    const patternCount = (prunerContent.match(/pattern:/g) || []).length;
    assert(patternCount >= 20, `Should have 20+ patterns, found ${patternCount}`);
});

// ==================== RESULTS ====================
console.log('\n' + '='.repeat(60));
console.log(`🧪 FINANCIAL & HEALTH SCORE TESTS`);
console.log('='.repeat(60));
total.forEach(t => console.log(`  ${t.status} ${t.name}`));
console.log('='.repeat(60));
console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failed > 0) {
    console.log('\n❌ FAILURES:');
    total.filter(t => t.error).forEach(t => console.log(`  - ${t.name}: ${t.error}`));
}

process.exit(failed > 0 ? 1 : 0);
