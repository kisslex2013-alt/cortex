const { ConfigGuardian } = require('./nexus_core');

async function runGuardian() {
    const guardian = new ConfigGuardian();
    console.log("🛡️ ConfigGuardian: Checking openclaw.json integrity...");
    
    const status = await guardian.validate();
    if (status.status === 'ok') {
        console.log("✅ Config is valid.");
        const backupPath = await guardian.backup();
        console.log(`📦 Backup created: ${backupPath}`);
    } else {
        console.error(`❌ CRITICAL: Config invalid or missing! Error: ${status.error || status.msg}`);
        // In a real scenario, we could try to restore the last valid backup here
    }
}

runGuardian();
