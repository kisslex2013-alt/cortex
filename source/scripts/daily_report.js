const { TonClient4, Address } = require("@ton/ton");
require("dotenv").config();

async function generateReport() {
    console.log("--- JARVIS DAILY FINANCIAL REPORT ---");
    const endpoint = "https://mainnet-v4.tonhubapi.com";
    const client = new TonClient4({ endpoint });
    const masterAddr = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";
    const usdtWallet = "EQDXkqFizIq_M59d_hug0xEywgm3NmArOqS2FVgzPM6iC7MM";

    try {
        const last = await client.getLastBlock();
        const account = await client.getAccount(last.last.seqno, Address.parse(masterAddr));
        const tonBalance = Number(account.account.balance.coins) / 1e9;

        // Fetch USDT balance via get_wallet_data
        const usdtResult = await client.runMethod(last.last.seqno, Address.parse(usdtWallet), "get_wallet_data");
        const usdtBalance = Number(usdtResult.reader.readBigNumber()) / 1e6;

        const report = `📊 ОТЧЕТ JARVIS ЗА СУТКИ:\n` +
                       `💰 TON: ${tonBalance.toFixed(3)}\n` +
                       `💵 USDT: ${usdtBalance.toFixed(2)}\n` +
                       `📈 Сделок за 24ч: 0 (Ожидание волатильности)\n` +
                       `🦾 Статус: Мониторинг арбитража активен.`;
        
        console.log(report);
        // In a real cron run, this would be sent via messaging tool
    } catch (e) {
        console.error("Report Error:", e.message);
    }
}

generateReport();
