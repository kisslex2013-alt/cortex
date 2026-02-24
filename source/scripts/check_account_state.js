const { TonClient4 } = require("@ton/ton");
async function check() {
    const client = new TonClient4({ endpoint: "https://mainnet-v4.tonhubapi.com" });
    const last = await client.getLastBlock();
    const addr = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";
    const account = await client.getAccount(last.last.seqno, addr);
    console.log(`Account State: ${account.account.state.type}`);
    console.log(`Balance: ${account.account.balance.coins}`);
}
check();
