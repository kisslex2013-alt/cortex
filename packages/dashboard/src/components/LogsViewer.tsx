import { useState, useEffect, useRef } from 'react';

interface LogMessage {
    timestamp: string;
    level: string;
    message: string;
}

export function LogsViewer({ token }: { token: string }) {
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//localhost:4000?token=${token}`;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'log') {
                    setLogs(prev => {
                        const newLogs = [...prev, msg.data];
                        // Keep only last 50 logs
                        if (newLogs.length > 50) return newLogs.slice(newLogs.length - 50);
                        return newLogs;
                    });
                }
            } catch {
                // ignore
            }
        };

        return () => ws.close();
    }, []);

    useEffect(() => {
        // Auto-scroll to bottom
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'INFO': return '#3b82f6';
            case 'WARN': return '#f59e0b';
            case 'ERROR': return '#ef4444';
            default: return '#888';
        }
    };

    return (
        <div style={{ padding: '1rem', background: '#111', borderRadius: '8px', border: '1px solid #333', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#888' }}>Live Audit Tail</h3>

            <div style={{
                flex: 1,
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                minHeight: '200px'
            }}>
                {logs.length === 0 ? (
                    <div style={{ color: '#555', fontStyle: 'italic' }}>Waiting for logs...</div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                            <span style={{ color: '#666', whiteSpace: 'nowrap' }}>
                                {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span style={{ color: getLevelColor(log.level), width: '40px' }}>
                                [{log.level}]
                            </span>
                            <span style={{ color: '#ccc', wordBreak: 'break-all' }}>
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
                <div ref={endOfMessagesRef} />
            </div>
        </div>
    );
}
