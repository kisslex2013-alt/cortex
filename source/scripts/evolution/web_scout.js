#!/usr/bin/env node
/**
 * scripts/evolution/web_scout.js — AGI Web Intelligence Scout v2.0
 * 
 * 🌐 Phase 5: Internet reconnaissance for self-improvement
 * 
 * The bot autonomously searches the web for ideas to improve itself:
 * 1. Searches Reddit, GitHub, Hacker News for relevant content
 * 2. Filters through relevance scoring
 * 3. Generates actionable proposals from findings
 * 4. Saves intel to research/web_intel/
 * 5. Produces Telegram summary for owner
 * 
 * Designed to work with OpenClaw's web_search/web_fetch tools,
 * but also works standalone via public RSS/JSON APIs.
 * 
 * Usage:
 *   node scripts/evolution/web_scout.js                # full scan + report
 *   node scripts/evolution/web_scout.js --telegram     # Telegram-ready summary
 *   node scripts/evolution/web_scout.js --json         # JSON output
 *   node scripts/evolution/web_scout.js --sources      # list all sources
 *   node scripts/evolution/web_scout.js --topic "X"    # search specific topic
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const INTEL_DIR = path.join(ROOT, 'research', 'web_intel');
const MEMORY_DIR = path.join(ROOT, 'memory');
const HISTORY_FILE = path.join(MEMORY_DIR, 'web_scout_history.json');

// ═══════════════════════════════════════════════
// SEARCH CONFIGURATION
// ═══════════════════════════════════════════════

const SOURCES = {
    reddit: {
        name: 'Reddit',
        subreddits: [
            // AI/ML (8)
            'MachineLearning', 'LocalLLaMA', 'OpenAI', 'ClaudeAI',
            'artificial', 'LLMDevs', 'PromptEngineering', 'AI_Agents',
            // Agents/AGI (3)
            'AutoGPT', 'singularity', 'LangChain',
            // Node.js/JS (3)
            'node', 'javascript', 'typescript',
            // Self-hosted/VPS (4)
            'selfhosted', 'homelab', 'devops', 'docker',
            // Crypto/TON/DeFi (3)
            'CryptoCurrency', 'defi', 'Toncoin',
            // Automation (3)
            'automation', 'netsec', 'sysadmin',
        ],
        baseUrl: 'https://www.reddit.com/r/{sub}/hot.json?limit=10',
    },
    github: {
        name: 'GitHub',
        queries: [
            'topic:ai-agent+stars:>100+pushed:>2025-12-01',
            'topic:mcp-server+stars:>50',
            'topic:autonomous-agent+language:typescript',
            '"self-improving"+agent+language:javascript+stars:>50',
            'topic:llm-agent+language:javascript',
            '"telegram+bot"+openai+language:javascript',
            'topic:agentic-workflow',
            '"TON"+OR+"tonconnect"+language:typescript+stars:>30',
            'topic:self-hosted+topic:ai+stars:>200',
            '"agent+memory"+OR+"agent+context"+language:javascript',
            'openclaw',
            'topic:mcp-client+language:javascript',
            '"RAG"+pipeline+language:typescript+stars:>50',
            'topic:ai-security+OR+topic:llmsecops',
        ],
        baseUrl: 'https://api.github.com/search/repositories?q={query}&sort=updated&per_page=5',
    },
    hackernews: {
        name: 'Hacker News',
        baseUrl: 'https://hn.algolia.com/api/v1/search_by_date?query={query}&tags=story&hitsPerPage=10',
        queries: [
            'autonomous AI agent',
            'self-modifying code',
            'LLM agent framework',
            'AI coding assistant',
            'Model Context Protocol',
            'agentic workflow',
            'self-hosted LLM',
            'TON blockchain',
        ],
    },
    lobsters: {
        name: 'Lobsters',
        baseUrl: 'https://lobste.rs/hottest.json',
    },
};

// Weighted keyword scoring (CRITICAL=10, HIGH=5, MEDIUM=2, LOW=1)
const KEYWORD_WEIGHTS = {
    CRITICAL: [
        // Core stack
        'openclaw', 'model context protocol', 'mcp server', 'mcp client',
        'autonomous agent', 'agentic workflow', 'self-refactoring', 'self-audit',
        'self-improving agent', 'tool calling', 'function calling', 'multi-agent',
        // LLM providers
        'gemini api', 'claude api', 'openai api', 'deepseek', 'groq', 'codestral',
        // TON
        'ton blockchain', 'toncoin', 'ton wallet', 'tonkeeper', 'ton connect',
        // Russian CRITICAL
        'автономный агент', 'саморефакторинг', 'самоаудит', 'протокол контекста модели',
    ],
    HIGH: [
        // Agent tooling
        'rag', 'vector database', 'embeddings', 'retrieval', 'memory store',
        'task decomposition', 'reflection', 'eval harness', 'observability',
        'langchain', 'langraph', 'crewai', 'autogpt', 'llamaindex',
        // DevOps
        'systemd', 'docker', 'kubernetes', 'ci/cd', 'gitops', 'linux hardening',
        // Crypto DeFi
        'defi', 'dex', 'smart contract', 'jetton', 'mev',
        // Practical
        'telegram bot', 'node.js agent', 'self-hosted',
        // Russian HIGH
        'нейросеть', 'языковая модель', 'телеграм бот', 'самообучение', 'оркестрация',
    ],
    MEDIUM: [
        // Tech
        'llm orchestration', 'prompt engineering', 'fine-tuning', 'quantization',
        'semantic search', 'knowledge graph', 'webhook', 'plugin', 'skill',
        'cve', 'vulnerability', 'rate limiting', 'circuit breaker',
        // Crypto
        'arbitrage', 'liquidity pool', 'stablecoin', 'tokenomics',
        // Russian MEDIUM
        'промпт инжиниринг', 'векторная бд', 'децентрализованные финансы', 'блокчейн',
    ],
    LOW: [
        // Broad
        'artificial intelligence', 'machine learning', 'neural network',
        'agi', 'alignment', 'hallucination', 'context window',
        'startup', 'code generation', 'open source',
        // Russian LOW
        'искусственный интеллект', 'машинное обучение',
    ],
};

// ═══════════════════════════════════════════════
// HTTP HELPER
// ═══════════════════════════════════════════════

function fetchJson(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const defaultHeaders = {
            'User-Agent': 'JarvisWebScout/1.0 (research bot)',
            'Accept': 'application/json',
            ...headers,
        };

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: defaultHeaders,
            timeout: 10000,
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(null); }
            });
        }).on('error', () => resolve(null))
            .on('timeout', function () { this.destroy(); resolve(null); });
    });
}

// ═══════════════════════════════════════════════
// SOURCE SCANNERS
// ═══════════════════════════════════════════════

async function scanReddit() {
    const results = [];

    for (const sub of SOURCES.reddit.subreddits) {
        const url = SOURCES.reddit.baseUrl.replace('{sub}', sub);
        const data = await fetchJson(url);

        if (!data || !data.data || !data.data.children) continue;

        for (const post of data.data.children) {
            const d = post.data;
            if (!d || d.over_18) continue;

            const relevance = scoreRelevance(d.title + ' ' + (d.selftext || ''));
            if (relevance < 2) continue; // minimum 2 keyword matches

            results.push({
                source: 'reddit',
                subreddit: sub,
                title: d.title,
                url: `https://reddit.com${d.permalink}`,
                score: d.score || 0,
                comments: d.num_comments || 0,
                created: new Date(d.created_utc * 1000).toISOString(),
                relevance,
                snippet: (d.selftext || '').slice(0, 200),
            });
        }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
}

async function scanGitHub() {
    const results = [];

    for (const query of SOURCES.github.queries) {
        const url = SOURCES.github.baseUrl.replace('{query}', query);
        const data = await fetchJson(url);

        if (!data || !data.items) continue;

        for (const repo of data.items) {
            const relevance = scoreRelevance(
                repo.full_name + ' ' + (repo.description || '') + ' ' + (repo.topics || []).join(' ')
            );
            if (relevance < 1) continue;

            results.push({
                source: 'github',
                name: repo.full_name,
                title: repo.full_name,
                url: repo.html_url,
                stars: repo.stargazers_count || 0,
                language: repo.language,
                description: repo.description || '',
                relevance,
                updated: repo.updated_at,
            });
        }
    }

    // Deduplicate by repo name
    const seen = new Set();
    return results.filter(r => {
        if (seen.has(r.name)) return false;
        seen.add(r.name);
        return true;
    }).sort((a, b) => b.relevance - a.relevance || b.stars - a.stars);
}

async function scanHackerNews() {
    const results = [];

    for (const query of SOURCES.hackernews.queries) {
        const url = SOURCES.hackernews.baseUrl.replace('{query}', encodeURIComponent(query));
        const data = await fetchJson(url);

        if (!data || !data.hits) continue;

        for (const hit of data.hits) {
            const relevance = scoreRelevance(hit.title + ' ' + (hit.story_text || ''));
            if (relevance < 1) continue;

            results.push({
                source: 'hackernews',
                title: hit.title,
                url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
                points: hit.points || 0,
                comments: hit.num_comments || 0,
                created: hit.created_at,
                relevance,
            });
        }
    }

    // Deduplicate
    const seen = new Set();
    return results.filter(r => {
        if (seen.has(r.title)) return false;
        seen.add(r.title);
        return true;
    }).sort((a, b) => b.relevance - a.relevance);
}

async function scanLobsters() {
    const results = [];
    const data = await fetchJson(SOURCES.lobsters.baseUrl);

    if (!data || !Array.isArray(data)) return results;

    for (const story of data.slice(0, 25)) {
        const relevance = scoreRelevance(
            story.title + ' ' + (story.description || '') + ' ' + (story.tags || []).join(' ')
        );
        if (relevance < 2) continue;

        results.push({
            source: 'lobsters',
            title: story.title,
            url: story.url || story.comments_url,
            score: story.score || 0,
            comments: story.comment_count || 0,
            created: story.created_at,
            relevance,
            tags: story.tags || [],
        });
    }

    return results.sort((a, b) => b.relevance - a.relevance);
}

// ═══════════════════════════════════════════════
// RELEVANCE SCORING
// ═══════════════════════════════════════════════

const WEIGHT_VALUES = { CRITICAL: 10, HIGH: 5, MEDIUM: 2, LOW: 1 };

function scoreRelevance(text) {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;

    for (const [level, keywords] of Object.entries(KEYWORD_WEIGHTS)) {
        const weight = WEIGHT_VALUES[level];
        for (const keyword of keywords) {
            if (lower.includes(keyword.toLowerCase())) score += weight;
        }
    }

    return score;
}

// ═══════════════════════════════════════════════
// PROPOSAL GENERATOR
// ═══════════════════════════════════════════════

function generateProposals(allFindings) {
    const proposals = [];

    // Top Reddit posts → learning opportunities
    const redditTop = allFindings.filter(f => f.source === 'reddit' && f.relevance >= 3);
    if (redditTop.length > 0) {
        proposals.push({
            type: 'LEARN',
            title: `${redditTop.length} relevant Reddit discussion(s) found`,
            action: 'Review for new ideas and patterns',
            items: redditTop.slice(0, 3).map(r => ({
                title: r.title,
                url: r.url,
                relevance: r.relevance,
                why: `r/${r.subreddit}, ${r.score} upvotes`,
            })),
        });
    }

    // GitHub repos → potential tools/libraries
    const githubTop = allFindings.filter(f => f.source === 'github' && f.stars > 50);
    if (githubTop.length > 0) {
        proposals.push({
            type: 'TOOL',
            title: `${githubTop.length} relevant GitHub repo(s) found`,
            action: 'Evaluate for integration or inspiration',
            items: githubTop.slice(0, 3).map(r => ({
                title: r.name,
                url: r.url,
                relevance: r.relevance,
                why: `★${r.stars} ${r.language || ''}`,
            })),
        });
    }

    // HN articles → industry trends
    const hnTop = allFindings.filter(f => f.source === 'hackernews' && f.relevance >= 2);
    if (hnTop.length > 0) {
        proposals.push({
            type: 'TREND',
            title: `${hnTop.length} relevant HN article(s)`,
            action: 'Stay updated on industry trends',
            items: hnTop.slice(0, 3).map(r => ({
                title: r.title,
                url: r.url,
                relevance: r.relevance,
                why: `${r.points} points`,
            })),
        });
    }

    return proposals;
}

// ═══════════════════════════════════════════════
// REPORT SAVING
// ═══════════════════════════════════════════════

function saveIntelReport(findings, proposals) {
    if (!fs.existsSync(INTEL_DIR)) {
        fs.mkdirSync(INTEL_DIR, { recursive: true });
    }

    const date = new Date().toISOString().split('T')[0];
    const report = {
        timestamp: new Date().toISOString(),
        totalFindings: findings.length,
        bySources: {
            reddit: findings.filter(f => f.source === 'reddit').length,
            github: findings.filter(f => f.source === 'github').length,
            hackernews: findings.filter(f => f.source === 'hackernews').length,
            lobsters: findings.filter(f => f.source === 'lobsters').length,
        },
        proposals,
        topFindings: findings.slice(0, 20),
    };

    fs.writeFileSync(
        path.join(INTEL_DIR, `${date}.json`),
        JSON.stringify(report, null, 2)
    );

    // Update history
    const history = loadJson(HISTORY_FILE, []);
    history.push({
        date,
        findings: findings.length,
        proposals: proposals.length,
        topRelevance: findings.length > 0 ? findings[0].relevance : 0,
    });
    saveJson(HISTORY_FILE, history.slice(-90));

    return report;
}

// ═══════════════════════════════════════════════
// OUTPUT FORMATTERS
// ═══════════════════════════════════════════════

function formatTelegram(proposals, totalFindings) {
    const lines = [];
    lines.push('🌐 **Web Scout Report**');
    lines.push(`Scanned: Reddit + GitHub + HN | Found: ${totalFindings} relevant items`);
    lines.push('');

    if (proposals.length === 0) {
        lines.push('Nothing noteworthy today. 🤷');
    } else {
        for (const p of proposals) {
            const emoji = p.type === 'LEARN' ? '📚' : p.type === 'TOOL' ? '🔧' : '📰';
            lines.push(`${emoji} **${p.title}**`);
            for (const item of p.items.slice(0, 2)) {
                lines.push(`  → ${item.title}`);
                lines.push(`    ${item.url}`);
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

function formatConsole(findings, proposals) {
    console.log('🌐 Jarvis Web Scout v2.0');
    console.log('═'.repeat(50));

    const reddit = findings.filter(f => f.source === 'reddit');
    const github = findings.filter(f => f.source === 'github');
    const hn = findings.filter(f => f.source === 'hackernews');
    const lob = findings.filter(f => f.source === 'lobsters');

    console.log(`📊 Results: ${findings.length} total`);
    console.log(`   Reddit: ${reddit.length} | GitHub: ${github.length} | HN: ${hn.length} | Lobsters: ${lob.length}`);
    console.log('═'.repeat(50));

    if (proposals.length > 0) {
        console.log('\n💡 PROPOSALS:');
        for (const p of proposals) {
            const emoji = p.type === 'LEARN' ? '📚' : p.type === 'TOOL' ? '🔧' : '📰';
            console.log(`\n${emoji} ${p.title}`);
            console.log(`   Action: ${p.action}`);
            for (const item of p.items) {
                console.log(`   • ${item.title} (relevance: ${item.relevance}, ${item.why})`);
                console.log(`     ${item.url}`);
            }
        }
    } else {
        console.log('\n😴 No noteworthy findings today.');
    }

    // Top findings
    if (findings.length > 0) {
        console.log('\n🏆 TOP FINDINGS (by relevance):');
        findings.slice(0, 10).forEach((f, i) => {
            console.log(`   ${i + 1}. [${f.source}] ${f.title} (🎯${f.relevance})`);
            if (f.url) console.log(`      ${f.url}`);
        });
    }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function loadJson(filePath, defaultValue) {
    if (fs.existsSync(filePath)) {
        try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
        catch { return defaultValue; }
    }
    return defaultValue;
}

function saveJson(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
    const args = process.argv.slice(2);
    const telegramMode = args.includes('--telegram');
    const jsonMode = args.includes('--json');
    const sourcesMode = args.includes('--sources');

    // --sources: list all scanning sources
    if (sourcesMode) {
        console.log('📡 Web Scout v2.0 Sources:');
        console.log(`\nReddit (${SOURCES.reddit.subreddits.length} subreddits):`);
        SOURCES.reddit.subreddits.forEach(s => console.log(`   r/${s}`));
        console.log(`\nGitHub (${SOURCES.github.queries.length} queries):`);
        SOURCES.github.queries.forEach(q => console.log(`   "${q}"`));
        console.log(`\nHacker News (${SOURCES.hackernews.queries.length} queries):`);
        SOURCES.hackernews.queries.forEach(q => console.log(`   "${q}"`));
        console.log(`\nLobsters: hottest.json`);
        const totalKw = Object.values(KEYWORD_WEIGHTS).reduce((s, a) => s + a.length, 0);
        console.log(`\nKeywords (${totalKw}):`);
        for (const [level, keywords] of Object.entries(KEYWORD_WEIGHTS)) {
            console.log(`   ${level} (×${WEIGHT_VALUES[level]}): ${keywords.length} terms`);
        }
        return;
    }

    // Custom topic
    const topicIdx = args.indexOf('--topic');
    if (topicIdx !== -1 && args[topicIdx + 1]) {
        const topic = args.slice(topicIdx + 1).join(' ');
        RELEVANCE_KEYWORDS.push(topic.toLowerCase());
        SOURCES.hackernews.queries.push(topic);
        SOURCES.github.queries.push(topic.replace(/\s+/g, '+'));
    }

    if (!telegramMode && !jsonMode) {
        console.log('🌐 Jarvis Web Scout v2.0 — Scanning...');
        console.log('═'.repeat(50));
    }

    // Scan all sources
    const allFindings = [];

    if (!telegramMode && !jsonMode) console.log('📡 Scanning Reddit...');
    const reddit = await scanReddit();
    allFindings.push(...reddit);
    if (!telegramMode && !jsonMode) console.log(`   Found ${reddit.length} relevant posts`);

    if (!telegramMode && !jsonMode) console.log('📡 Scanning GitHub...');
    const github = await scanGitHub();
    allFindings.push(...github);
    if (!telegramMode && !jsonMode) console.log(`   Found ${github.length} relevant repos`);

    if (!telegramMode && !jsonMode) console.log('📡 Scanning Hacker News...');
    const hn = await scanHackerNews();
    allFindings.push(...hn);
    if (!telegramMode && !jsonMode) console.log(`   Found ${hn.length} relevant articles`);

    if (!telegramMode && !jsonMode) console.log('📡 Scanning Lobsters...');
    const lob = await scanLobsters();
    allFindings.push(...lob);
    if (!telegramMode && !jsonMode) console.log(`   Found ${lob.length} relevant posts\n`);

    // Sort by relevance
    allFindings.sort((a, b) => b.relevance - a.relevance);

    // Generate proposals
    const proposals = generateProposals(allFindings);

    // Save report
    const report = saveIntelReport(allFindings, proposals);

    // Output
    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
    } else if (telegramMode) {
        console.log(formatTelegram(proposals, allFindings.length));
    } else {
        formatConsole(allFindings, proposals);
        const date = new Date().toISOString().split('T')[0];
        console.log(`\n📄 Report saved to: research/web_intel/${date}.json`);
    }
}

module.exports = { main, scanReddit, scanGitHub, scanHackerNews, scanLobsters, scoreRelevance };

if (require.main === module) {
    main().catch(e => console.error('❌ Scout error:', e.message));
}
