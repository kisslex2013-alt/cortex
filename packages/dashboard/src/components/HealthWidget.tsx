import { useState, useEffect } from 'react';

interface DoctorReport {
    summary: {
        passed: number;
        failed: number;
        total: number;
        overallStatus: 'healthy' | 'degraded' | 'critical';
    };
    results: Record<string, { passed: boolean; details: string }>;
}

export function HealthWidget() {
    const [report, setReport] = useState<DoctorReport | null>(null);

    useEffect(() => {
        fetch('/api/doctor')
            .then(res => res.json())
            .then(setReport)
            .catch(console.error);
    }, []);

    if (!report) return (
        <div style={{ padding: '1rem', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#888' }}>Health Diagnostics</h3>
            <p>Loading...</p>
        </div>
    );

    const isHealthy = report.summary.overallStatus === 'healthy';

    return (
        <div style={{ padding: '1rem', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#888' }}>Health Diagnostics</h3>
                <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    background: isHealthy ? '#064e3b' : '#7f1d1d',
                    color: isHealthy ? '#34d399' : '#f87171'
                }}>
                    {report.summary.overallStatus.toUpperCase()}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {Object.entries(report.results).map(([level, res]) => (
                    <div key={level} style={{ padding: '0.5rem', background: '#222', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#ccc', textTransform: 'capitalize' }}>{level}</span>
                        <span>{res.passed ? '✅' : '❌'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
