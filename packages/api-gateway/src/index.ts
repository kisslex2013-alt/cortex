import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { createKernel } from '@jarvis/core';
import { SelfCheck, ContextHealthMonitor, HealthDashboard } from '@jarvis/watchdog';

// Initialize Jarvis core objects
const kernel = createKernel({ mode: 'auto' });
kernel.start().catch(console.error);

const dashboard = new HealthDashboard(new SelfCheck(), new ContextHealthMonitor());

const app = express();
app.use(cors());

// --- REST API ---

app.get('/api/status', async (req: Request, res: Response) => {
    const config = kernel.getConfig();
    const isRunning = kernel.isRunning();

    // Demo metrics for now
    res.json({
        name: config.name,
        version: config.version,
        mode: config.mode,
        running: isRunning,
        pluginCount: kernel.getPluginNames().length,
        budgetPerHour: config.tokenBudget.maxPerHour,
        uptimeSeconds: process.uptime()
    });
});

app.get('/api/health', (req: Request, res: Response) => {
    // Generate a health report
    const report = dashboard.getFullReport({
        currentTokens: 5000,
        contextVersions: [],
        memoryUsedBytes: process.memoryUsage().heapUsed,
        memoryLimitBytes: 1024 * 1024 * 512,
    });
    res.json(report);
});

import { createSwarm } from '@jarvis/swarm';
import { LongMemory } from '@jarvis/memory';

app.get('/api/swarm', (req: Request, res: Response) => {
    const coordinator = createSwarm('status-check');
    res.json(coordinator.stats());
});

app.get('/api/memory/search', (req: Request, res: Response) => {
    const mem = new LongMemory();
    const query = req.query.q as string || '';
    res.json(mem.search(query, 10));
});

app.post('/api/auth', express.json(), (req: Request, res: Response) => {
    // В MVP: простая мок-авторизация без реальной привязки к ключам ядра
    const { password } = req.body;
    if (password === 'admin') {
        res.json({ token: 'mock-jwt-token-123', user: 'admin' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/memory/stats', (req: Request, res: Response) => {
    const mem = new LongMemory();
    res.json(mem.stats());
});

app.get('/api/policy/pending', (req: Request, res: Response) => {
    res.json([
        { id: 'act_101', risk: 'HIGH', operation: 'file_delete', target: 'src/core/auth.ts', reason: 'Deleting core authentication module' },
        { id: 'act_102', risk: 'MEDIUM', operation: 'system_modify', target: 'process.env', reason: 'Modifying environment variables' }
    ]);
});

app.post('/api/policy/approve/:id', (req: Request, res: Response) => {
    // В MVP: просто возвращаем success
    res.json({ success: true, id: req.params.id, status: 'approved' });
});

app.get('/api/doctor', async (req: Request, res: Response) => {
    const sc = new SelfCheck();
    const result = await sc.runAll({
        syntax: async () => ({ passed: true, details: 'OK' }),
        execution: async () => ({ passed: true, details: 'OK' }),
        api: async () => ({ passed: true, details: 'OK' }),
        logic: async () => ({ passed: true, details: 'OK' })
    });
    res.json(result);
});

// --- WebSocket API ---

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
    console.log('[WS] Client connected');

    // Interval for metrics
    const metricsInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'metrics',
                data: {
                    timestamp: Date.now(),
                    heapUsed: process.memoryUsage().heapUsed,
                }
            }));
        }
    }, 2000);

    // Mock logs simulation instead of hooking into core events for this sprint
    const logsInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            const levels = ['INFO', 'WARN', 'DEBUG'];
            const level = levels[Math.floor(Math.random() * levels.length)];
            ws.send(JSON.stringify({
                type: 'log',
                data: {
                    timestamp: new Date().toISOString(),
                    level,
                    message: `System event: ${Math.random().toString(36).substring(7)} processed.`
                }
            }));
        }
    }, 3000);

    ws.on('close', () => {
        console.log('[WS] Client disconnected');
        clearInterval(metricsInterval);
        clearInterval(logsInterval);
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server listening on ws://localhost:${PORT}`);
});
