#!/usr/bin/env node
/**
 * 🔒 Sandbox Preload v1.0 — Mandatory fs Enforcement
 * 
 * Monkey-patches Node.js `fs` module to route ALL write operations
 * through sandbox_guard.js checks automatically.
 * 
 * Usage: node --require ./scripts/survival/sandbox_preload.js your_script.js
 * 
 * This ensures no script can bypass sandbox by using fs.writeFileSync directly.
 */
const fs = require('fs');
const path = require('path');

// Load sandbox guard
let sandbox;
try {
    sandbox = require(path.resolve(__dirname, 'sandbox_guard.js'));
} catch (e) {
    console.error('[SandboxPreload] Failed to load sandbox_guard.js:', e.message);
    process.exit(1);
}

// Store original functions
const _originalWriteFileSync = fs.writeFileSync;
const _originalAppendFileSync = fs.appendFileSync;
const _originalRenameSync = fs.renameSync;
const _originalUnlinkSync = fs.unlinkSync;

// Patch writeFileSync
fs.writeFileSync = function (filePath, data, options) {
    const check = sandbox.checkPath(filePath);
    if (!check.allowed) {
        const err = new Error(`[SandboxPreload] Write BLOCKED: ${check.reason} (${filePath})`);
        console.error(`🔒 ${err.message}`);
        throw err;
    }
    return _originalWriteFileSync.call(fs, filePath, data, options);
};

// Patch appendFileSync
fs.appendFileSync = function (filePath, data, options) {
    const check = sandbox.checkPath(filePath);
    if (!check.allowed) {
        const err = new Error(`[SandboxPreload] Append BLOCKED: ${check.reason} (${filePath})`);
        console.error(`🔒 ${err.message}`);
        throw err;
    }
    return _originalAppendFileSync.call(fs, filePath, data, options);
};

// Patch renameSync
fs.renameSync = function (oldPath, newPath) {
    const checkOld = sandbox.checkPath(oldPath);
    const checkNew = sandbox.checkPath(newPath);
    if (!checkOld.allowed) {
        throw new Error(`[SandboxPreload] Rename source BLOCKED: ${checkOld.reason}`);
    }
    if (!checkNew.allowed) {
        throw new Error(`[SandboxPreload] Rename dest BLOCKED: ${checkNew.reason}`);
    }
    return _originalRenameSync.call(fs, oldPath, newPath);
};

// Patch unlinkSync
fs.unlinkSync = function (filePath) {
    const check = sandbox.checkPath(filePath);
    if (!check.allowed) {
        throw new Error(`[SandboxPreload] Delete BLOCKED: ${check.reason} (${filePath})`);
    }
    return _originalUnlinkSync.call(fs, filePath);
};

console.log('[SandboxPreload] 🔒 All fs write operations now enforced through sandbox_guard.');
