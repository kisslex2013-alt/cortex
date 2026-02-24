const axios = require('axios');

async function main() {
    const address = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";
    try {
        const response = await axios.get(`https://toncenter.com/api/v2/getTransactions?address=${address}&limit=20`);
        const txs = response.data.result;
        if (!txs || txs.length === 0) {
            console.log("No transactions found.");
            return;
        }
        txs.forEach(tx => {
            const utime = tx.utime;
            const inMsg = tx.in_msg;
            const outMsgs = tx.out_msgs;
            
            if (outMsgs && outMsgs.length > 0) {
                outMsgs.forEach(msg => {
                    console.log(`[OUT] ${new Date(utime * 1000).toISOString()} | To: ${msg.destination} | Value: ${msg.value / 1e9} TON`);
                });
            }
        });
    } catch (e) {
        console.error(e.message);
    }
}
main();
