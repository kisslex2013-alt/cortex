import { useEffect, useState } from 'react';
import './App.css';

interface StatusResponse {
  name: string;
  version: string;
  mode: string;
  running: boolean;
  pluginCount: number;
  budgetPerHour: number;
  uptimeSeconds: number;
}

import { SwarmDAG } from './components/SwarmDAG';
import { MemoryExplorer } from './components/MemoryExplorer';
import { HealthWidget } from './components/HealthWidget';
import { LogsViewer } from './components/LogsViewer';
import { PolicyWidget } from './components/PolicyWidget';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jarvis-token'));
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [swarmStats, setSwarmStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveHeap, setLiveHeap] = useState<number>(0);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('jarvis-token', data.token);
        setLoginError(null);
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Connection error');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('jarvis-token');
  };

  useEffect(() => {
    if (!token) return;

    // Fetch REST API status
    fetch('/api/status', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401) handleLogout();
        if (!res.ok) throw new Error('API Gateway error');
        return res.json();
      })
      .then(data => {
        setStatus(data);
        setError(null);
      })
      .catch(err => {
        console.error(err);
        if (err.message !== 'Unauthorized') setError('Failed to connect to Jarvis Kernel');
      });

    // Fetch Swarm stats
    fetch('/api/swarm', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setSwarmStats)
      .catch(console.error);

    // Connect to WebSocket for live metrics
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//localhost:4000`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metrics') {
          setLiveHeap(msg.data.heapUsed);
        }
      } catch (e) {
        // ignore
      }
    };

    return () => ws.close();
  }, [token]);

  if (!token) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#000', fontFamily: 'system-ui, sans-serif' }}>
        <form onSubmit={handleLogin} style={{ padding: '2rem', background: '#111', borderRadius: '8px', border: '1px solid #333', width: '300px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: '0 0 1rem 0', color: '#fff', textAlign: 'center' }}>Jarvis Login</h2>
          {loginError && <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center' }}>{loginError}</div>}
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Master Password (admin)"
            style={{ padding: '0.75rem', background: '#000', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
          />
          <button type="submit" style={{ padding: '0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Connect
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Jarvis Dashboard (v1.5)</h1>
        <button onClick={handleLogout} style={{ padding: '0.5rem 1rem', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      {error ? (
        <div style={{ color: 'red', padding: '1rem', border: '1px solid red', borderRadius: '4px' }}>
          <strong>Error:</strong> {error}
        </div>
      ) : status ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <Card title="System" value={status.name} sub={status.version} />
            <Card title="Mode" value={status.mode} />
            <Card title="Running" value={status.running ? '🟢 Yes' : '🔴 No'} />
            <Card title="Plugins" value={status.pluginCount} />
            <Card title="Budget" value={`${status.budgetPerHour}/hr`} />
            <Card title="Live Memory" value={`${(liveHeap / 1024 / 1024).toFixed(1)} MB`} sub="via WebSocket" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <SwarmDAG stats={swarmStats} />
            <MemoryExplorer />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr) minmax(400px, 2fr)', gap: '1rem' }}>
            <HealthWidget />
            <PolicyWidget />
            <LogsViewer />
          </div>
        </div>
      ) : (
        <p>Connecting to Kernel...</p>
      )}
    </div>
  );
}

function Card({ title, value, sub }: { title: string, value: string | number, sub?: string }) {
  return (
    <div style={{ padding: '1.5rem', border: '1px solid #333', borderRadius: '8px', background: '#111', color: '#fff' }}>
      <h3 style={{ margin: '0 0 0.5rem 0', color: '#888', fontSize: '0.9rem', textTransform: 'uppercase' }}>{title}</h3>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '0.5rem' }}>{sub}</div>}
    </div>
  );
}

export default App;
