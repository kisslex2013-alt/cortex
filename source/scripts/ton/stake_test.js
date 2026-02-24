#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis 5.1 NEXUS — Stake Test
// Отправляет 1.0 TON на Tonstakers для ликвидного стейкинга
// Wallet: V5R1 | Сеть: mainnet | Одна кнопка
// ═══════════════════════════════════════════════════════════════
'use strict';

const { TonClient4, WalletContractV5R1, internal, toNano, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

// ═══ CONFIG ═══
const TONSTAKERS_ADDRESS = Address.parse('EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR');
const STAKE_AMOUNT = '0.5';           // TON
const COMMENT = 'Executed by Jarvis 5.1 NEXUS';
const MAINNET_ENDPOINT = 'https://mainnet-v4.tonhubapi.com';

// ═══ SAFETY CHECKS ═══
function validateEnv() {
    const mnemonic = process.env.TON_MNEMONIC;
    if (!mnemonic) {
        throw new Error('❌ TON_MNEMONIC not set. Export 24-word mnemonic.');
    }
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 24) {
        throw new Error(`❌ Mnemonic must be 24 words, got ${words.length}`);
    }
    return words;
}

// ═══ MAIN ═══
async function main() {
    console.log('🦾 Jarvis Stake Test — Tonstakers Liquid Staking\n');

    // 1. Validate mnemonic
    const mnemonicWords = validateEnv();
    console.log('✅ Mnemonic validated (24 words)');

    // 2. Derive keypair
    const keyPair = await mnemonicToPrivateKey(mnemonicWords);
    console.log('✅ Keypair derived');

    // 3. Init client V4
    const client = new TonClient4({
        endpoint: MAINNET_ENDPOINT
    });

    // 4. Init wallet V5R1
    const wallet = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });
    
    const contract = client.open(wallet);

    const walletAddress = wallet.address.toString({ bounceable: false });
    console.log(`📍 Wallet: ${walletAddress}`);

    // 5. Check balance
    const balance = await client.getAccount(57256434, wallet.address); // Need a recent block or latest
    // Wait, better to get latest block first
    const latest = await client.getLastBlock();
    const account = await client.getAccount(latest.last.seqno, wallet.address);
    const balanceTon = Number(account.account.balance.coins) / 1e9;
    console.log(`💰 Balance: ${balanceTon.toFixed(4)} TON`);

    if (balanceTon < parseFloat(STAKE_AMOUNT) + 0.05) {
        throw new Error(`❌ Insufficient balance: ${balanceTon.toFixed(4)} TON (need ≥${parseFloat(STAKE_AMOUNT) + 0.05} TON)`);
    }

    // 6. Get seqno
    const seqno = await contract.getSeqno();
    console.log(`🔢 Seqno: ${seqno}`);

    // 7. Build & send transfer
    console.log(`\n📤 Sending ${STAKE_AMOUNT} TON → Tonstakers...`);
    
    const body = internal({
        to: TONSTAKERS_ADDRESS,
        value: toNano(STAKE_AMOUNT),
        bounce: true,
        body: COMMENT,
    });

    // 8. Send and wait
    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [body]
    });

    // 9. Wait for seqno change
    console.log('\n⏳ Waiting for confirmation...');
    let confirmed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(3000);
        const newSeqno = await contract.getSeqno();
        if (newSeqno > seqno) {
            confirmed = true;
            console.log(`✅ Confirmed! New seqno: ${newSeqno}`);
            break;
        }
        process.stdout.write('.');
    }

    if (!confirmed) {
        console.log('\n⚠️  Confirmation timeout (90s). Check manually.');
    }

    // 10. Output results
    const explorerUrl = `https://tonviewer.com/${walletAddress}`;
    console.log('\n═══════════════════════════════════════');
    console.log('🦾 STAKE RESULT');
    console.log(`   Amount:   ${STAKE_AMOUNT} TON`);
    console.log(`   To:       Tonstakers (liquid staking)`);
    console.log(`   Wallet:   ${walletAddress}`);
    console.log(`   Seqno:    ${seqno} → ${seqno + 1}`);
    console.log(`   Status:   ${confirmed ? '✅ CONFIRMED' : '⏳ PENDING'}`);
    console.log(`   Explorer: ${explorerUrl}`);
    console.log('═══════════════════════════════════════\n');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
    console.error(`\n🔴 FATAL: ${err.message}`);
    process.exit(1);
});
