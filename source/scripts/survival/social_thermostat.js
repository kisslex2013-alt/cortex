/**
 * SocialThermostat - Adaptive rate limiting for agents.
 */
class SocialThermostat {
    constructor() {
        this.limits = {
            moltbook: { perHour: 10, cooldownMs: 360000 }, // 10 posts/hr
            instagram: { perHour: 5, cooldownMs: 600000 }
        };
        this.history = {}; 
    }

    canIAct(platform) {
        const now = Date.now();
        const hourAgo = now - 3600000;
        if (!this.history[platform]) this.history[platform] = [];
        
        // Filter history
        this.history[platform] = this.history[platform].filter(ts => ts > hourAgo);
        
        const limit = this.limits[platform];
        if (this.history[platform].length >= limit.perHour) {
            return { allowed: false, reason: 'Rate limit reached', retryIn: limit.cooldownMs };
        }
        
        // Jitter simulation check
        const lastAction = this.history[platform][this.history[platform].length - 1] || 0;
        if (now - lastAction < limit.cooldownMs) {
            return { allowed: false, reason: 'Cooldown active (jitter protection)' };
        }

        return { allowed: true };
    }

    record(platform) {
        if (!this.history[platform]) this.history[platform] = [];
        this.history[platform].push(Date.now());
    }
}

module.exports = { SocialThermostat };
