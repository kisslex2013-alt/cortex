import { useState, useEffect } from 'react';

interface MemoryStat {
    totalFacts: number;
    byCategory: Record<string, number>;
    dbSizeBytes: number;
}

interface SearchResult {
    fact: {
        id: string;
        content: string;
        category: string;
        confidence: string;
        source: string;
    };
    relevance: number;
}

export function MemoryExplorer() {
    const [stats, setStats] = useState<MemoryStat | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);

    useEffect(() => {
        fetch('/api/memory/stats')
            .then(res => res.json())
            .then(setStats)
            .catch(console.error);
    }, []);

    const handleSearch = async () => {
        if (!query.trim()) return;
        try {
            const res = await fetch(`/api/memory/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            setResults(data);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div style={{ padding: '1rem', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#888' }}>Memory Explorer</h3>

            {stats && (
                <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#aaa', display: 'flex', gap: '1rem' }}>
                    <span>Total Facts: <strong>{stats.totalFacts}</strong></span>
                    <span>DB Size: <strong>{stats.dbSizeBytes}B</strong></span>
                    <span>Categories: <strong>{Object.keys(stats.byCategory).length}</strong></span>
                </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                    style={{ flex: 1, padding: '0.5rem', background: '#000', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search memory..."
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button
                    onClick={handleSearch}
                    style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Search
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {results.map(r => (
                    <div key={r.fact.id} style={{ padding: '0.75rem', background: '#222', borderRadius: '6px', fontSize: '0.9rem' }}>
                        <div style={{ color: '#0ea5e9', marginBottom: '0.25rem', fontFamily: 'monospace' }}>{r.fact.id}</div>
                        <div style={{ color: '#ccc', marginBottom: '0.5rem' }}>{r.fact.content}</div>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#666' }}>
                            <span>Relevance: {(r.relevance * 100).toFixed(0)}%</span>
                            <span>Conf: {r.fact.confidence}</span>
                            <span>Src: {r.fact.source}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
