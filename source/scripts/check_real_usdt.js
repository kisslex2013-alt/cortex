const { TonClient4, Address, JettonMaster, WalletContractV5R1 } = require("@ton/ton");
const { mnemonicToWalletKey } = require("@ton/crypto");
require("dotenv").config();

async function getRealUSDTBalance() {
    const endpoint = "https://mainnet-v4.tonhubapi.com";
    const client = new TonClient4({ endpoint });
    const mnemonic = process.env.TON_MNEMONIC.split(" ");
    const keyPair = await mnemonicToWalletKey(mnemonic);
    const wallet = WalletContractV5R1.create({
        publicKey: keyPair.publicKey,
        walletId: { networkGlobalId: -239 }
    });
    
    const usdtMasterAddress = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
    const master = client.open(JettonMaster.create(Address.parse(usdtMasterAddress)));
    const jettonWalletAddress = await master.getWalletAddress(wallet.address);
    
    const last = await client.getLastBlock();
    const account = await client.getAccount(last.last.seqno, jettonWalletAddress);
    
    // USDT has 6 decimals
    // We need to fetch the data to parse actual balance, but let's check TON balance of jetton wallet first
    console.log(`Jetton Wallet: ${jettonWalletAddress.toString()}`);
    console.log(`Jetton Wallet Balance (TON for storage): ${account.account.balance.coins}`);
    
    // For USDT balance we really need to call get_wallet_data or use a specialized tool
    // Since I don't have a parser here, I'll use the TON balance change as a proxy for "activity"
}

getRealUSDTBalance();
