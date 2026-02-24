const axios = require("axios");

async function checkStonFiOnly() {
    console.log("--- STON.FI MARKET CHECK ---");
    try {
        const response = await axios.get("https://api.ston.fi/v1/assets?symbol=TON");
        const tonAsset = response.data.assets.find(a => a.symbol === 'TON');
        if (tonAsset) {
            console.log(`TON Price on STON.fi: $${tonAsset.dex_price_usd}`);
        }
        
        const usdtResponse = await axios.get("https://api.ston.fi/v1/assets?symbol=USD₮");
        const usdtAsset = usdtResponse.data.assets.find(a => a.symbol === 'USD₮');
        if (usdtAsset) {
            console.log(`USDT Price on STON.fi: $${usdtAsset.dex_price_usd}`);
        }
    } catch (e) {
        console.error("API Error:", e.message);
    }
}

checkStonFiOnly();
