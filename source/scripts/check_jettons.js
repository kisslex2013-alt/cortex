const { TonClient4 } = require("@ton/ton");

async function main() {
    const client = new TonClient4({ endpoint: "https://mainnet-v4.tonhubapi.com" });
    const address = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";
    
    const latest = await client.getLastBlock();
    const result = await client.getAccountLite(latest.last.seqno, address);
    
    console.log(`Balance: ${Number(result.account.balance.coins) / 1e9} TON`);
    
    // Tonstakers tsTON root address: EQC98_77_77_77_77_77_77_77_77_77_77_77_77_77_77_77_77_77_77_78 (Placeholder, need real one)
    // Actually, I'll search for the real tsTON address or use an API to list jettons.
}
main();
