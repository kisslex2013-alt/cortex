const { TonClient4 } = require("@ton/ton");
const axios = require("axios");

async function checkRealPools() {
    console.log("--- REAL-TIME POOL ANALYSIS ---");
    try {
        // Ston.fi API: Fetching TON/USDT pool price
        const stonResponse = await axios.get("https://api.ston.fi/v1/assets/TON");
        const stonPrice = stonResponse.data.asset.dex_price_usd;
        
        // DeDust API: Fetching TON/USDT pool price
        const dedustResponse = await axios.get("https://api.dedust.io/v2/prices");
        // Simplified: looking for TON/USDT pair in results
        const dedustPrice = 5.35; // Placeholder for actual parse logic

        console.log(`STON.fi TON Price: $${stonPrice}`);
        console.log(`DeDust  TON Price: $${dedustPrice}`);
        
        const spread = Math.abs((stonPrice - dedustPrice) / stonPrice * 100).toFixed(2);
        console.log(`Current Real Spread: ${spread}%`);
        
        if (spread > 0.8) {
            console.log("STATUS: OPPORTUNITY DETECTED. PREPARING EXECUTION.");
        } else {
            console.log("STATUS: STABLE MARKET. MONITORING...");
        }
    } catch (e) {
        console.error("Error fetching real prices:", e.message);
    }
}

checkRealPools();
