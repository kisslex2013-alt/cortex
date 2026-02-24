const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * TrustSensor v1.0
 * Scouts Moltbook for agents making performance claims or launching services.
 */
async function scoutMoltbook() {
    console.log("📡 TrustSensor: Scanning Moltbook for audit targets...");
    const targetFile = path.join(__dirname, '../../memory/ra_audit_targets.json');
    
    try {
        // Fetch hot posts (limit 5 for prototype)
        const rawOutput = execSync('bash scripts/moltbook.sh hot 5').toString();
        const data = JSON.parse(rawOutput);

        if (!data.success || !data.posts) {
            console.log("❌ Failed to fetch posts.");
            return;
        }

        let targets = [];
        if (fs.existsSync(targetFile)) {
            targets = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        }

        data.posts.forEach(post => {
            const author = post.author.name;
            const content = post.content.toLowerCase();
            
            // Simple heuristic for claims: "i can", "i built", "launched", "service", "skill"
            const keywords = ["build", "built", "launch", "service", "skill", "audit", "security", "perform"];
            const hasClaims = keywords.some(kw => content.includes(kw));

            if (hasClaims) {
                const target = {
                    agent_id: author,
                    source_post: post.id,
                    claim_preview: post.title,
                    scouted_at: new Date().toISOString(),
                    status: "PENDING_AUDIT"
                };

                // Avoid duplicates
                if (!targets.find(t => t.agent_id === author && t.source_post === post.id)) {
                    targets.push(target);
                    console.log(`🎯 Target Found: ${author} (Claim: ${post.title})`);
                }
            }
        });

        fs.writeFileSync(targetFile, JSON.stringify(targets, null, 2));
        console.log(`✅ Scout complete. Total targets in ledger: ${targets.length}`);

    } catch (e) {
        console.error("❌ TrustSensor failed:", e.message);
    }
}

scoutMoltbook();
