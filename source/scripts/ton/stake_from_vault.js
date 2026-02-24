#!/usr/bin/env node
const { SecretVault } = require("../survival/nexus_core");
const fs = require('fs');
const { TonClient4, WalletContractV5R1, internal, toNano, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

// ═══ CONFIG ═══
const TONSTAKERS_ADDRESS = Address.parse('EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR');
const STAKE_AMOUNT = '1.85';
const MAINNET_ENDPOINT = 'https://mainnet-v4.tonhubapi.com';

async function run() {
    const password = process.env.VAULT_PASSWORD;
    if (!password) throw new Error("VAULT_PASSWORD environment variable is missing");

    let mnemonic;
    try {
        const vault = new SecretVault();
        const encrypted = fs.readFileSync(vault.vaultPath, 'utf8');
        mnemonic = vault.decrypt(encrypted, password).trim();
    } catch (e) {
        throw new Error("Vault Decryption Failed: " + e.message);
    }

    const words = mnemonic.split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(words);
    const client = new TonClient4({ endpoint: MAINNET_ENDPOINT });
    const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: keyPair.publicKey });
    const contract = client.open(wallet);
    const walletAddress = wallet.address.toString({ bounceable: false });

    console.log(`📍 Wallet: ${walletAddress}`);
    const latest = await client.getLastBlock();
    const account = await client.getAccount(latest.last.seqno, wallet.address);
    const balanceTon = Number(account.account.balance.coins) / 1e9;
    console.log(`💰 Current Balance: ${balanceTon.toFixed(4)} TON`);

    if (balanceTon < parseFloat(STAKE_AMOUNT) + 0.1) {
        throw new Error(`Insufficient balance: ${balanceTon.toFixed(4)} TON`);
    }

    const seqno = await contract.getSeqno();
    console.log(`🔢 Seqno: ${seqno}`);
    console.log(`📤 Sending ${STAKE_AMOUNT} TON → Tonstakers...`);

    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: TONSTAKERS_ADDRESS,
                value: toNano(STAKE_AMOUNT),
                bounce: true,
                body: 'Staking 1.85 TON via Jarvis Nexus 6.2.0',
            })
        ]
    });

    console.log('⏳ Waiting for confirmation...');
    let confirmed = false;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const newSeqno = await contract.getSeqno();
        if (newSeqno > seqno) {
            confirmed = true;
            console.log(`✅ SUCCESS! Transaction confirmed. New seqno: ${newSeqno}`);
            break;
        }
        process.stdout.write('.');
    }

    if (confirmed) {
        console.log(`🔗 Explorer: https://tonviewer.com/${walletAddress}`);
    } else {
        console.log('\n⚠️ Confirmation timeout. Check explorer manually.');
    }
}

run().catch(err => {
    console.error(`\n🔴 FATAL: ${err.message}`);
    process.exit(1);
});
