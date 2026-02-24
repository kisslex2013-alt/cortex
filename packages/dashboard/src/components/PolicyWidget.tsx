import { useState, useEffect } from 'react';

interface PendingAction {
    id: string;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    operation: string;
    target: string;
    reason: string;
}

export function PolicyWidget({ token }: { token: string }) {
    const [actions, setActions] = useState<PendingAction[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/policy/pending', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(setActions)
            .catch(console.error);
    }, []);

    const handleApprove = async (id: string) => {
        setLoading(true);
        try {
            await fetch(`/api/policy/approve/${id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setActions(prev => prev.filter(a => a.id !== id));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleReject = (id: string) => {
        setActions(prev => prev.filter(a => a.id !== id));
    };

    return (
        <div style={{ padding: '1rem', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#888' }}>Policy Approvals</h3>
                {actions.length > 0 && (
                    <span style={{ padding: '0.2rem 0.5rem', background: '#ef4444', color: '#fff', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {actions.length} Pending
                    </span>
                )}
            </div>

            {actions.length === 0 ? (
                <div style={{ color: '#555', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
                    No pending actions requiring approval.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {actions.map(action => (
                        <div key={action.id} style={{
                            padding: '0.75rem',
                            background: '#222',
                            borderRadius: '6px',
                            borderLeft: `4px solid ${action.risk === 'HIGH' ? '#ef4444' : '#f59e0b'}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <strong style={{ color: '#eee' }}>{action.operation}</strong>
                                <span style={{ fontSize: '0.8rem', color: action.risk === 'HIGH' ? '#ef4444' : '#f59e0b' }}>
                                    {action.risk} RISK
                                </span>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>
                                Target: <span style={{ color: '#0ea5e9', fontFamily: 'monospace' }}>{action.target}</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.75rem' }}>
                                <i>{action.reason}</i>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => handleApprove(action.id)}
                                    disabled={loading}
                                    style={{ flex: 1, padding: '0.4rem', background: '#10b981', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    Approve
                                </button>
                                <button
                                    onClick={() => handleReject(action.id)}
                                    disabled={loading}
                                    style={{ flex: 1, padding: '0.4rem', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
