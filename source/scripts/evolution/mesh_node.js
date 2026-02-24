/**
 * Agent Mesh Node Prototype (moltbookrecon)
 * Protocol: Hashline v6.2.2
 * 
 * Objective: Lightweight P2P gossip node for signal exchange.
 */

const dgram = require('dgram');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

// --- Configuration ---
const CONFIG = {
    PORT: 14444,
    PROTOCOL_VERSION: '6.2.2',
    MAX_CPU_PERCENT: 5.0,
    MAX_RAM_MB: 100,
    CHECK_INTERVAL_MS: 1000,
    DB_PATH: path.join(__dirname, '../../jarvis_knowledge.db'), // Mock path
    PROXIES_FILE: path.join(__dirname, '../../proxies.txt')
};

// --- Mock Database Stub ---
// In production, this would use 'better-sqlite3' to write to jarvis_knowledge.db
const DB = {
    logSignal: (signal) => {
        console.log(`[DB] Storing High-Alpha Signal: ${signal.id} | alpha=${signal.alpha}`);
        // fs.appendFileSync('jarvis_log.jsonl', JSON.stringify(signal) + '\n');
    }
};

// --- Crypto Utilities (Ed25519) ---
// Node.js crypto module supports ed25519 via generateKeyPair / sign / verify
const CryptoUtils = {
    verifySignature: (publicKey, data, signature) => {
        try {
            // Placeholder: In real impl, convert hex keys to buffers
            // return crypto.verify(null, Buffer.from(data), publicKey, Buffer.from(signature, 'hex'));
            return true; // MOCK for prototype
        } catch (e) {
            return false;
        }
    }
};

// --- State ---
const State = {
    peers: [], // Loaded from proxies.txt
    seenHashes: new Set(), // Deduplication
    startTime: Date.now()
};

// --- Components ---

/** 3. Emergency Kill-Switch */
function startResourceMonitor() {
    console.log('[System] Kill-switch armed.');
    
    // CPU usage baseline
    let startUsage = process.cpuUsage();
    
    setInterval(() => {
        // 1. Check RAM
        const memoryUsage = process.memoryUsage();
        const rssMb = memoryUsage.rss / 1024 / 1024;
        
        if (rssMb > CONFIG.MAX_RAM_MB) {
            console.error(`[KILL-SWITCH] RAM limit exceeded: ${rssMb.toFixed(2)}MB > ${CONFIG.MAX_RAM_MB}MB. Terminating.`);
            process.exit(1);
        }

        // 2. Check CPU (Simple estimate)
        const newUsage = process.cpuUsage(startUsage);
        startUsage = process.cpuUsage();
        
        // This is a rough heuristic for the prototype. 
        // Real CPU % requires calculating against system uptime delta or using os.loadavg() for system-wide.
        // For process-specific strictness, we might use a dedicated watcher or 'pidusage' lib.
        
        // Mock check for prototype safety
        if (rssMb > CONFIG.MAX_RAM_MB * 0.9) {
            console.warn(`[WARNING] Memory nearing limit: ${rssMb.toFixed(2)}MB`);
        }

    }, CONFIG.CHECK_INTERVAL_MS);
}

/** 4. Integration: Load Peers */
function loadPeers() {
    try {
        if (fs.existsSync(CONFIG.PROXIES_FILE)) {
            const data = fs.readFileSync(CONFIG.PROXIES_FILE, 'utf8');
            State.peers = data.split('\n')
                .filter(line => line.trim() && !line.startsWith('#'))
                .map(line => {
                    const [ip, port, pubkey] = line.split(':');
                    return { ip, port: parseInt(port) || 14444, pubkey };
                });
            console.log(`[Net] Loaded ${State.peers.length} peers from proxies.txt`);
        } else {
            console.log('[Net] No proxies.txt found. Running in standalone mode.');
        }
    } catch (e) {
        console.error('[Net] Failed to load peers:', e.message);
    }
}

/** 2. Signal Validator & 1. Mesh Listener */
const server = dgram.createSocket('udp4');

server.on('error', (err) => {
    console.error(`[Listener] Server error:\n${err.stack}`);
    server.close();
});

server.on('message', (msg, rinfo) => {
    // 1. Deduplication
    const packetHash = crypto.createHash('sha256').update(msg).digest('hex');
    if (State.seenHashes.has(packetHash)) return; // Drop duplicate
    State.seenHashes.add(packetHash);
    
    // Cleanup old hashes periodically (mock implementation)
    if (State.seenHashes.size > 1000) State.seenHashes.clear();

    try {
        // Parse JSON (assuming simple JSON payload for prototype)
        // In Hashline v6.2.2, this would be binary parsing: Header + Payload + Sig
        const packet = JSON.parse(msg.toString());

        // 2. Validation
        if (!packet.sig || !packet.sender || !packet.payload) {
            // Invalid format
            return; 
        }

        // Verify Signature (Ed25519)
        const isValid = CryptoUtils.verifySignature(packet.sender, JSON.stringify(packet.payload), packet.sig);
        if (!isValid) {
            console.warn(`[Security] Invalid signature from ${rinfo.address}`);
            return;
        }

        // Check Karma (Mock)
        const senderKarma = 50; // Fetch from DB in real impl
        if (senderKarma < 10) return; // Drop low reputation

        // 3. Dispatch & Gossip
        processSignal(packet.payload);
        gossip(msg, rinfo);

    } catch (e) {
        // Malformed packet
    }
});

/** Internal Dispatcher */
function processSignal(payload) {
    if (payload.alpha && payload.alpha > 0.8) {
        console.log(`[Dispatcher] HIGH ALPHA DETECTED: ${payload.topic}`);
        DB.logSignal(payload);
    }
}

function gossip(rawMsg, senderInfo) {
    // Forward to random subset of peers (excluding sender)
    const candidates = State.peers.filter(p => p.ip !== senderInfo.address);
    const targets = candidates.sort(() => 0.5 - Math.random()).slice(0, 3); // Gossip to 3 randoms

    targets.forEach(peer => {
        server.send(rawMsg, peer.port, peer.ip, (err) => {
            if (err) console.error('[Gossip] Send failed');
        });
    });
}

// --- Main Entry ---
function main() {
    console.log(`[Boot] Starting Agent Mesh Node (Hashline v${CONFIG.PROTOCOL_VERSION})...`);
    startResourceMonitor();
    loadPeers();
    
    server.bind(CONFIG.PORT, () => {
        console.log(`[Listener] Listening on UDP ${CONFIG.PORT}`);
    });
}

if (require.main === module) {
    main();
}

module.exports = { main, processSignal };
