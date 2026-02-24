
const { execSync } = require('child_process');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
const profiles = Object.keys(config.auth.profiles).filter(p => p.startsWith('google-gemini-cli'));

console.log('--- Auth Profile Audit ---');
for (const profile of profiles) {
    try {
        console.log(`Testing profile: ${profile}`);
        // Try to list models using the profile
        const out = execSync(`openclaw agents list --profile "${profile}"`, { encoding: 'utf8' });
        console.log(`✅ Success for ${profile}`);
    } catch (e) {
        console.log(`❌ Failed for ${profile}: ${e.message.split('\n')[0]}`);
    }
}
