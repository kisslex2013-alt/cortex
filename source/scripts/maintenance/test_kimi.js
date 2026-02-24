/**
 * 🧪 Kimi Cloud Connectivity Test
 * Verifies API access to Moonshot AI (Kimi) File Storage.
 */
const axios = require('axios');
require('dotenv').config();

const KIMI_TOKEN = process.env.KIMI_TOKEN;
const API_BASE = "https://api.kimi.com/coding/v1";

async function testConnection() {
    if (!KIMI_TOKEN) {
        console.error("❌ Error: KIMI_TOKEN not found in .env");
        process.exit(1);
    }

    console.log("📡 Attempting to connect to Kimi Cloud...");
    try {
        const response = await axios.get(`${API_BASE}/files`, {
            headers: {
                'Authorization': `Bearer ${KIMI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.data) {
            console.log("✅ Success! Connection established.");
            console.log(`📂 Files found: ${response.data.data.length}`);
            process.exit(0);
        } else {
            console.log("⚠️ Connection successful, but returned unexpected data format:");
            console.log(JSON.stringify(response.data, null, 2));
            process.exit(0);
        }
    } catch (error) {
        console.error("❌ Connection failed:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

testConnection();
