// scripts/check_balance.js
const { TonClient4, WalletContractV5R1, Address } = require("@ton/ton");
const { mnemonicToWalletKey } = require("@ton/crypto");
const { SecretVault } = require("./survival/nexus_core");
const fs = require('fs');
const path = require('path');

async function check() {
    // Load .env manually
    if (!process.env.VAULT_PASSWORD) {
        try {
            const envPath = path.resolve(__dirname, '../.env');
            if (fs.existsSync(envPath)) {
                const env = fs.readFileSync(envPath, 'utf8');
                const match = env.match(/VAULT_PASSWORD=(.*)/);
                if (match) process.env.VAULT_PASSWORD = match[1].trim();
            }
        } catch (e) {}
    }

    const password = process.env.VAULT_PASSWORD;
    if (!password) {
        console.log("VAULT_PASSWORD not found.");
        return;
    }

    try {
        const vault = new SecretVault();
        if (!fs.existsSync(vault.vaultPath)) {
            console.log("Vault not found.");
            return;
        }
        
        const encrypted = fs.readFileSync(vault.vaultPath, 'utf8');
        const mnemonic = vault.decrypt(encrypted, password).trim();
        const key = await mnemonicToWalletKey(mnemonic.split(" "));
        
        const client = new TonClient4({ endpoint: "https://mainnet-v4.tonhubapi.com" });
        const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });
        
        const latest = await client.getLastBlock();
        const account = await client.getAccount(latest.last.seqno, wallet.address);
        const balance = Number(account.account.balance.coins) / 1e9;
        
        console.log(`Address: ${wallet.address.toString({ testOnly: false })}`);
        console.log(`Balance: ${balance.toFixed(4)} TON`);
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

check();
