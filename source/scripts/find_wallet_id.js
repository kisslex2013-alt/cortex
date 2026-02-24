const { TonClient4, WalletContractV5R1 } = require("@ton/ton");
const { mnemonicToWalletKey } = require("@ton/crypto");

async function find() {
    const mnemonic = process.env.TON_MNEMONIC.split(" ");
    const key = await mnemonicToWalletKey(mnemonic);
    
    // Test common subwalletIds and networkGlobalIds
    const targets = ["UQDON8ycOUTIv840Kxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH"]; // Note: the user's reported addr
    
    const settings = [
        { net: -239, sub: 0 },
        { net: -239, sub: 698983191 }, // standard v4 subwalletId?
        { net: -3, sub: 0 }
    ];

    for (const s of settings) {
        const w = WalletContractV5R1.create({
            publicKey: key.publicKey,
            walletId: { networkGlobalId: s.net, subwalletId: s.sub }
        });
        const addr = w.address.toString({ bounceable: false });
        console.log(`Setting: ${JSON.stringify(s)} -> ${addr}`);
    }
}
find();
