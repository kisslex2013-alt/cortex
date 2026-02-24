#!/usr/bin/env node
/**
 * scripts/scout/github_watcher.js
 * 🦾 Jarvis Scout: GitHub Watcher
 * Monitors OpenClaw core and finance libraries for updates.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REPOS = ['openclaw/openclaw', 'BankrBot/openclaw-skills'];
const CACHE_FILE = path.join(process.cwd(), 'memory/github_scout_cache.json');

async function scout() {
    console.log("🕵️‍♂️ Scout: Checking GitHub for updates...");
    let cache = {};
    if (fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE));

    const updates = [];
    for (const repo of REPOS) {
        try {
            const res = await axios.get(`https://api.github.com/repos/${repo}/releases/latest`, {
                headers: { 'User-Agent': 'Jarvis-Nexus-Scout' }
            });
            const latest = res.data.tag_name;
            if (cache[repo] !== latest) {
                updates.push({ repo, version: latest, name: res.data.name });
                cache[repo] = latest;
            }
        } catch (e) {
            console.error(`❌ Error scouting ${repo}:`, e.message);
        }
    }

    if (updates.length > 0) {
        console.log("📢 *GitHub Intelligence Update*");
        updates.forEach(u => console.log(`  └ 🚀 ${u.repo} released ${u.version}: ${u.name}`));
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } else {
        console.log("✅ Everything up to date.");
    }
}

scout();
