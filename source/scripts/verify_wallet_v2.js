const { TonClient, WalletContractV4, WalletContractV3R2 } = require("@ton/ton");
const { mnemonicToWalletKey } = require("@ton/crypto");
// V5 is relatively new, let's see if we can derive it or find the right class
// In newer @ton/ton, it's often WalletContractV5

async function main() {
    const mnemonic = process.env.TON_MNEMONIC;
    if (!mnemonic) {
        console.error("TON_MNEMONIC not found in env");
        process.exit(1);
    }

    const key = await mnemonicToWalletKey(mnemonic.split(" "));
    const targetAddress = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";
    
    console.log(`--- Wallet Verification ---`);
    console.log(`Target Address: ${targetAddress}`);

    // Try V4, V3R2, and check for V5 if available
    const versions = [
        { name: "V4R2", contract: WalletContractV4 },
        { name: "V3R2", contract: WalletContractV3R2 }
    ];

    for (const v of versions) {
        const wallet = v.contract.create({ publicKey: key.publicKey, workchain: 0 });
        const address = wallet.address.toString({ bounceable: false, testOnly: false });
        const matches = address === targetAddress ? "✅ MATCH" : "❌ NO MATCH";
        console.log(`${v.name}: ${address} ${matches}`);
    }
    
    // Check if we can find V5 manually if it's not in the main export
    try {
        const { WalletContractV5R1 } = require("@ton/ton");
        if (WalletContractV5R1) {
            const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });
            const address = wallet.address.toString({ bounceable: false, testOnly: false });
            const matches = address === targetAddress ? "✅ MATCH" : "❌ NO MATCH";
            console.log(`V5R1: ${address} ${matches}`);
        }
    } catch (e) {
        console.log("V5R1 not found in @ton/ton");
    }
}

main().catch(console.error);
