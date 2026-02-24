#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

// Legacy entry point wrapper for Semantic Distiller
const distillerPath = path.join(__dirname, 'evolution/semantic_distiller.js');
console.log("[Legacy] Redirecting wisdom_distiller.py request to evolution/semantic_distiller.js...");

try {
    const output = execSync(`node ${distillerPath}`, { stdio: 'inherit' });
} catch (e) {
    process.exit(1);
}
