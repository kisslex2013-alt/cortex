import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface SwarmStats {
    dag: {
        total: number;
        pending: number;
        running: number;
        done: number;
        failed: number;
        cancelled: number;
    };
    budget: {
        total: number;
        spent: number;
        remaining: number;
        utilization: number;
    };
}

export function SwarmDAG({ stats }: { stats: SwarmStats | null }) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!stats || !svgRef.current) return;

        // Simple demo D3 rendering of status distribution
        const width = 400;
        const height = 200;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        svg.attr('viewBox', `0 0 ${width} ${height}`);

        const data = [
            { label: 'Pending', value: stats.dag.pending, color: '#f59e0b' },
            { label: 'Running', value: stats.dag.running, color: '#3b82f6' },
            { label: 'Done', value: stats.dag.done, color: '#10b981' },
            { label: 'Failed', value: stats.dag.failed, color: '#ef4444' },
        ];

        const x = d3.scaleBand()
            .domain(data.map(d => d.label))
            .range([0, width])
            .padding(0.2);

        const y = d3.scaleLinear()
            .domain([0, Math.max(10, d3.max(data, d => d.value) || 0)])
            .range([height - 30, 0]);

        // Bars
        svg.selectAll('rect')
            .data(data)
            .enter()
            .append('rect')
            .attr('x', d => x(d.label) || 0)
            .attr('y', d => y(d.value))
            .attr('width', x.bandwidth())
            .attr('height', d => height - 30 - y(d.value))
            .attr('fill', d => d.color);

        // Labels
        svg.selectAll('.label')
            .data(data)
            .enter()
            .append('text')
            .attr('class', 'label')
            .attr('x', d => (x(d.label) || 0) + x.bandwidth() / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', '#888')
            .text(d => d.label);

        // Values
        svg.selectAll('.value')
            .data(data)
            .enter()
            .append('text')
            .attr('class', 'value')
            .attr('x', d => (x(d.label) || 0) + x.bandwidth() / 2)
            .attr('y', d => y(d.value) - 5)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .text(d => d.value);

    }, [stats]);

    return (
        <div style={{ padding: '1rem', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#888' }}>Swarm DAG Visualization</h3>
            <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />
        </div>
    );
}
