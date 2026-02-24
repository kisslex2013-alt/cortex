const { TonClient4 } = require("@ton/ton");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Интеграция с Paper Trading
const paperTradingPath = path.join(__dirname, '../src/dispatcher/paper_trading.js');
let PaperTrading;
try {
    const ptModule = require(paperTradingPath);
    // Based on src/dispatcher/paper_trading.js exporting 'trader' which is an instance
    PaperTrading = ptModule;
} catch (e) {
    console.error("PaperTrading module not found, continuing in standalone mode.");
}

async function executeRealArb() {
    console.log("--- Real Arbitrage Engine v1.1 (Paper Integrated) ---");
    
// Real-time Scan via Multi-Source Oracle
    const scanner = require('../src/dispatcher/volatility_scanner');
    const priceA = await scanner.fetchTonApiPrice();
    const priceB = await scanner.fetchStonFiPrice();

    if (!priceA || !priceB) {
        console.error("Market data unavailable for scan.");
        process.exit(1);
    }

    const realSpread = (Math.abs(priceA - priceB) / priceA * 100).toFixed(2);
    const isProfitable = parseFloat(realSpread) > 0.5;
    
    if (isProfitable && PaperTrading) {
        process.stdout.write(`[PAPER] Executing virtual trade for ${realSpread}% real spread...\n`);
        const pt = PaperTrading;
        const price = Math.min(priceA, priceB);
        try {
            await pt.executeTrade('BUY', 10, price); 
            await pt.executeTrade('SELL', 10, price * (1 + (realSpread/100)));
            process.stdout.write(`MASTER_NOTIFICATION: Real Arbitrage opportunity found! Spread: ${realSpread}%. Trade executed in Paper mode.\n`);
        } catch (e) {
            process.stdout.write(`TRADE_ERROR: ${e.message}\n`);
        }
    }

    const logEntry = {
        timestamp: new Date().toISOString(),
        task: "ArbScan-15min",
        result: isProfitable ? "Opportunity Found & Paper Executed" : "No profitable opportunities found",
        spread: `${realSpread}%`,
        prices: { TonAPI: priceA, StonFi: priceB }
    };

    fs.appendFileSync(path.join(__dirname, "../session-wal.jsonl"), JSON.stringify(logEntry) + "\n");
    console.log(`Scan complete. Real Spread: ${realSpread}%`);
    process.exit(0);
}

executeRealArb();
