const { TonClient } = require("@ton/ton");

async function main() {
    const client = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC" });
    const address = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";
    
    const txs = await client.getTransactions(address, { limit: 10 });
    
    for (const tx of txs) {
        const outMsgs = tx.outMessages;
        if (outMsgs && outMsgs.length > 0) {
            for (const msg of outMsgs) {
                console.log(`Date: ${new Date(tx.utime * 1000).toISOString()}`);
                console.log(`To: ${msg.info.dest}`);
                console.log(`Value: ${Number(msg.info.value.coins) / 1e9} TON`);
                console.log(`---`);
            }
        }
    }
}
main();
