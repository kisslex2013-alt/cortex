const { SecretVault } = require('./nexus_core.js');
const { mnemonicToWalletKey } = require("@ton/crypto");
const { WalletContractV5R1 } = require("@ton/ton");
const fs = require('fs');

async function unlock() {
    const password = fs.readFileSync('../../temp_pass.txt', 'utf8').trim();
    if (!password) {
        console.log("NO_PASSWORD");
        return;
    }

    const vault = new SecretVault();
    try {
        const encrypted = fs.readFileSync(vault.vaultPath, 'utf8');
        const decryptedMnemonic = vault.decrypt(encrypted, password);
        
        const key = await mnemonicToWalletKey(decryptedMnemonic.trim().split(" "));
        const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });
        const address = wallet.address.toString({ bounceable: false, testOnly: false });
        
        const target = "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH";
        if (address === target) {
            console.log(`MATCH_SUCCESS:${address}`);
        } else {
            console.log(`MATCH_FAIL:${address}`);
        }
    } catch (e) {
        console.log(`DECRYPT_ERROR:${e.message}`);
    }
}
unlock();
