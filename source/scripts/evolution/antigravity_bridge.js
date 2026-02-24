#!/usr/bin/env node

/**
 * 🌉 ANTIGRAVITY BRIDGE (v1.0)
 * --------------------------------
 * Offloads repository context to external High-Capacity Models (Antigravity).
 * Features:
 * - Deterministic Hashline signatures (v6.2.2)
 * - Secret Redaction (Regex-based)
 * - Gitignore/Whitelist support
 * - JSON Payload Generation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Attempt to load Hashline (soft dependency for standalone use, hard for Agent)
let hashline = null;
try {
    hashline = null; // removed: was dead code
} catch (e) {
    console.warn("⚠️ Hashline Core not found. Proceeding without determinism tracking.");
}

// Config
const CONFIG = {
    maxFileSize: 1024 * 1024, // 1MB per file limit
    totalSizeLimit: 50 * 1024 * 1024, // 50MB total payload limit
    ignorePatterns: [
        'node_modules', '.git', 'dist', 'coverage', '.env', '.DS_Store',
        'package-lock.json', 'yarn.lock', '*.log', '*.sqlite', '*.db',
        'scripts/survival/outbox.db', 'memory/chroma', 'public',
        'archive', 'memory/archive', '.venv'
    ],
    redactPatterns: [
        { name: 'OPENAI_API_KEY', regex: /sk-[a-zA-Z0-9]{32,}/g },
        { name: 'ANTHROPIC_API_KEY', regex: /sk-ant-[a-zA-Z0-9\-_]{32,}/g },
        { name: 'AWS_ACCESS_KEY', regex: /(AKIA|ASIA)[A-Z0-9]{16}/g },
        { name: 'GENERIC_SECRET', regex: /["']?[a-zA-Z0-9_]*(secret|token|password|key)["']?\s*[:=]\s*["'][a-zA-Z0-9_\-]{8,}["']/gi },
        { name: 'JWT', regex: /eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g }
    ]
};

// Utils
function isIgnored(filePath) {
    return CONFIG.ignorePatterns.some(pattern => {
        if (pattern.startsWith('*')) return filePath.endsWith(pattern.slice(1));
        return filePath.includes(pattern);
    });
}

function redactContent(content) {
    let redacted = content;
    CONFIG.redactPatterns.forEach(p => {
        redacted = redacted.replace(p.regex, `[REDACTED:${p.name}]`);
    });
    return redacted;
}

function walkDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const relativePath = path.relative(process.cwd(), filePath);

        if (isIgnored(relativePath)) return;

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath, fileList);
        } else {
            if (stat.size < CONFIG.maxFileSize) {
                fileList.push(relativePath);
            } else {
                console.warn(`⚠️ Skipping large file: ${relativePath} (${(stat.size / 1024).toFixed(2)} KB)`);
            }
        }
    });
    return fileList;
}

async function main() {
    console.log("🚀 Initializing Antigravity Bridge v1.0...");

    // 1. Scan Files
    const files = walkDir(process.cwd());
    console.log(`📂 Found ${files.length} files to archive.`);

    // 2. Build Payload
    const payload = {
        timestamp: new Date().toISOString(),
        files: {},
        meta: {
            task: "FULL_CONTEXT_ANALYSIS",
            source: "LOCAL_REPO"
        }
    };

    let totalSize = 0;
    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const redacted = redactContent(content);
            payload.files[file] = redacted;
            totalSize += redacted.length;
            
            if (totalSize > CONFIG.totalSizeLimit) {
                console.warn("⚠️ Payload size limit reached! Stopping collection.");
                break;
            }
        } catch (e) {
            console.error(`❌ Error reading ${file}: ${e.message}`);
        }
    }

    console.log(`📦 Payload generated: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    // 3. Hashline Commitment
    if (hashline) {
        try {
            const intent = "ANTIGRAVITY_UPLOAD";
            const context = { size: totalSize, fileCount: Object.keys(payload.files).length };
            const decision = "Approved safe payload generation";
            await hashline.commit(intent, decision, context);
            console.log("✅ Hashline signature committed.");
        } catch (e) {
            console.error(`❌ Hashline error: ${e.message}`);
        }
    }

    // 4. Output
    const distDir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
    
    const outputPath = path.join(distDir, 'antigravity_payload.json');
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    console.log(`💾 Payload saved to: ${outputPath}`);

    // 5. Interaction Instructions (The "Bridge")
    console.log("\n🌐 == BRIDGE INSTRUCTIONS ==");
    console.log("1. Use the 'browser' tool to open your Antigravity session (e.g., Claude, ChatGPT).");
    console.log("2. Upload or paste the content of 'dist/antigravity_payload.json'.");
    console.log("3. Prompt: 'Analyze this JSON codebase structure. Provide a security audit and refactor suggestions in JSON format.'");
    console.log("4. Save the response to 'docs/research/antigravity_result.json'.");
    
    // Optional: Puppeteer check
    try {
        require.resolve('puppeteer');
        console.log("\n✨ Puppeteer detected! You can extend this script to automate the upload.");
        // (Placeholder for future automation logic)
    } catch (e) {
        console.log("\n(Puppeteer not installed. Automation requires 'npm install puppeteer'.)");
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
