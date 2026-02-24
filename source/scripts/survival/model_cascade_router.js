#!/usr/bin/env node
// scripts/survival/model_cascade_router.js
// 🦾 Model Cascade Router v2.3 (Multi-Provider Upgrade)
// Providers: Google (9 channels), Groq, GitHub Models, Sambanova, OpenRouter, DeepSeek
// Features: Layered Fallback, PRO-First, Rate-Limit Awareness, Token Counter, Regional Bypass

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const redis = new Redis();
const { HttpsProxyAgent } = require('https-proxy-agent');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const TOKEN_STATS_PATH = path.join(ROOT, 'memory/token_stats.json');
const PROXIES_PATH = path.join(ROOT, 'proxies.txt');

// Critical keywords for PRO-model routing
const CRITICAL_KEYWORDS = [
    'security', 'financial', 'deploy', 'vault', 'seed', 'password',
    'transaction', 'transfer', 'stake', 'withdraw', 'private key',
    'mnemonic', 'wallet', 'production', 'mainnet', 'audit',
    'безопасность', 'транзакция', 'кошелёк', 'пароль', 'деплой',
];

// Code-related keywords for Codestral routing
const CODE_KEYWORDS = [
    'function', 'class ', 'const ', 'import ', 'require(',
    'npm ', 'node ', 'скрипт', 'код', 'баг', 'ошибк', 'fix', 'debug',
    'async ', 'await ', 'return ', '.js', '.py', '.ts', 'refactor',
    'lint', 'test', 'compile', 'build', 'syntax', 'error',
];

const PRO_MODEL = 'gemini-3-pro-preview';
const FLASH_MODEL = 'gemini-3-flash-preview';

const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_RETRY_DELAY = 2000;

class ModelCascadeRouter {
    constructor() {
        this.profilesPath = '/root/.openclaw/agents/main/agent/auth-profiles.json';
        this.accounts = [];
        this.proxies = [];
        this.currentIndex = 0;
        this.proxyIndex = 0;
        this._loadAccounts();
        this._loadProxies();
        this._loadTokenStats();
    }

    _loadTokenStats() {
        const today = new Date().toISOString().split('T')[0];
        try {
            if (fs.existsSync(TOKEN_STATS_PATH)) {
                this.tokenStats = JSON.parse(fs.readFileSync(TOKEN_STATS_PATH, 'utf8'));
                if (this.tokenStats.date !== today) {
                    this.tokenStats = { today: 0, total: this.tokenStats.total || 0, date: today };
                }
            } else {
                this.tokenStats = { today: 0, total: 0, date: today };
            }
        } catch {
            this.tokenStats = { today: 0, total: 0, date: today };
        }
    }

