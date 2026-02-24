const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 📂 MEMORY GUARDIAN
 * Ensures that anchor memory files (MEMORY.md, SOUL.md) 
 * cannot be deleted by automated processes.
 */
class MemoryGuardian {
    constructor(workspaceDir = '/root/.openclaw/workspace') {
        this.workspace = workspaceDir;
        this.anchorFile = path.join(this.workspace, 'MEMORY.md');
        this.memoryDir = path.join(this.workspace, 'memory');
    }

    async isAnchor(filePath) {
        if (filePath.endsWith('MEMORY.md') || filePath.endsWith('SOUL.md')) return true;
        try {
            const content = fs.readFileSync(this.anchorFile, 'utf8');
            const fileName = path.basename(filePath);
            return content.includes(fileName) && content.includes('[ANCHOR]');
        } catch (e) {
            return false;
        }
    }

    async safePrune(fileName, reason) {
        const filePath = path.join(this.memoryDir, fileName);

        if (!fs.existsSync(filePath)) {
            throw new Error(`[MEM_GUARDIAN] File ${fileName} not found.`);
        }

        if (await this.isAnchor(filePath)) {
            throw new Error(`[MEM_GUARDIAN] Cannot prune ANCHOR memory "${fileName}".`);
        }

        const proof = crypto.createHash('sha256')
            .update(fs.readFileSync(filePath))
            .digest('hex').slice(0, 16);

        fs.unlinkSync(filePath);
        console.log(`[MEM_GUARDIAN] Pruned ${fileName} (reason: ${reason}, proof: ${proof})`);
        return proof;
    }

    async safeCrystallize(sourceFiles, targetWisdom) {
        console.log(`[MEM_GUARDIAN] Crystallize ${sourceFiles.length} files → ${targetWisdom}`);
        return 'ok';
    }
}

module.exports = new MemoryGuardian();
