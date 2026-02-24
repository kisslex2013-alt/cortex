// scripts/reflexes/dex_spread_reflex.js
const axios = require('axios');

async function fetchStonFiPrice() {
    try {
        const res = await axios.get('https://api.ston.fi/v1/assets', { timeout: 5000 });
        const tonAsset = res.data.asset_list?.find(a => a.symbol === 'TON' || a.contract_address === 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
        return tonAsset ? parseFloat(tonAsset.dex_usd_price) : null;
    } catch (e) { 
        console.error(`[STON.fi] Error: ${e.message}`);
        return null; 
    }
}

async function fetchDeDustPrice() {
    try {
        const res = await axios.get('https://api.dedust.io/v2/pools', { timeout: 5000 });
        const tonPool = res.data?.find(p => 
            p.assets?.some(a => a.type === 'native') && 
            p.assets?.some(a => a.metadata?.symbol === 'USDT' || a.address === 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
        );
        if (tonPool && tonPool.reserves) {
            const nativeAsset = tonPool.assets.find(a => a.type === 'native');
            const jettonAsset = tonPool.assets.find(a => a.type === 'jetton');
            const nativeIndex = tonPool.assets.indexOf(nativeAsset);
            const jettonIndex = tonPool.assets.indexOf(jettonAsset);
            
            const nativeDecimals = nativeAsset.metadata?.decimals || 9;
            const jettonDecimals = jettonAsset.metadata?.decimals || 6;
            
            const nativeRes = parseFloat(tonPool.reserves[nativeIndex]) / Math.pow(10, nativeDecimals);
            const jettonRes = parseFloat(tonPool.reserves[jettonIndex]) / Math.pow(10, jettonDecimals);
            
            return jettonRes / nativeRes;
        }
        return null;
    } catch (e) { 
        console.error(`[DeDust] Error: ${e.message}`);
        return null; 
    }
}

async function run() {
    const [priceSton, priceDeDust] = await Promise.all([fetchStonFiPrice(), fetchDeDustPrice()]);
    
    if (!priceSton || !priceDeDust) {
        console.error("Error: Could not fetch prices from one or more DEX sources.");
        return;
    }

    const diff = Math.abs(priceSton - priceDeDust);
    const spread = (diff / Math.min(priceSton, priceDeDust)) * 100;

    console.log(`🦾 *DEX Spread Monitor*`);
    console.log(`💎 TON Price:`);
    console.log(`   └ STON.fi: $${priceSton.toFixed(4)}`);
    console.log(`   └ DeDust:  $${priceDeDust.toFixed(4)}`);
    console.log(`🎯 Spread: ${spread.toFixed(2)}%`);

    if (spread > 1.5) {
        console.log(`\n🚀 *ALERT:* Profitable spread detected (${spread.toFixed(2)}%)!`);
    } else {
        console.log(`\n_Спред ниже порога 1.5%. Сидим ровно._`);
    }
}

run();
