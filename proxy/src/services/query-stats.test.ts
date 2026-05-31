import { describe, it, expect, beforeEach } from 'vitest';
import { queryStatsStore, QueryExecutionStats } from './query-stats.js';

// ============================================================
// HELPERS
// ============================================================

function createStat(overrides: Partial<QueryExecutionStats> = {}): QueryExecutionStats {
  return {
    id: `query-${Math.random().toString(36).slice(2)}`,
    sql: 'SELECT * FROM users',
    driver: 'postgresql',
    executionTimeMs: 50,
    rowsScanned: 100,
    rowsReturned: 10,
    indexUsed: true,
    timestamp: new Date().toISOString(),
    truncated: false,
    status: 'success',
    ...overrides,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('QueryStatsStore', () => {
  beforeEach(() => {
    queryStatsStore.clear();
  });

  describe('record', () => {
    it('stores a query execution stat', () => {
      const stat = createStat();
      queryStatsStore.record(stat);

      expect(queryStatsStore.size).toBe(1);
    });

    it('stores multiple stats', () => {
      queryStatsStore.record(createStat({ id: 'q1' }));
      queryStatsStore.record(createStat({ id: 'q2' }));
      queryStatsStore.record(createStat({ id: 'q3' }));

      expect(queryStatsStore.size).toBe(3);
    });

    it('enforces max entries limit (ring buffer)', () => {
      for (let i = 0; i < 1050; i++) {
        queryStatsStore.record(createStat({ id: `q-${i}` }));
      }

      expect(queryStatsStore.size).toBe(1000);
    });

    it('keeps most recent entries when exceeding limit', () => {
      for (let i = 0; i < 1050; i++) {
        queryStatsStore.record(createStat({ id: `q-${i}` }));
      }

      const result = queryStatsStore.getStats({ limit: 1050, offset: 0 });
      const ids = result.stats.map((s) => s.id);

      // Should contain the last 1000 entries (q-50 through q-1049)
      expect(ids).toContain('q-1049');
      expect(ids).toContain('q-50');
      expect(ids).not.toContain('q-0');
    });
  });

  describe('getStats', () => {
    it('returns empty array when no stats recorded', () => {
      const result = queryStatsStore.getStats();

      expect(result.stats).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all stats with default pagination', () => {
      for (let i = 0; i < 5; i++) {
        queryStatsStore.record(createStat({ id: `q-${i}` }));
      }

      const result = queryStatsStore.getStats();

      expect(result.stats.length).toBe(5);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('returns stats sorted by timestamp descending', () => {
      const now = Date.now();
      queryStatsStore.record(createStat({
        id: 'oldest',
        timestamp: new Date(now - 3000).toISOString(),
      }));
      queryStatsStore.record(createStat({
        id: 'middle',
        timestamp: new Date(now - 1000).toISOString(),
      }));
      queryStatsStore.record(createStat({
        id: 'newest',
        timestamp: new Date(now).toISOString(),
      }));

      const result = queryStatsStore.getStats();

      expect(result.stats[0].id).toBe('newest');
      expect(result.stats[1].id).toBe('middle');
      expect(result.stats[2].id).toBe('oldest');
    });

    it('filters by driver', () => {
      queryStatsStore.record(createStat({ id: 'pg1', driver: 'postgresql' }));
      queryStatsStore.record(createStat({ id: 'my1', driver: 'mysql' }));
      queryStatsStore.record(createStat({ id: 'pg2', driver: 'postgresql' }));

      const result = queryStatsStore.getStats({ driver: 'mysql' });

      expect(result.stats.length).toBe(1);
      expect(result.stats[0].id).toBe('my1');
      expect(result.total).toBe(1);
    });

    it('filters by status', () => {
      queryStatsStore.record(createStat({ id: 'ok1', status: 'success' }));
      queryStatsStore.record(createStat({ id: 'err1', status: 'error' }));
      queryStatsStore.record(createStat({ id: 'ok2', status: 'success' }));

      const result = queryStatsStore.getStats({ status: 'error' });

      expect(result.stats.length).toBe(1);
      expect(result.stats[0].id).toBe('err1');
    });

    it('filters by minimum execution time', () => {
      queryStatsStore.record(createStat({ id: 'fast', executionTimeMs: 10 }));
      queryStatsStore.record(createStat({ id: 'slow', executionTimeMs: 5000 }));
      queryStatsStore.record(createStat({ id: 'medium', executionTimeMs: 200 }));

      const result = queryStatsStore.getStats({ minExecutionTimeMs: 100 });

      expect(result.stats.length).toBe(2);
      const ids = result.stats.map((s) => s.id);
      expect(ids).toContain('slow');
      expect(ids).toContain('medium');
      expect(ids).not.toContain('fast');
    });

    it('applies pagination with limit and offset', () => {
      for (let i = 0; i < 10; i++) {
        queryStatsStore.record(createStat({
          id: `q-${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        }));
      }

      const result = queryStatsStore.getStats({ limit: 3, offset: 2 });

      expect(result.stats.length).toBe(3);
      expect(result.total).toBe(10);
      expect(result.limit).toBe(3);
      expect(result.offset).toBe(2);
    });

    it('combines multiple filters', () => {
      queryStatsStore.record(createStat({
        id: 'match',
        driver: 'postgresql',
        status: 'error',
        executionTimeMs: 5000,
      }));
      queryStatsStore.record(createStat({
        id: 'wrong-driver',
        driver: 'mysql',
        status: 'error',
        executionTimeMs: 5000,
      }));
      queryStatsStore.record(createStat({
        id: 'wrong-status',
        driver: 'postgresql',
        status: 'success',
        executionTimeMs: 5000,
      }));

      const result = queryStatsStore.getStats({
        driver: 'postgresql',
        status: 'error',
        minExecutionTimeMs: 1000,
      });

      expect(result.stats.length).toBe(1);
      expect(result.stats[0].id).toBe('match');
    });
  });

  describe('getSummary', () => {
    it('returns zero summary when no stats recorded', () => {
      const summary = queryStatsStore.getSummary();

      expect(summary).toEqual({
        totalQueries: 0,
        avgExecutionTimeMs: 0,
        maxExecutionTimeMs: 0,
        totalRowsReturned: 0,
        queriesWithIndexUsage: 0,
        queriesWithoutIndexUsage: 0,
        errorCount: 0,
      });
    });

    it('computes correct summary statistics', () => {
      queryStatsStore.record(createStat({
        executionTimeMs: 100,
        rowsReturned: 50,
        indexUsed: true,
        status: 'success',
      }));
      queryStatsStore.record(createStat({
        executionTimeMs: 200,
        rowsReturned: 30,
        indexUsed: false,
        status: 'success',
      }));
      queryStatsStore.record(createStat({
        executionTimeMs: 300,
        rowsReturned: 0,
        indexUsed: false,
        status: 'error',
      }));

      const summary = queryStatsStore.getSummary();

      expect(summary.totalQueries).toBe(3);
      expect(summary.avgExecutionTimeMs).toBe(200); // (100+200+300)/3
      expect(summary.maxExecutionTimeMs).toBe(300);
      expect(summary.totalRowsReturned).toBe(80); // 50+30+0
      expect(summary.queriesWithIndexUsage).toBe(1);
      expect(summary.queriesWithoutIndexUsage).toBe(2);
      expect(summary.errorCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all stored stats', () => {
      queryStatsStore.record(createStat());
      queryStatsStore.record(createStat());

      expect(queryStatsStore.size).toBe(2);

      queryStatsStore.clear();

      expect(queryStatsStore.size).toBe(0);
      expect(queryStatsStore.getStats().stats).toEqual([]);
    });
  });
});
