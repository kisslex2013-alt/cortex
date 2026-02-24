const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * ConfigGuardian - protects openclaw.json from corruption and version drift.
 */
class ConfigGuardian {
    constructor(configPath = '/root/.openclaw/openclaw.json') {
        this.configPath = configPath;
        this.backupDir = '/root/.openclaw/config-backups';
    }

    async validate() {
        if (!fs.existsSync(this.configPath)) return { status: 'error', msg: 'Config not found' };
        try {
            const raw = fs.readFileSync(this.configPath, 'utf8');
            JSON.parse(raw); // Check JSON validity
            return { status: 'ok' };
        } catch (e) {
            return { status: 'invalid', error: e.message };
        }
    }

    async backup() {
        if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.backupDir, `openclaw-${ts}.json.bak`);
        fs.copyFileSync(this.configPath, backupPath);
        
        // Keep last 10
        const files = fs.readdirSync(this.backupDir).sort().reverse();
        files.slice(10).forEach(f => fs.unlinkSync(path.join(this.backupDir, f)));
        
        return backupPath;
    }
}

/**
 * SecretVault - AES-256-GCM encrypted storage for seeds and keys.
 */
class SecretVault {
    constructor(vaultPath = '/root/.openclaw/vault/secrets.enc') {
        this.vaultPath = vaultPath;
        this.algorithm = 'aes-256-gcm';
    }

    encrypt(data, password) {
        const salt = crypto.randomBytes(64);
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, key, iv);
        const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
    }

    decrypt(ciphertextBase64, password) {
        const bData = Buffer.from(ciphertextBase64, 'base64');
        const salt = bData.slice(0, 64);
        const iv = bData.slice(64, 80);
        const tag = bData.slice(80, 96);
        const text = bData.slice(96);
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
        const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(text), decipher.final()]).toString('utf8');
    }
}

// Hashline Stub (Dependency restored for compatibility)
const hashline = {
    init: async () => {},
    commit: async (intent, decision, context) => 'hashline-stub-00000000000000000000'
};

// Module export for Jarvis skills

module.exports = { ConfigGuardian, SecretVault, hashline };
