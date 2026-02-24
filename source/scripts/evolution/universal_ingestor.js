#!/usr/bin/env node
/**
 * 🦾 Universal Data Ingestor v1.1
 * Wrapper for the Python Kreuzberg engine.
 */
const { execSync } = require('child_process');
const path = require('path');

const ENGINE_PATH = path.join(__dirname, 'universal_ingestor.py');

async function ingestFile(filePath) {
    console.log(`[Bridge] Calling Python Ingestor for ${filePath}...`);
    try {
        const output = execSync(`python3 ${ENGINE_PATH} "${path.resolve(filePath)}"`, { encoding: 'utf8' });
        console.log(output);
        return output;
    } catch (e) {
        console.error(`[Bridge] Ingestion Error: ${e.message}`);
        throw e;
    }
}

if (require.main === module) {
    const file = process.argv[2];
    if (!file) {
        console.log("Usage: node universal_ingestor.js <file_path>");
        process.exit(1);
    }
    ingestFile(file);
}

module.exports = { ingestFile };
