#!/usr/bin/env node
/**
 * 📊 RAG Evaluator v1.0 — Quality Benchmarking for Jarvis Memory
 * 
 * Inspired by Open-RAG-Eval (Vectara). Runs test queries against
 * our RAG/Mem0 systems and scores the results.
 * 
 * Metrics:
 * - Relevance: Does the retrieved context match the query?
 * - Coverage: How much of the expected info is found?
 * - Freshness: How recent are the retrieved facts?
 * 
 * Usage:
 *   node scripts/evolution/rag_evaluator.js
 *   // Results saved to memory/rag_eval/
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const EVAL_DIR = path.join(ROOT, 'memory/rag_eval');
const CONFIG_PATH = path.join(ROOT, 'config/extensions/rag_eval_config.json');

// Default test queries with expected keywords
const DEFAULT_QUERIES = [
    {
        query: 'TON staking pool address',
        expectedKeywords: ['Tonstakers', 'Whales', 'EQCkR1cGmnsE45N4K0otPl5EnxnRakmGqeJUNua5fkWhales'],
        category: 'financial'
    },
    {
        query: 'wallet balance check',
        expectedKeywords: ['balance', 'wallet', 'TON', 'gas'],
        category: 'financial'
    },
    {
        query: 'sandbox security rules',
        expectedKeywords: ['sandbox_guard', 'checkPath', 'ALLOWED_ZONES', 'blocked'],
        category: 'security'
    },
    {
        query: 'model cascade router fallback',
        expectedKeywords: ['OpenRouter', 'DeepSeek', 'fallback', 'retry', '500', '503'],
        category: 'operations'
    },
    {
        query: 'memory architecture',
        expectedKeywords: ['Mem0', 'RAG', 'unified_memory', 'FTS5', 'SQLite'],
        category: 'memory'
    },
    {
        query: 'Alexey last chance warning',
        expectedKeywords: ['last chance', 'Feb 17', 'amnesia', 'memory'],
        category: 'identity'
    },
    {
        query: 'RabbitMQ',
        expectedKeywords: ['purged', 'Phase 11', 'legacy', 'NOT recreate'],
        category: 'architecture'
    },
    {
        query: 'risk engine thresholds',
        expectedKeywords: ['CoinGecko', 'USD', '$50', '$200', 'gas', 'score'],
        category: 'financial'
    }
];

/**
 * Score relevance of retrieved results against expected keywords
 */
function scoreRelevance(results, expectedKeywords) {
    if (!results || results.length === 0) return 0;

    const allText = results.map(r => r.content || r.text || '').join(' ').toLowerCase();
    let found = 0;

    for (const kw of expectedKeywords) {
        if (allText.includes(kw.toLowerCase())) {
            found++;
        }
    }

    return expectedKeywords.length > 0 ? (found / expectedKeywords.length) : 0;
}

/**
 * Score freshness of results
 */
function scoreFreshness(results) {
    if (!results || results.length === 0) return 0;

    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    let score = 0;
    for (const r of results) {
        if (r.timestamp) {
            const age = now - new Date(r.timestamp).getTime();
            if (age < oneWeek) score += 1;
            else if (age < oneWeek * 4) score += 0.5;
            else score += 0.25;
        } else {
            score += 0.5; // Unknown age → medium score
        }
    }

    return results.length > 0 ? (score / results.length) : 0;
}

/**
 * Run evaluation against memory systems
 */
async function evaluate() {
    console.log('📊 RAG Evaluator v1.0');
    console.log('='.repeat(60));

    // Ensure output dir
    if (!fs.existsSync(EVAL_DIR)) {
        fs.mkdirSync(EVAL_DIR, { recursive: true });
    }

    // Try to load unified_memory
    let memory;
    try {
        memory = require('./unified_memory');
        await memory.init();
    } catch (e) {
        console.error(`❌ Cannot load unified_memory: ${e.message}`);
        console.log('   Falling back to MEMORY.md text search...');
        memory = null;
    }

    const queries = DEFAULT_QUERIES;
    const results = [];

    for (const testCase of queries) {
        let queryResults = [];

        if (memory) {
            try {
                queryResults = await memory.query(testCase.query, 5);
            } catch { }
        }

        // Fallback: search MEMORY.md directly
        if (queryResults.length === 0 && fs.existsSync(path.join(ROOT, 'MEMORY.md'))) {
            const memContent = fs.readFileSync(path.join(ROOT, 'MEMORY.md'), 'utf8');
            const lines = memContent.split('\n').filter(l => l.startsWith('- '));
            const queryWords = testCase.query.toLowerCase().split(/\s+/);

            queryResults = lines
                .map(line => ({
                    content: line,
                    score: queryWords.filter(w => line.toLowerCase().includes(w)).length / queryWords.length
                }))
                .filter(r => r.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
        }

        const relevance = scoreRelevance(queryResults, testCase.expectedKeywords);
        const freshness = scoreFreshness(queryResults);
        const coverage = queryResults.length > 0 ? Math.min(1, queryResults.length / 3) : 0;

        const score = (relevance * 0.5 + coverage * 0.3 + freshness * 0.2);

        const result = {
            query: testCase.query,
            category: testCase.category,
            resultsCount: queryResults.length,
            relevance: parseFloat((relevance * 100).toFixed(1)),
            coverage: parseFloat((coverage * 100).toFixed(1)),
            freshness: parseFloat((freshness * 100).toFixed(1)),
            overall: parseFloat((score * 100).toFixed(1))
        };

        results.push(result);

        const icon = score >= 0.7 ? '✅' : score >= 0.4 ? '⚠️' : '❌';
        console.log(`  ${icon} [${testCase.category}] "${testCase.query}" → ${result.overall}% (rel:${result.relevance}%, cov:${result.coverage}%)`);
    }

    // Summary
    const avgScore = results.reduce((sum, r) => sum + r.overall, 0) / results.length;

    console.log('');
    console.log('='.repeat(60));
    console.log(`📊 Overall RAG Quality: ${avgScore.toFixed(1)}%`);
    console.log(`   Queries tested: ${results.length}`);
    console.log(`   Passing (>70%): ${results.filter(r => r.overall >= 70).length}`);
    console.log(`   Needs work (<40%): ${results.filter(r => r.overall < 40).length}`);

    // Save report
    const report = {
        timestamp: new Date().toISOString(),
        version: '6.2.1',
        avgScore: parseFloat(avgScore.toFixed(1)),
        queriesCount: results.length,
        results
    };

    const reportPath = path.join(EVAL_DIR, `eval_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Report saved: ${reportPath}`);

    return report;
}

// Run if called directly
if (require.main === module) {
    evaluate().catch(e => {
        console.error(`❌ Evaluator error: ${e.message}`);
        process.exit(1);
    });
}

module.exports = { evaluate, scoreRelevance, scoreFreshness, DEFAULT_QUERIES };
