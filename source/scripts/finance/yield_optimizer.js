#!/usr/bin/env node
// scripts/finance/yield_optimizer.js
// 🦾 Phase 8: Yield Generation & Rebalancing
// Monitors tsTON, cbBTC, and wETH yields on STON.fi and DeDust.

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const WALLET = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";

async function fetchYields() {
    console.log("🦾 Fetching real-time yields from TON DEXes...");
    try {
        // Query STON.fi for pools
        const res = await axios.get('https://api.ston.fi/v1/pools', { timeout: 10000 });
        const pools = res.data.pool_list || [];
        
        const USDT = "EQCQL1DlFsRHCSHO7rJSTEcZOIyD8FT20hsKIdLF2AqSGusd";
        const TON = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
        const cbBTC = "EQDhyPzbIjJT_WnY3gGprjSYUK9fiGMjWMezxO8MZiUdfb_B";
        
        const targets = [
            { name: 'TON/USDT', addr: [TON, USDT] },
            { name: 'cbBTC/TON', addr: [cbBTC, TON] }
        ];
        
        const found = pools.filter(p => 
            targets.some(t => (t.addr[0] === p.token0_address && t.addr[1] === p.token1_address) || 
                              (t.addr[1] === p.token0_address && t.addr[0] === p.token1_address))
        );
        
        return found.map(p => {
            const t = targets.find(t => (t.addr[0] === p.token0_address && t.addr[1] === p.token1_address) || 
                                        (t.addr[1] === p.token0_address && t.addr[0] === p.token1_address));
            return {
                pair: t.name,
                apy: parseFloat(p.apy_7d || 0),
                liquidity: parseFloat(p.reserve0_usd || 0) + parseFloat(p.reserve1_usd || 0)
            };
        });
    } catch (e) {
        console.error("❌ Yield fetch failed:", e.message);
        return [];
    }
}

async function run() {
    const yields = await fetchYields();
    if (yields.length === 0) return;

    console.log(`📈 Current Yield Opportunities:`);
    yields.forEach(y => {
        console.log(`  └ ${y.pair}: ${y.apy.toFixed(2)}% APY ($${parseFloat(y.liquidity).toLocaleString()} Liq)`);
    });

    const historyFile = path.join(process.cwd(), 'memory/yield_history.jsonl');
    const entry = {
        ts: Date.now(),
        yields
    };
    
    fs.appendFileSync(historyFile, JSON.stringify(entry) + '\n');
    console.log(`✅ Yield data logged for Phase 8 optimization.`);
}

run();
