import { describe, it, expect } from 'vitest';
import { transformToSankey, SankeyData } from './sankey';

describe('transformToSankey', () => {
  describe('basic transformation', () => {
    it('transforms simple rows into nodes and links', () => {
      const rows = [
        { source: 'A', target: 'B', value: 10 },
        { source: 'A', target: 'C', value: 20 },
        { source: 'B', target: 'C', value: 5 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.nodes).toHaveLength(3);
      expect(result.links).toHaveLength(3);

      const nodeIds = result.nodes.map((n) => n.id).sort();
      expect(nodeIds).toEqual(['A', 'B', 'C']);

      const linkAB = result.links.find(
        (l) => l.source === 'A' && l.target === 'B',
      );
      expect(linkAB).toBeDefined();
      expect(linkAB!.value).toBe(10);
    });

    it('aggregates duplicate source-target pairs by summing values', () => {
      const rows = [
        { from: 'X', to: 'Y', amount: 10 },
        { from: 'X', to: 'Y', amount: 15 },
        { from: 'X', to: 'Y', amount: 5 },
      ];

      const result = transformToSankey(rows, 'from', 'to', 'amount');

      expect(result.links).toHaveLength(1);
      expect(result.links[0].source).toBe('X');
      expect(result.links[0].target).toBe('Y');
      expect(result.links[0].value).toBe(30);
    });

    it('deduplicates nodes from both source and target columns', () => {
      const rows = [
        { src: 'A', dst: 'B', val: 10 },
        { src: 'B', dst: 'C', val: 20 },
      ];

      const result = transformToSankey(rows, 'src', 'dst', 'val');

      // B appears in both source and target but should only be one node
      const nodeIds = result.nodes.map((n) => n.id);
      expect(nodeIds.filter((id) => id === 'B')).toHaveLength(1);
      expect(result.nodes).toHaveLength(3);
    });

    it('node value reflects total flow through the node', () => {
      const rows = [
        { src: 'A', dst: 'B', val: 10 },
        { src: 'A', dst: 'C', val: 20 },
        { src: 'B', dst: 'C', val: 5 },
      ];

      const result = transformToSankey(rows, 'src', 'dst', 'val');

      const nodeA = result.nodes.find((n) => n.id === 'A');
      const nodeB = result.nodes.find((n) => n.id === 'B');
      const nodeC = result.nodes.find((n) => n.id === 'C');

      // A is source for 10 + 20 = 30
      expect(nodeA!.value).toBe(30);
      // B is target for 10, source for 5 = 15
      expect(nodeB!.value).toBe(15);
      // C is target for 20 + 5 = 25
      expect(nodeC!.value).toBe(25);
    });
  });

  describe('null and empty value handling', () => {
    it('returns empty result for empty rows array', () => {
      const result = transformToSankey([], 'source', 'target', 'value');
      expect(result.nodes).toHaveLength(0);
      expect(result.links).toHaveLength(0);
    });

    it('returns empty result for null/undefined rows', () => {
      const result = transformToSankey(
        null as unknown as Record<string, unknown>[],
        'source',
        'target',
        'value',
      );
      expect(result.nodes).toHaveLength(0);
      expect(result.links).toHaveLength(0);
    });

    it('skips rows with null source', () => {
      const rows = [
        { source: null, target: 'B', value: 10 },
        { source: 'A', target: 'B', value: 20 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.links).toHaveLength(1);
      expect(result.links[0].source).toBe('A');
    });

    it('skips rows with null target', () => {
      const rows = [
        { source: 'A', target: null, value: 10 },
        { source: 'A', target: 'B', value: 20 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.links).toHaveLength(1);
      expect(result.links[0].target).toBe('B');
    });

    it('skips rows with empty string source or target', () => {
      const rows = [
        { source: '', target: 'B', value: 10 },
        { source: 'A', target: '', value: 15 },
        { source: 'A', target: 'B', value: 20 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.links).toHaveLength(1);
      expect(result.links[0].value).toBe(20);
    });

    it('skips rows with undefined source or target fields', () => {
      const rows = [
        { target: 'B', value: 10 },
        { source: 'A', value: 15 },
        { source: 'A', target: 'B', value: 20 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.links).toHaveLength(1);
      expect(result.links[0].value).toBe(20);
    });

    it('treats zero and negative values as non-contributing', () => {
      const rows = [
        { source: 'A', target: 'B', value: 0 },
        { source: 'A', target: 'C', value: -5 },
        { source: 'A', target: 'D', value: 10 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.links).toHaveLength(1);
      expect(result.links[0].target).toBe('D');
    });

    it('handles non-numeric value field gracefully', () => {
      const rows = [
        { source: 'A', target: 'B', value: 'not-a-number' },
        { source: 'A', target: 'C', value: '25' },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      // 'not-a-number' → 0, skipped; '25' → 25, included
      expect(result.links).toHaveLength(1);
      expect(result.links[0].value).toBe(25);
    });

    it('handles string numeric values correctly', () => {
      const rows = [
        { source: 'A', target: 'B', value: '10' },
        { source: 'A', target: 'B', value: '20' },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.links).toHaveLength(1);
      expect(result.links[0].value).toBe(30);
    });
  });

  describe('limits', () => {
    it('limits nodes to 20 maximum', () => {
      // Create 30 unique nodes (15 sources, 15 targets with no overlap)
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 25; i++) {
        rows.push({ source: `S${i}`, target: `T${i}`, value: 100 - i });
      }

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.nodes.length).toBeLessThanOrEqual(20);
    });

    it('limits links to 50 maximum', () => {
      // Create 60 unique links
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 60; i++) {
        rows.push({ source: `S${i % 5}`, target: `T${i}`, value: 100 - i });
      }

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.links.length).toBeLessThanOrEqual(50);
    });

    it('keeps top links by value when limiting', () => {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 60; i++) {
        rows.push({ source: 'A', target: `T${i}`, value: 1000 - i * 10 });
      }

      const result = transformToSankey(rows, 'source', 'target', 'value');

      // All links should be sorted by value descending
      for (let i = 1; i < result.links.length; i++) {
        expect(result.links[i - 1].value).toBeGreaterThanOrEqual(
          result.links[i].value,
        );
      }
    });

    it('filters links when nodes are limited', () => {
      // Create many nodes but only top 20 should remain
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 30; i++) {
        rows.push({ source: `S${i}`, target: `T${i}`, value: 100 - i });
      }

      const result = transformToSankey(rows, 'source', 'target', 'value');

      // All links should reference nodes that exist in the nodes array
      const nodeIds = new Set(result.nodes.map((n) => n.id));
      for (const link of result.links) {
        expect(nodeIds.has(link.source)).toBe(true);
        expect(nodeIds.has(link.target)).toBe(true);
      }
    });
  });

  describe('node properties', () => {
    it('node name equals node id', () => {
      const rows = [
        { source: 'Alpha', target: 'Beta', value: 10 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      for (const node of result.nodes) {
        expect(node.name).toBe(node.id);
      }
    });

    it('nodes are sorted by value descending', () => {
      const rows = [
        { source: 'A', target: 'B', value: 5 },
        { source: 'A', target: 'C', value: 100 },
        { source: 'D', target: 'C', value: 50 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      for (let i = 1; i < result.nodes.length; i++) {
        expect(result.nodes[i - 1].value).toBeGreaterThanOrEqual(
          result.nodes[i].value,
        );
      }
    });
  });

  describe('edge cases', () => {
    it('handles single row', () => {
      const rows = [{ source: 'A', target: 'B', value: 42 }];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.nodes).toHaveLength(2);
      expect(result.links).toHaveLength(1);
      expect(result.links[0].value).toBe(42);
    });

    it('handles self-referencing links (source === target)', () => {
      const rows = [
        { source: 'A', target: 'A', value: 10 },
        { source: 'A', target: 'B', value: 20 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      // Self-referencing link is valid data
      const selfLink = result.links.find(
        (l) => l.source === 'A' && l.target === 'A',
      );
      expect(selfLink).toBeDefined();
      expect(selfLink!.value).toBe(10);
    });

    it('handles numeric source/target values by converting to string', () => {
      const rows = [
        { source: 1, target: 2, value: 10 },
        { source: 2, target: 3, value: 20 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      expect(result.nodes).toHaveLength(3);
      expect(result.nodes.map((n) => n.id).sort()).toEqual(['1', '2', '3']);
    });

    it('handles Infinity values gracefully', () => {
      const rows = [
        { source: 'A', target: 'B', value: Infinity },
        { source: 'A', target: 'C', value: 10 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      // Infinity is not finite, should be skipped
      expect(result.links).toHaveLength(1);
      expect(result.links[0].target).toBe('C');
    });

    it('handles NaN values gracefully', () => {
      const rows = [
        { source: 'A', target: 'B', value: NaN },
        { source: 'A', target: 'C', value: 10 },
      ];

      const result = transformToSankey(rows, 'source', 'target', 'value');

      // NaN → 0, skipped because not > 0
      expect(result.links).toHaveLength(1);
      expect(result.links[0].target).toBe('C');
    });
  });
});
