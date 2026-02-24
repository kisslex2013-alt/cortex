#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis 6.2.0 NEXUS — Real Staking Execution
// Sends 1.85 TON to Tonstakers for Liquid Staking
// Wallet: V5R1 | Network: mainnet
// ═══════════════════════════════════════════════════════════════
'use strict';

const { TonClient4, WalletContractV5R1, internal, toNano, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

// ═══ CONFIG ═══
// Address from official Jarvis TON_SCRIPTS_GUIDE.md
const TONSTAKERS_ADDRESS = Address.parse('EQDnHy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k');
const STAKE_AMOUNT = '1.85';          // TON
const COMMENT = 'Staking via Jarvis 6.2.0';
const MAINNET_ENDPOINT = 'https://mainnet-v4.tonhubapi.com';

async function main() {
    console.log('🦾 Jarvis Real Staking Execution\n');

    const mnemonic = process.env.TON_MNEMONIC;
    if (!mnemonic) throw new Error('TON_MNEMONIC env var is missing');
    const words = mnemonic.trim().split(/\s+/);

    const keyPair = await mnemonicToPrivateKey(words);
    const client = new TonClient4({ endpoint: MAINNET_ENDPOINT });
    
    const wallet = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });
    
    const contract = client.open(wallet);
    const walletAddress = wallet.address.toString({ bounceable: false });
    console.log(`📍 Wallet: ${walletAddress}`);

    const latest = await client.getLastBlock();
    const account = await client.getAccount(latest.last.seqno, wallet.address);
    const balanceTon = Number(account.account.balance.coins) / 1e9;
    console.log(`💰 Current Balance: ${balanceTon.toFixed(4)} TON`);

    if (balanceTon < parseFloat(STAKE_AMOUNT) + 0.1) {
        throw new Error(`Insufficient balance for 1.85 TON stake + gas`);
    }

    const seqno = await contract.getSeqno();
    console.log(`🔢 Seqno: ${seqno}`);

    console.log(`\n📤 Sending ${STAKE_AMOUNT} TON → Tonstakers...`);
    
    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: TONSTAKERS_ADDRESS,
                value: toNano(STAKE_AMOUNT),
                bounce: true,
                body: COMMENT,
            })
        ]
    });

    console.log('\n⏳ Waiting for confirmation (checking seqno)...');
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

    if (!confirmed) console.log('\n⚠️ Confirmation timeout. Transaction may still be processing.');

    console.log(`\n🔗 Explorer: https://tonviewer.com/${walletAddress}`);
}

main().catch(err => {
    console.error(`\n🔴 FATAL: ${err.message}`);
    process.exit(1);
});
