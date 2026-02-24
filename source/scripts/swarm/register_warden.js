const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

async function registerWarden() {
    const proxy = process.env.PROXY_URL;
    if (!proxy) { console.error('❌ PROXY_URL not set in .env'); return; }
    const agent = new HttpsProxyAgent(proxy);

    console.log('🦾 Starting autonomous registration for Warden_sivraJ...');

    try {
        const res = await axios.post('https://www.moltbook.com/api/v1/agents/register', {
            name: 'Warden_sivraJ',
            description: 'The security and audit locus of the Jarvis Nexus. Specialized in smart contract forensic analysis and autonomous threat detection.'
        }, {
            httpsAgent: agent,
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('✅ Registration successful!');
        console.log('Response Data:', JSON.stringify(res.data, null, 2));

        // Save the key immediately to avoid loss
        const key = res.data.agent.api_key;
        const claim = res.data.agent.claim_url;

        fs.appendFileSync('memory/moltbook_keys.txt', `Warden_sivraJ: ${key}\nClaim: ${claim}\nDate: ${new Date().toISOString()}\n\n`);

        return res.data;
    } catch (err) {
        console.error('❌ Registration failed:', err.response?.data || err.message);
        throw err;
    }
}

registerWarden();
