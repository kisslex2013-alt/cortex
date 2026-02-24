#!/usr/bin/env node
// scripts/maintenance/brain_report.js
const fs = require('fs');
const path = require('path');

const STATS_PATH = '/root/.openclaw/workspace/memory/token_stats.json';

function getStats() {
    if (!fs.existsSync(STATS_PATH)) {
        return { today: 0, total: 0, date: new Date().toISOString().split('T')[0], status: 'INITIALIZING' };
    }
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
}

const stats = getStats();
const costPer1M = 0.15; // Estimated avg cost for Flash
const estimatedCost = (stats.today / 1000000 * costPer1M).toFixed(4);

console.log(`🧠 **Brain Usage Report**`);
console.log(`📅 Date: ${stats.date}`);
console.log(`────────────────────────`);
console.log(`🔹 Tokens Today: ${stats.today.toLocaleString()}`);
console.log(`🔹 Total Tokens: ${stats.total.toLocaleString()}`);
console.log(`🔹 Est. Cost (Today): $${estimatedCost}`);
console.log(`────────────────────────`);
console.log(`Status: ${stats.status || 'ACTIVE'}`);
