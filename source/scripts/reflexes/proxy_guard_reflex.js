#!/usr/bin/env node
// scripts/reflexes/proxy_guard_reflex.js
// 🦾 Jarvis Reflex: Proxy Guard
// Checks health of the 10 proxies. Alerts if redundant channels fail.

const axios = require('axios');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PROXY_FILE = process.env.PROXY_FILE || 'config/proxies.txt';

async function checkProxies() {
    if (!fs.existsSync(PROXY_FILE)) {
        console.error(`[ProxyGuard] ❌ Error: Proxy file not found at ${PROXY_FILE}`);
        return;
    }
    
    const raw = fs.readFileSync(PROXY_FILE, 'utf8').split('\n')
        .filter(l => l.trim() && !l.startsWith('#')); // Skip empty and comments
    const results = [];

    for (const line of raw) {
        const [ip, port, user, pass] = line.split(':');
        const proxyUrl = `http://${user}:${pass}@${ip}:${port}`;
        const agent = new HttpsProxyAgent(proxyUrl);

        try {
            await axios.get('https://api.ipify.org?format=json', { 
                httpsAgent: agent, 
                timeout: 5000 
            });
            results.push({ ip, ok: true });
        } catch (err) {
            results.push({ ip, ok: false, error: err.message });
        }
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
        console.log(`⚠️ *PROXY ALERT:* ${failed.length}/${results.length} proxies offline.`);
        failed.forEach(f => console.log(`  └ ❌ ${f.ip}: ${f.error}`));
    } else {
        // Silent if all OK for cron
    }
}

checkProxies();