    _loadProxies() {
        try {
            if (fs.existsSync(PROXIES_PATH)) {
                const lines = fs.readFileSync(PROXIES_PATH, 'utf8').split('\n').filter(l => l.trim());
                this.proxies = lines.map(line => {
                    const parts = line.split(':');
                    if (parts.length === 4) {
                        return `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
                    }
                    return `http://${parts[0]}:${parts[1]}`;
                });
                console.log(`[Router v2.3] Loaded ${this.proxies.length} proxies.`);
            }
        } catch (e) {
            console.error(`[Router v2.3] Proxy load failed: ${e.message}`);
        }
    }

    _getProxyAgent() {
        if (this.proxies.length === 0) return null;
        return new HttpsProxyAgent(this.proxies[this.proxyIndex]);
    }

    _rotateProxy() {
        if (this.proxies.length > 0) {
            this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
        }
    }

    _trackTokens(text) {
        const approxTokens = Math.ceil((text || '').length / 4);
        this.tokenStats.today += approxTokens;
        this.tokenStats.total += approxTokens;
        try {
            fs.writeFileSync(TOKEN_STATS_PATH, JSON.stringify(this.tokenStats, null, 2));
        } catch { }
        return approxTokens;
    }

    _loadAccounts() {
        try {
            if (fs.existsSync(this.profilesPath)) {
                const data = JSON.parse(fs.readFileSync(this.profilesPath, 'utf8'));
                const profiles = data.profiles || {};
                for (const [id, profile] of Object.entries(profiles)) {
                    if (profile.provider === 'google' && profile.key) {
                        this.accounts.push({ id, type: 'api_key', key: profile.key });
                    } else if (profile.type === 'oauth' && profile.access) {
                        this.accounts.push({ id, type: 'oauth', token: profile.access });
                    }
                }
                console.log(`[Router v2.3] Loaded ${this.accounts.length} Google channels.`);
            }
        } catch (e) {
            console.error(`[Router v2.3] Google account load failed: ${e.message}`);
        }
    }

    _isCriticalPrompt(prompt) {
        const lower = prompt.toLowerCase();
        return CRITICAL_KEYWORDS.some(k => lower.includes(k));
    }

    _isCodePrompt(prompt) {
        const lower = prompt.toLowerCase();
        return CODE_KEYWORDS.filter(k => lower.includes(k)).length >= 2;
    }

    async think(prompt, options = {}) {
        const isCritical = this._isCriticalPrompt(prompt);
        const isUserFacing = options.source === 'telegram_user';
        let model = options.model || (isCritical || isUserFacing ? PRO_MODEL : FLASH_MODEL);

        // --- LAYER 0: GROQ (Fast inference for non-critical, non-user-facing small prompts) ---
        if (!isCritical && !isUserFacing && prompt.length < 1000 && process.env.GROQ_API_KEY) {
            const groqResult = await this._groqAttempt(prompt);
            if (groqResult) return groqResult;
        }

        // --- LAYER 1: GOOGLE (Main Intelligence) ---
        const googleResult = await this._googleAttempt(prompt, model);
        if (googleResult) return googleResult;

        // --- LAYER 2: GITHUB MODELS (Smart Fallback - GPT-4o) ---
        if (process.env.GITHUB_TOKEN) {
            const ghResult = await this._githubAttempt(prompt);
            if (ghResult) return ghResult;
        }

        // --- LAYER 3: SAMBANOVA (Big Fallback - Llama 405B) ---
        if (process.env.SAMBANOVA_API_KEY) {
            const sambaResult = await this._sambanovaAttempt(prompt);
            if (sambaResult) return sambaResult;
        }

        // --- LAYER 3.5: SILICONFLOW (High-speed Llama Fallback) ---
        if (process.env.SILICONFLOW_API_KEY) {
            const sfResult = await this._siliconFlowAttempt(prompt);
            if (sfResult) return sfResult;
        }

        // --- LAYER 3.6: CODESTRAL (Code-specific fallback, unlimited RPD) ---
        if (this._isCodePrompt(prompt) && process.env.CODESTRAL_API_KEY) {
            const codeResult = await this._codestralAttempt(prompt);
            if (codeResult) return codeResult;
        }

        // --- LAYER 4: SAFETY NET (OpenRouter & DeepSeek) ---
        const orResult = await this._openRouterFallback(prompt, model);
        if (!orResult.error) return orResult;

        return this._deepseekFallback(prompt);
    }

    async _googleAttempt(prompt, model) {
        let attempts = 0;
        const maxChannels = this.accounts.length;

        while (attempts < maxChannels) {
            const acc = this.accounts[this.currentIndex];
            const cooldownKey = `jarvis:cooldown:${acc.id}`;
            if (await redis.get(cooldownKey)) {
                this._rotate();
                attempts++;
                continue;
            }

            try {
                const headers = acc.type === 'oauth' ? { 'Authorization': `Bearer ${acc.token}` } : {};
                const url = acc.type === 'oauth'
                    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
                    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${acc.key}`;

                for (let retry = 0; retry <= MAX_TRANSIENT_RETRIES; retry++) {
                    try {
                        const res = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] },
                            { headers, timeout: 30000, httpsAgent: this._getProxyAgent() });
                        const text = res.data.candidates[0].content.parts[0].text;
                        this._trackTokens(text);
                        return { text, channel: `google:${acc.id}`, model, tokens: this.tokenStats };
                    } catch (err) {
                        const status = err.response?.status;
                        if ([500, 503, 407, 403, 400].includes(status)) {
                            if (status === 407) this._rotateProxy();
                            if (retry < MAX_TRANSIENT_RETRIES) {
                                await new Promise(r => setTimeout(r, TRANSIENT_RETRY_DELAY));
                                continue;
                            }
                        }
                        throw err;
                    }
                }
            } catch (error) {
                const status = error.response?.status;
                if ([429, 403, 400].includes(status)) {
                    await redis.set(cooldownKey, '1', 'EX', status === 403 ? 3600 : 300);
                    this._rotate();
                    attempts++;
                } else {
                    this._rotateProxy();
                    throw error;
                }
            }
        }
        return null;
    }

    async _groqAttempt(prompt) {
        try {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 10000
            });
            const text = res.data.choices[0].message.content;
            this._trackTokens(text);
            return { text, channel: 'groq', model: 'llama-3.3-70b' };
        } catch { return null; }
    }

    async _githubAttempt(prompt) {
        try {
            const res = await axios.post('https://models.inference.ai.azure.com/chat/completions', {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });
            const text = res.data.choices[0].message.content;
            this._trackTokens(text);
            return { text, channel: 'github_models', model: 'gpt-4o' };
        } catch { return null; }
    }

    async _sambanovaAttempt(prompt) {
        try {
            const res = await axios.post('https://api.sambanova.ai/v1/chat/completions', {
                model: 'Meta-Llama-3.1-405B-Instruct',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${process.env.SAMBANOVA_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 45000
            });
            const text = res.data.choices[0].message.content;
            this._trackTokens(text);
            return { text, channel: 'sambanova', model: 'llama-3.1-405b' };
        } catch { return null; }
    }

    async _siliconFlowAttempt(prompt) {
        try {
            const res = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
                model: 'deepseek-ai/DeepSeek-V3', // Default high-tier model on SF
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });
            const text = res.data.choices[0].message.content;
            this._trackTokens(text);
            return { text, channel: 'siliconflow', model: 'deepseek-v3' };
        } catch { return null; }
    }

    async _codestralAttempt(prompt) {
        try {
            const res = await axios.post('https://codestral.mistral.ai/v1/chat/completions', {
                model: 'codestral-latest',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${process.env.CODESTRAL_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });
            const text = res.data.choices[0].message.content;
            this._trackTokens(text);
            return { text, channel: 'codestral', model: 'codestral' };
        } catch { return null; }
    }

    async _openRouterFallback(prompt, model) {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) return { error: "LOCKED" };
        try {
            const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'google/gemini-2.0-flash-001',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });
            return { text: res.data.choices[0].message.content, channel: 'openrouter', model: 'gemini-2.0-flash' };
        } catch { return { error: "LOCKED" }; }
    }

    async _deepseekFallback(prompt) {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) return { error: "EXHAUSTED" };
        try {
            const res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });
            const text = res.data.choices[0].message.content;
            this._trackTokens(text);
            return { text, channel: 'deepseek', model: 'deepseek-chat' };
        } catch { return { error: "EXHAUSTED" }; }
    }

    _rotate() { this.currentIndex = (this.currentIndex + 1) % this.accounts.length; }
    getTokenStats() { return this.tokenStats; }
}

module.exports = new ModelCascadeRouter();
