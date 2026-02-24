const { TonClient4, Address, beginCell } = require("@ton/ton");
require("dotenv").config();

async function getUsdtBalance() {
    const endpoint = "https://mainnet-v4.tonhubapi.com";
    const client = new TonClient4({ endpoint });
    const jettonWalletAddress = "EQDXkqFizIq_M59d_hug0xEywgm3NmArOqS2FVgzPM6iC7MM";
    
    const last = await client.getLastBlock();
    const result = await client.runMethod(last.last.seqno, Address.parse(jettonWalletAddress), "get_wallet_data");
    
    const balance = result.reader.readBigNumber();
    console.log(`REAL_USDT_BALANCE: ${Number(balance) / 1_000_000}`);
}

getUsdtBalance();
