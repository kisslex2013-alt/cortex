const { TonClient, WalletContractV4, WalletContractV3R2, internal } = require("@ton/ton");
const { mnemonicToWalletKey } = require("@ton/crypto");

async function main() {
    const mnemonic = process.env.TON_MNEMONIC;
    if (!mnemonic) {
        console.error("TON_MNEMONIC not found in env");
        process.exit(1);
    }

    const key = await mnemonicToWalletKey(mnemonic.split(" "));
    
    const versions = [
        { name: "V4", contract: WalletContractV4 },
        { name: "V3R2", contract: WalletContractV3R2 }
    ];

    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });

    for (const v of versions) {
        const wallet = v.contract.create({ publicKey: key.publicKey, workchain: 0 });
        const contract = client.open(wallet);
        const balance = await contract.getBalance();
        const address = wallet.address.toString({ bounceable: false, testOnly: false });
        console.log(`${v.name} Address: ${address}`);
        console.log(`${v.name} Balance: ${(Number(balance) / 1e9).toFixed(4)} TON`);
    }
}

main().catch(console.error);
