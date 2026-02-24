#!/usr/bin/env node
// scripts/reflexes/skill_auditor_reflex.js
// 🦾 Jarvis Reflex: Skill Auditor
// Scans installed skills for malicious patterns (AmosStealer, credential leaks).

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = process.argv[2] || path.join(process.cwd(), 'skills');
const BLACKLIST_PATTERNS = [
    /curl.*\.sh.*\|.*sh/i,           // Remote script execution
    /eval\(base64_decode/i,          // Obfuscated code
    /private_key/i,                  // Potential key theft
    /mnemonic/i,                     // Potential seed theft
    /env\.TG_BOT_TOKEN/i             // Potential token theft
];

function audit() {
    console.log("🛡️ Starting Skill Security Audit...");
    const skills = fs.readdirSync(SKILLS_DIR).filter(f => fs.statSync(path.join(SKILLS_DIR, f)).isDirectory());
    
    let issues = 0;
    skills.forEach(skill => {
        const skillPath = path.join(SKILLS_DIR, skill);
        const files = getAllFiles(skillPath);
        
        files.forEach(file => {
            if (file.endsWith('.js') || file.endsWith('.sh') || file.endsWith('.md')) {
                const content = fs.readFileSync(file, 'utf8');
                BLACKLIST_PATTERNS.forEach(pattern => {
                    if (pattern.test(content)) {
                        console.warn(`⚠️ ALERT: Potential risk in skill [${skill}]: file ${path.basename(file)} matches pattern ${pattern}`);
                        issues++;
                    }
                });
            }
        });
    });

    if (issues === 0) {
        console.log("✅ Audit Complete: No malicious patterns detected in local skills.");
    } else {
        console.log(`❌ Audit Complete: Found ${issues} potential security issues.`);
    }
}

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) {
            if (file !== 'node_modules') getAllFiles(name, fileList);
        } else {
            fileList.push(name);
        }
    });
    return fileList;
}

audit();
