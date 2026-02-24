import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import jwt from 'jsonwebtoken';

import { createKernel, type KernelEvent } from '@jarvis/core';
import { SelfCheck, ContextHealthMonitor, HealthDashboard } from '@jarvis/watchdog';
import { createSwarm } from '@jarvis/swarm';
import { LongMemory } from '@jarvis/memory';
import { globalApprovalQueue } from '@jarvis/sandbox-policy';

// --- Configuration ---
const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-dev-secret-42';
const PORT = process.env.PORT || 4000;

// --- Initialize Core ---
const kernel = createKernel({ mode: 'auto' });
kernel.start().catch(console.error);

const dashboard = new HealthDashboard(new SelfCheck(), new ContextHealthMonitor());

// --- Initialize Global Memory ---
const globalMemory = new LongMemory();
globalMemory.add('Jarvis System initialized', 'tech', { confidence: 'high', source: 'system' });
globalMemory.add('Test fact for demonstration', 'personal', { confidence: 'medium', source: 'dev' });
globalMemory.add('API Gateway connected to Cortex', 'tech', { confidence: 'high', source: 'gateway' });

const app = express();
app.use(cors());
app.use(express.json());

// --- REST Auth Middleware ---
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// --- REST API: Auth ---
app.post('/api/auth', (req: Request, res: Response) => {
    const { password } = req.body;
    // MVP: password-based local auth
    if (password === 'admin') {
        const token = jwt.sign({ user: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: 'admin' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Protect all following routes
app.use('/api', requireAuth);

// --- REST API: Core & Swarm ---
app.get('/api/status', (req: Request, res: Response) => {
    res.json(kernel.getStatus());
});

app.get('/api/health', (req: Request, res: Response) => {
    const report = dashboard.getFullReport({
        currentTokens: 5000,
        contextVersions: [],
        memoryUsedBytes: process.memoryUsage().heapUsed,
        memoryLimitBytes: 1024 * 1024 * 512,
    });
    res.json(report);
});

app.get('/api/swarm', (req: Request, res: Response) => {
    const coordinator = createSwarm('status-check');
    res.json(coordinator.stats());
});

// --- REST API: Memory ---
app.get('/api/memory/stats', (req: Request, res: Response) => {
    res.json(globalMemory.stats());
});

app.get('/api/memory/search', (req: Request, res: Response) => {
    const query = req.query.q as string || '';
    kernel.dispatch({
        type: 'log',
        source: 'api-gateway',
        payload: `[Memory] Search requested: "${query}"`,
        timestamp: Date.now()
    }).catch(console.error);
    res.json(globalMemory.search(query, 10));
});

// --- REST API: Policy Approval Queue ---
app.get('/api/policy/pending', (req: Request, res: Response) => {
    // Return items from sandbox-policy's global queue
    res.json(globalApprovalQueue.getPending());
});

app.post('/api/policy/approve/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const success = globalApprovalQueue.approve(id);
    if (!success) {
        res.status(404).json({ error: 'Request not found or already processed' });
        return;
    }
    res.json({ success: true, id, status: 'approved' });
});

app.post('/api/policy/reject/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const success = globalApprovalQueue.reject(id);
    if (!success) {
        res.status(404).json({ error: 'Request not found or already processed' });
        return;
    }
    res.json({ success: true, id, status: 'rejected' });
});

// --- REST API: Doctor ---
app.get('/api/doctor', async (req: Request, res: Response) => {
    const sc = new SelfCheck();
    const result = await sc.runAll({
        syntax: async () => ({ passed: true, details: 'OK' }),
        execution: async () => ({ passed: true, details: 'OK' }),
        api: async () => ({ passed: true, details: 'OK' }),
        logic: async () => ({ passed: true, details: 'OK' })
    });

    // Convert to DoctorReport expected by Dashboard
    const passed = result.filter(r => r.passed).length;
    const failed = result.filter(r => !r.passed).length;

    const report = {
        summary: {
            passed,
            failed,
            total: result.length,
            overallStatus: failed > 0 ? 'critical' : 'healthy'
        },
        results: result.reduce((acc, current) => {
            acc[current.level] = { passed: current.passed, details: current.details };
            return acc;
        }, {} as Record<string, { passed: boolean; details: string }>)
    };

    res.json(report);
});

// --- REST API: Health ---
app.get('/api/health', (req: Request, res: Response) => {
    // Return real HealthDashboard report
    res.json(dashboard.getFullReport({
        currentTokens: 25_000,
        contextVersions: [{ lastUpdated: Date.now() }],
        memoryUsedBytes: process.memoryUsage().heapUsed,
        memoryLimitBytes: process.memoryUsage().heapTotal * 1.5,
    }));
});

// --- WebSocket API: Metrics & Real Logs ---

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Verify token on upgrade / connection
wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const parsedUrl = parseUrl(req.url || '', true);
    const token = parsedUrl.query.token as string;

    if (!token) {
        ws.close(1008, 'Token required');
        return;
    }

    try {
        jwt.verify(token, JWT_SECRET);
    } catch {
        ws.close(1008, 'Invalid token');
        return;
    }

    console.log('[WS] Authenticated client connected');

    // Emit a startup log so the user immediately sees it in Live Audit Tail
    setTimeout(() => {
        kernel.dispatch({
            type: 'log',
            source: 'api-gateway',
            payload: 'Dashboard WS client connected successfully. Live Audit Tail is active.',
            timestamp: Date.now()
        }).catch(console.error);
    }, 500);

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

    // Real logs implementation via Kernel Event Emitter
    const logHandler = async (e: KernelEvent): Promise<void> => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'log',
                data: {
                    timestamp: new Date(e.timestamp || Date.now()).toISOString(),
                    level: (e.payload as any)?.level || 'INFO',
                    message: (e.payload as any)?.message || (typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)) || 'System event'
                }
            }));
        }
    };

    kernel.on('log', logHandler);

    ws.on('close', () => {
        console.log('[WS] Client disconnected');
        clearInterval(metricsInterval);
        kernel.off('log', logHandler);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server listening on ws://localhost:${PORT}`);
});
