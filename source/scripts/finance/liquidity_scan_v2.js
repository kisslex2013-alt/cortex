#!/usr/bin/env node
// scripts/finance/liquidity_scan_v2.js
// 🦾 Proactive Scan: BTC/ETH/SOL liquidity on TON DEXes
const axios = require('axios');
const fs = require('fs');

async function scan() {
    console.log("🦾 Starting Proactive Liquidity Scan (cbBTC/wETH)...");
    try {
        // Query STON.fi API for new pairs
        const res = await axios.get('https://api.ston.fi/v1/assets', { timeout: 10000 });
        const assets = res.data.asset_list || [];
        
        const targets = ['cbBTC', 'wETH', 'SOL'];
        const found = assets.filter(a => targets.includes(a.symbol));
        
        console.log(`🎯 Found ${found.length} target assets on STON.fi.`);
        
        const report = {
            ts: Date.now(),
            assets: found.map(a => ({
                symbol: a.symbol,
                price: a.dex_usd_price,
                liquidity: a.liquidity_usd
            }))
        };
        
        fs.writeFileSync('memory/proactive_market_report.json', JSON.stringify(report, null, 2));
        console.log("✅ Market report generated in memory/proactive_market_report.json");
    } catch (e) {
        console.error("❌ Scan failed:", e.message);
    }
}

scan();
