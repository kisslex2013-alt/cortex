const { TonClient4, WalletContractV5R1 } = require("@ton/ton");
const { mnemonicToWalletKey } = require("@ton/crypto");
const { SecretVault } = require("./survival/nexus_core");
const fs = require("fs");

async function main() {
    const password = process.argv[2];
    const vaultPath = "/root/.openclaw/vault/secrets.enc";

    if (!password) {
        console.error("Usage: node check_staking_balance.js <vault_password>");
        process.exit(1);
    }

    try {
        const vault = new SecretVault(vaultPath);
        const encrypted = fs.readFileSync(vaultPath, "utf8");
        const mnemonic = vault.decrypt(encrypted, password).trim();
        const key = await mnemonicToWalletKey(mnemonic.split(" "));
        
        const client = new TonClient4({ endpoint: "https://mainnet-v4.tonhubapi.com" });
        const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });
        const contract = client.open(wallet);
        
        const balance = await contract.getBalance();
        const addrStr = wallet.address.toString({ bounceable: false });
        
        console.log(`ADDRESS: ${addrStr}`);
        console.log(`BALANCE: ${(Number(balance) / 1e9).toFixed(4)} TON`);
    } catch (e) {
        console.error(`FAILED: ${e.message}`);
        process.exit(1);
    }
}

main();
