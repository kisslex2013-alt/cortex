const { SecretVault } = require('./survival/nexus_core.js');
const fs = require('fs');

async function testVault() {
    const vault = new SecretVault();
    if (fs.existsSync(vault.vaultPath)) {
        const stats = fs.statSync(vault.vaultPath);
        console.log(`Vault exists: ${vault.vaultPath} (${stats.size} bytes)`);
    } else {
        console.log("Vault does not exist.");
    }
}
testVault();
