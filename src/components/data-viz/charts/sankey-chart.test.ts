import { describe, it, expect } from 'vitest';
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
} from 'd3-sankey';
import type { SankeyData } from '@/lib/charts/sankey';

/**
 * Unit tests for the Sankey chart layout logic.
 * Tests the d3-sankey integration and data processing that powers the component.
 */

const SAMPLE_DATA: SankeyData = {
  nodes: [
    { id: 'A', name: 'A', value: 30 },
    { id: 'B', name: 'B', value: 15 },
    { id: 'C', name: 'C', value: 25 },
  ],
  links: [
    { source: 'A', target: 'B', value: 10 },
    { source: 'A', target: 'C', value: 20 },
    { source: 'B', target: 'C', value: 5 },
  ],
};

describe('SankeyChart layout computation', () => {
  it('computes valid node positions from SankeyData', () => {
    const generator = d3Sankey<{ id: string; name: string; value: number }, { source: string; target: string; value: number }>()
      .nodeId((d) => d.id)
      .nodeWidth(20)
      .nodePadding(16)
      .extent([[0, 0], [600, 400]]);

    const graph = generator({
      nodes: SAMPLE_DATA.nodes.map((n) => ({ ...n })),
      links: SAMPLE_DATA.links.map((l) => ({ ...l })),
    });

    expect(graph.nodes.length).toBe(3);
    for (const node of graph.nodes) {
      expect(node.x0).toBeDefined();
      expect(node.x1).toBeDefined();
      expect(node.y0).toBeDefined();
      expect(node.y1).toBeDefined();
      expect(node.x1! - node.x0!).toBe(20); // nodeWidth
      expect(node.y1!).toBeGreaterThan(node.y0!); // has height
    }
  });

  it('computes valid link paths', () => {
    const generator = d3Sankey<{ id: string; name: string; value: number }, { source: string; target: string; value: number }>()
      .nodeId((d) => d.id)
      .nodeWidth(20)
      .nodePadding(16)
      .extent([[0, 0], [600, 400]]);

    const graph = generator({
      nodes: SAMPLE_DATA.nodes.map((n) => ({ ...n })),
      links: SAMPLE_DATA.links.map((l) => ({ ...l })),
    });

    const pathGenerator = sankeyLinkHorizontal();

    for (const link of graph.links) {
      const path = pathGenerator(link as never);
      expect(path).toBeTruthy();
      expect(path).toContain('M'); // SVG path starts with M
      expect(path).toContain('C'); // Contains cubic bezier curves
      expect(link.width).toBeGreaterThan(0);
    }
  });

  it('handles single link correctly', () => {
    const data: SankeyData = {
      nodes: [
        { id: 'X', name: 'X', value: 100 },
        { id: 'Y', name: 'Y', value: 100 },
      ],
      links: [{ source: 'X', target: 'Y', value: 100 }],
    };

    const generator = d3Sankey<{ id: string; name: string; value: number }, { source: string; target: string; value: number }>()
      .nodeId((d) => d.id)
      .nodeWidth(20)
      .nodePadding(16)
      .extent([[0, 0], [600, 400]]);

    const graph = generator({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ ...l })),
    });

    expect(graph.nodes.length).toBe(2);
    expect(graph.links.length).toBe(1);
    expect(graph.links[0].width).toBeGreaterThan(0);
  });

  it('positions source nodes to the left of target nodes', () => {
    const generator = d3Sankey<{ id: string; name: string; value: number }, { source: string; target: string; value: number }>()
      .nodeId((d) => d.id)
      .nodeWidth(20)
      .nodePadding(16)
      .extent([[0, 0], [600, 400]]);

    const graph = generator({
      nodes: SAMPLE_DATA.nodes.map((n) => ({ ...n })),
      links: SAMPLE_DATA.links.map((l) => ({ ...l })),
    });

    // Node A is only a source, should be leftmost
    const nodeA = graph.nodes.find((n) => n.id === 'A');
    const nodeC = graph.nodes.find((n) => n.id === 'C');

    expect(nodeA).toBeDefined();
    expect(nodeC).toBeDefined();
    expect(nodeA!.x0!).toBeLessThan(nodeC!.x0!);
  });

  it('handles up to 20 nodes without error', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `N${i}`,
      name: `Node ${i}`,
      value: 10,
    }));

    // Create a chain of links
    const links = Array.from({ length: 19 }, (_, i) => ({
      source: `N${i}`,
      target: `N${i + 1}`,
      value: 10,
    }));

    const generator = d3Sankey<{ id: string; name: string; value: number }, { source: string; target: string; value: number }>()
      .nodeId((d) => d.id)
      .nodeWidth(20)
      .nodePadding(16)
      .extent([[0, 0], [800, 600]]);

    const graph = generator({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    });

    expect(graph.nodes.length).toBe(20);
    expect(graph.links.length).toBe(19);
  });

  it('link widths are proportional to values', () => {
    const generator = d3Sankey<{ id: string; name: string; value: number }, { source: string; target: string; value: number }>()
      .nodeId((d) => d.id)
      .nodeWidth(20)
      .nodePadding(16)
      .extent([[0, 0], [600, 400]]);

    const graph = generator({
      nodes: SAMPLE_DATA.nodes.map((n) => ({ ...n })),
      links: SAMPLE_DATA.links.map((l) => ({ ...l })),
    });

    // Link A→C (value 20) should be wider than A→B (value 10)
    const linkAC = graph.links.find(
      (l) => (l.source as { id: string }).id === 'A' && (l.target as { id: string }).id === 'C',
    );
    const linkAB = graph.links.find(
      (l) => (l.source as { id: string }).id === 'A' && (l.target as { id: string }).id === 'B',
    );

    expect(linkAC).toBeDefined();
    expect(linkAB).toBeDefined();
    expect(linkAC!.width!).toBeGreaterThan(linkAB!.width!);
  });
});

describe('SankeyChart color assignment', () => {
  it('assigns colors from palette by node index', () => {
    const palette = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B'];

    const getNodeColor = (index: number) => palette[index % palette.length];

    expect(getNodeColor(0)).toBe('#3B82F6');
    expect(getNodeColor(1)).toBe('#EF4444');
    expect(getNodeColor(2)).toBe('#10B981');
    expect(getNodeColor(3)).toBe('#F59E0B');
    // Wraps around
    expect(getNodeColor(4)).toBe('#3B82F6');
  });
});

describe('SankeyChart value formatting', () => {
  function formatValue(value: number): string {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  it('formats millions with M suffix', () => {
    expect(formatValue(5_000_000)).toBe('5.0M');
    expect(formatValue(1_500_000)).toBe('1.5M');
  });

  it('formats thousands with K suffix', () => {
    expect(formatValue(5_000)).toBe('5.0K');
    expect(formatValue(1_500)).toBe('1.5K');
  });

  it('formats small numbers with locale string', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue(999)).toBe('999');
  });
});
