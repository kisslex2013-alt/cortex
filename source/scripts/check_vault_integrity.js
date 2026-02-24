const { SecretVault } = require('./survival/nexus_core.js');
const fs = require('fs');

async function checkVault() {
    const vault = new SecretVault();
    const password = process.env.VAULT_PASSWORD || 'default_test_pass'; // I don't have the real password, this is just to see if it even tries to decrypt

    if (fs.existsSync(vault.vaultPath)) {
        const encrypted = fs.readFileSync(vault.vaultPath, 'utf8');
        console.log(`Vault found. Length: ${encrypted.length}`);
        // We cannot decrypt without the password, but we know it exists.
    } else {
        console.log("Vault file missing.");
    }
}
checkVault();
