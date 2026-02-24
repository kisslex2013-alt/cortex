const { Address } = require("@ton/ton");
const TonDispatcher = require("/root/.openclaw/workspace/jarvis-core/TonDispatcher");
require("dotenv").config();

async function checkJetton() {
    const mnemonic = process.env.TON_MNEMONIC;
    const dispatcher = new TonDispatcher(mnemonic);
    const myAddr = await dispatcher.init();
    
    const usdtMaster = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
    const jettonWallet = await dispatcher.getJettonWalletAddress(usdtMaster, Address.parse(myAddr));
    
    console.log(`My Address: ${myAddr}`);
    console.log(`Jetton Wallet: ${jettonWallet.toString()}`);

    const last = await (await dispatcher.client.getLastBlock()).last.seqno;
    const account = await dispatcher.client.getAccount(last, jettonWallet);
    
    console.log(`Jetton Balance (raw): ${account.account.balance.coins}`);
    
    // To get actual USDT balance, we need to parse the account data (get_wallet_data)
    // but looking at account balance (TON for storage) is also a clue.
}

checkJetton();
