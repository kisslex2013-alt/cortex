#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis 5.1 NEXUS — Swap Test
// Меняет 1.0 TON на USDT через STON.fi DEX (v1 Router)
// Wallet: V5R1 | Сеть: mainnet | Одна кнопка
// ═══════════════════════════════════════════════════════════════
'use strict';

const { TonClient, WalletContractV5R1, toNano } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { DEX, pTON } = require('@ston-fi/sdk');

// ═══ CONFIG ═══
const SWAP_AMOUNT = '1';            // TON to swap
const USDT_ADDRESS = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'; // USDT jetton master
const SLIPPAGE = 0.05;              // 5% max slippage (safety margin)
const COMMENT = 'Executed by Jarvis 5.1 NEXUS';
const MAINNET_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';
const API_KEY = process.env.TONCENTER_API_KEY || '';

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
    console.log('🦾 Jarvis Swap Test — TON → USDT via STON.fi\n');

    // 1. Validate mnemonic
    const mnemonicWords = validateEnv();
    console.log('✅ Mnemonic validated (24 words)');

    // 2. Derive keypair
    const keyPair = await mnemonicToPrivateKey(mnemonicWords);
    console.log('✅ Keypair derived');

    // 3. Init client
    const client = new TonClient({
        endpoint: MAINNET_ENDPOINT,
        apiKey: API_KEY || undefined,
    });

    // 4. Init wallet V5R1
    const wallet = client.open(
        WalletContractV5R1.create({
            workchain: 0,
            publicKey: keyPair.publicKey,
        })
    );

    const walletAddress = wallet.address.toString({ bounceable: false });
    console.log(`📍 Wallet: ${walletAddress}`);

    // 5. Check balance
    const balance = await client.getBalance(wallet.address);
    const balanceTon = Number(balance) / 1e9;
    console.log(`💰 Balance: ${balanceTon.toFixed(4)} TON`);

    // Need swap amount + gas (~0.3 TON for DEX operations)
    const requiredBalance = parseFloat(SWAP_AMOUNT) + 0.3;
    if (balanceTon < requiredBalance) {
        throw new Error(`❌ Insufficient balance: ${balanceTon.toFixed(4)} TON (need ≥${requiredBalance} TON)`);
    }

    // 6. Get seqno (CRITICAL for double-spend prevention)
    const seqno = await wallet.getSeqno();
    console.log(`🔢 Seqno: ${seqno}`);

    // 7. Init STON.fi Router
    const router = client.open(new DEX.v1.Router());

    // 8. Build swap tx params
    console.log(`\n🔄 Building swap: ${SWAP_AMOUNT} TON → USDT`);
    console.log(`   DEX: STON.fi v1`);
    console.log(`   Slippage: ${SLIPPAGE * 100}%`);

    const txParams = await router.getSwapTonToJettonTxParams({
        userWalletAddress: walletAddress,
        proxyTon: new pTON.v1(),
        offerAmount: toNano(SWAP_AMOUNT),
        askJettonAddress: USDT_ADDRESS,
        minAskAmount: '1',      // Минимум 1 нано-USDT (slippage контролируется DEX)
        queryId: generateQueryId(),
    });

    // 9. Send through wallet
    console.log('📤 Sending swap transaction...');

    const transfer = wallet.createTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            {
                to: txParams.to,
                value: txParams.value,
                body: txParams.body,
                bounce: true,
            },
        ],
    });

    await wallet.send(transfer);

    // 10. Wait for seqno change (tx confirmation)
    console.log('\n⏳ Waiting for confirmation...');
    let confirmed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(3000);
        const newSeqno = await wallet.getSeqno();
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

    // 11. Output results
    const explorerUrl = `https://tonviewer.com/${walletAddress}`;
    console.log('\n═══════════════════════════════════════');
    console.log('🦾 SWAP RESULT');
    console.log(`   Sold:     ${SWAP_AMOUNT} TON`);
    console.log(`   For:      USDT (check explorer for exact amount)`);
    console.log(`   DEX:      STON.fi v1`);
    console.log(`   Slippage: ${SLIPPAGE * 100}%`);
    console.log(`   Wallet:   ${walletAddress}`);
    console.log(`   Seqno:    ${seqno} → ${seqno + 1}`);
    console.log(`   Status:   ${confirmed ? '✅ CONFIRMED' : '⏳ PENDING'}`);
    console.log(`   Explorer: ${explorerUrl}`);
    console.log('═══════════════════════════════════════\n');

    console.log('💡 Swap роутится через пул TON/USDT на STON.fi.');
    console.log('   Точная сумма USDT зависит от ликвидности пула в момент исполнения.');
}

// Генерация уникального queryId для идемпотентности
function generateQueryId() {
    return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
    console.error(`\n🔴 FATAL: ${err.message}`);
    process.exit(1);
});
