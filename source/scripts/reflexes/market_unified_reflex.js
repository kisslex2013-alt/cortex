#!/usr/bin/env node
// scripts/reflexes/market_unified_reflex.js
// TON Price Alert + DEX Spread Monitor
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || '/root/.openclaw/workspace';
const HISTORY_FILE = path.join(ROOT, 'memory/market_history.json');

async function fetchData() {
    const prices = {};
    try {
        const [tonapi, stonfi, dedust] = await Promise.allSettled([
            axios.get('https://tonapi.io/v2/rates?tokens=ton&currencies=usd', { timeout: 5000 }),
            axios.get('https://api.ston.fi/v1/assets', { timeout: 5000 }),
            axios.get('https://api.dedust.io/v2/pools', { timeout: 5000 })
        ]);

        if (tonapi.status === 'fulfilled') prices.tonapi = tonapi.value.data.rates.TON.prices.USD;
        
        if (stonfi.status === 'fulfilled') {
            const asset = stonfi.value.data.asset_list?.find(a => a.symbol === 'TON');
            if (asset) prices.stonfi = parseFloat(asset.dex_usd_price);
        }

        if (dedust.status === 'fulfilled') {
            const pool = dedust.value.data?.find(p => 
                p.assets?.some(a => a.type === 'native') && 
                p.assets?.some(a => a.metadata?.symbol === 'USDT')
            );
            if (pool) {
                const native = pool.assets.find(a => a.type === 'native');
                const jetton = pool.assets.find(a => a.type === 'jetton');
                prices.dedust = (parseFloat(pool.reserves[pool.assets.indexOf(jetton)]) / 1e6) / 
                                (parseFloat(pool.reserves[pool.assets.indexOf(native)]) / 1e9);
            }
        }
    } catch (e) {}
    return prices;
}

async function run() {
    const prices = await fetchData();
    if (Object.keys(prices).length < 2) return;

    const avgPrice = Object.values(prices).reduce((a, b) => a + b, 0) / Object.keys(prices).length;
    
    // Spread Check
    if (prices.stonfi && prices.dedust) {
        const spread = (Math.abs(prices.stonfi - prices.dedust) / Math.min(prices.stonfi, prices.dedust)) * 100;
        if (spread > 1.5) {
            console.log(`🚀 *DEX ARB ALERT:* Spread ${spread.toFixed(2)}% | STON $${prices.stonfi.toFixed(3)} vs DeDust $${prices.dedust.toFixed(3)}`);
        }
    }

    // Volatility Check
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE));
    
    const prev = history.length > 0 ? history[history.length - 1] : null;
    if (prev) {
        const change = ((avgPrice - prev.price) / prev.price) * 100;
        if (Math.abs(change) > 3) {
            console.log(`⚠️ *VOLATILITY ALERT:* TON moved ${change.toFixed(2)}% to $${avgPrice.toFixed(3)}`);
        }
    }

    history.push({ ts: Date.now(), price: avgPrice });
    if (history.length > 100) history.shift();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

run();
