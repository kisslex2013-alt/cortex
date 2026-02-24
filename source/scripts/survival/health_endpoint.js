#!/usr/bin/env node
/**
 * 🏥 Health Endpoint v1.0 — HTTP Status Monitor
 * Minimal HTTP server for external monitoring (UptimeRobot, etc.)
 * 
 * Runs on port 9090 by default (configurable via JARVIS_HEALTH_PORT).
 * GET /health → JSON system status
 * 
 * Usage:
 *   node scripts/survival/health_endpoint.js &
 */
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.JARVIS_HEALTH_PORT || '9090', 10);
const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../');
const START_TIME = Date.now();

function getVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        return pkg.version || 'unknown';
    } catch { return 'unknown'; }
}

function getTokenStats() {
    try {
        const statsPath = path.join(ROOT, 'memory/token_stats.json');
        if (fs.existsSync(statsPath)) {
            return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        }
    } catch { }
    return { today: 0, total: 0 };
}

function getHealthData() {
    const mem = process.memoryUsage();
    return {
        status: 'OK',
        version: getVersion(),
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        uptimeHuman: formatUptime(Date.now() - START_TIME),
        system: {
            platform: os.platform(),
            cpuLoad: os.loadavg()[0].toFixed(2),
            totalMemMB: Math.floor(os.totalmem() / 1024 / 1024),
            freeMemMB: Math.floor(os.freemem() / 1024 / 1024),
            processMemMB: Math.floor(mem.rss / 1024 / 1024)
        },
        tokenStats: getTokenStats(),
        timestamp: new Date().toISOString()
    };
}

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        const data = getHealthData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. Use GET /health' }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 Health endpoint running on http://0.0.0.0:${PORT}/health`);
});

module.exports = { getHealthData, server };
