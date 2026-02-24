#!/usr/bin/env node
/**
 * 🧪 Extension Tests — Verify memory extensions are properly installed
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
    try { fn(); passed++; results.push({ name, status: '✅' }); }
    catch (e) { failed++; results.push({ name, status: '❌', error: e.message }); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log('🧪 MEMORY EXTENSIONS VERIFICATION\n');

// ==================== SKILLBOOK ENGINE ====================

const skillbookPath = path.join(ROOT, 'scripts/evolution/skillbook_engine.js');
const skillbookContent = fs.readFileSync(skillbookPath, 'utf8');

test('Skillbook: Module exists', () => {
    assert(fs.existsSync(skillbookPath), 'skillbook_engine.js should exist');
});

test('Skillbook: Has init function', () => {
    assert(skillbookContent.includes('function init()'), 'Should have init()');
});

test('Skillbook: Has learn function', () => {
    assert(skillbookContent.includes('async function learn'), 'Should have learn()');
});

test('Skillbook: Has getSkillsContext function', () => {
    assert(skillbookContent.includes('function getSkillsContext'), 'Should have getSkillsContext()');
});

test('Skillbook: Has pattern extraction', () => {
    assert(skillbookContent.includes('extractPattern'), 'Should extract patterns from feedback');
});

test('Skillbook: Has skill rotation (max cap)', () => {
    assert(skillbookContent.includes('MAX_SKILLS'), 'Should limit total skills');
});

test('Skillbook: Has feedback logging', () => {
    assert(skillbookContent.includes('feedback_log'), 'Should log feedback to JSONL');
});

test('Skillbook: Has category emojis', () => {
    assert(skillbookContent.includes('security') && skillbookContent.includes('financial'), 'Should categorize skills');
});

test('Skillbook: Exports correctly', () => {
    assert(skillbookContent.includes('module.exports'), 'Should export module');
    assert(skillbookContent.includes('init') && skillbookContent.includes('learn'), 'Should export key functions');
});

// ==================== MEMORY OPTIMIZER ====================

const optimizerPath = path.join(ROOT, 'scripts/evolution/memory_optimizer.js');
const optimizerContent = fs.readFileSync(optimizerPath, 'utf8');

test('MemOptimizer: Module exists', () => {
    assert(fs.existsSync(optimizerPath), 'memory_optimizer.js should exist');
});

test('MemOptimizer: Has similarity function', () => {
    assert(optimizerContent.includes('function similarity'), 'Should calculate text similarity');
});

test('MemOptimizer: Has deduplication', () => {
    assert(optimizerContent.includes('deduplicateMemory'), 'Should deduplicate MEMORY.md');
});

test('MemOptimizer: Has memory health score', () => {
    assert(optimizerContent.includes('getMemoryHealth'), 'Should calculate health score');
});

test('MemOptimizer: Similarity works correctly', () => {
    // Load and test similarity function
    const optimizer = require(optimizerPath);
    const sim1 = optimizer.similarity('the quick brown fox', 'the quick brown fox');
    assert(sim1 === 1, `Same text should be 1.0, got ${sim1}`);

    const sim2 = optimizer.similarity('hello world', 'goodbye universe');
    assert(sim2 < 0.5, `Different text should be <0.5, got ${sim2}`);
});

test('MemOptimizer: Has optimization pipeline', () => {
    assert(optimizerContent.includes('async function optimize'), 'Should have optimize()');
});

test('MemOptimizer: Checks all memory sources', () => {
    assert(optimizerContent.includes('jarvis_mem0.db'), 'Should check Mem0 DB');
    assert(optimizerContent.includes('jarvis_rag.db'), 'Should check RAG DB');
    assert(optimizerContent.includes('MEMORY.md'), 'Should check MEMORY.md');
});

// ==================== RAG EVALUATOR ====================

const evalPath = path.join(ROOT, 'scripts/evolution/rag_evaluator.js');
const evalContent = fs.readFileSync(evalPath, 'utf8');

test('RAGEval: Module exists', () => {
    assert(fs.existsSync(evalPath), 'rag_evaluator.js should exist');
});

test('RAGEval: Has test queries', () => {
    assert(evalContent.includes('DEFAULT_QUERIES'), 'Should have default test queries');
});

test('RAGEval: Has 8+ test queries', () => {
    const queryCount = (evalContent.match(/query:/g) || []).length;
    assert(queryCount >= 8, `Should have 8+ queries, found ${queryCount}`);
});

test('RAGEval: Has relevance scoring', () => {
    assert(evalContent.includes('scoreRelevance'), 'Should score relevance');
});

test('RAGEval: Has freshness scoring', () => {
    assert(evalContent.includes('scoreFreshness'), 'Should score freshness');
});

test('RAGEval: Saves JSON reports', () => {
    assert(evalContent.includes('rag_eval'), 'Should save to rag_eval dir');
    assert(evalContent.includes('.json'), 'Should output JSON');
});

test('RAGEval: Uses unified_memory', () => {
    assert(evalContent.includes('unified_memory'), 'Should use unified memory API');
});

test('RAGEval: Has MEMORY.md fallback', () => {
    assert(evalContent.includes('MEMORY.md'), 'Should fallback to direct MEMORY.md search');
});

// ==================== INSTALL SCRIPT ====================

const installPath = path.join(ROOT, 'scripts/setup/install_extensions.sh');

test('Install: Script exists', () => {
    assert(fs.existsSync(installPath), 'install_extensions.sh should exist');
});

test('Install: Has ACE Framework', () => {
    const content = fs.readFileSync(installPath, 'utf8');
    assert(content.includes('ace-framework'), 'Should install ACE');
});

test('Install: Has Open-RAG-Eval', () => {
    const content = fs.readFileSync(installPath, 'utf8');
    assert(content.includes('open-rag-eval'), 'Should install open-rag-eval');
});

test('Install: Creates config dirs', () => {
    const content = fs.readFileSync(installPath, 'utf8');
    assert(content.includes('config/extensions'), 'Should create config dir');
    assert(content.includes('memory/skillbook'), 'Should create skillbook dir');
});

// ==================== INTEGRATION CHECK ====================

test('Integration: unified_memory.js exists', () => {
    assert(fs.existsSync(path.join(ROOT, 'scripts/evolution/unified_memory.js')), 'unified_memory should exist');
});

test('Integration: nano_pruner has extended patterns', () => {
    const pruner = fs.readFileSync(path.join(ROOT, 'scripts/evolution/nano_pruner.js'), 'utf8');
    const patternCount = (pruner.match(/pattern:/g) || []).length;
    assert(patternCount >= 20, `nano_pruner should have 20+ patterns, found ${patternCount}`);
});

// ==================== RESULTS ====================
console.log('\n' + '='.repeat(60));
console.log('🧪 MEMORY EXTENSIONS TEST RESULTS');
console.log('='.repeat(60));
results.forEach(t => console.log(`  ${t.status} ${t.name}`));
console.log('='.repeat(60));
console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);

if (failed > 0) {
    console.log('\n❌ FAILURES:');
    results.filter(t => t.error).forEach(t => console.log(`  - ${t.name}: ${t.error}`));
}

process.exit(failed > 0 ? 1 : 0);
