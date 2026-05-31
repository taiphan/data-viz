import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryProfiler, QueryMetrics } from './query-profiler.js';

// Mock logger
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMetrics(overrides: Partial<QueryMetrics> = {}): QueryMetrics {
  return {
    id: `query-${Math.random().toString(36).slice(2)}`,
    sql: 'SELECT * FROM users',
    driver: 'postgresql',
    connectionId: 'conn-123',
    executionTimeMs: 50,
    rowsReturned: 10,
    bytesTransferred: 1024,
    status: 'success',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('QueryProfiler', () => {
  let profiler: QueryProfiler;

  beforeEach(() => {
    profiler = new QueryProfiler(100);
  });

  describe('record', () => {
    it('should store a query metrics entry', () => {
      const metrics = createMetrics();
      profiler.record(metrics);

      expect(profiler.size()).toBe(1);
    });

    it('should store multiple entries', () => {
      profiler.record(createMetrics({ id: 'q1' }));
      profiler.record(createMetrics({ id: 'q2' }));
      profiler.record(createMetrics({ id: 'q3' }));

      expect(profiler.size()).toBe(3);
    });
  });

  describe('ring buffer behavior', () => {
    it('should not exceed max capacity', () => {
      const smallProfiler = new QueryProfiler(5);

      for (let i = 0; i < 10; i++) {
        smallProfiler.record(createMetrics({ id: `q-${i}` }));
      }

      expect(smallProfiler.size()).toBe(5);
    });

    it('should keep most recent entries when buffer overflows', () => {
      const smallProfiler = new QueryProfiler(3);

      smallProfiler.record(createMetrics({ id: 'q-0', timestamp: '2024-01-01T00:00:00Z' }));
      smallProfiler.record(createMetrics({ id: 'q-1', timestamp: '2024-01-01T01:00:00Z' }));
      smallProfiler.record(createMetrics({ id: 'q-2', timestamp: '2024-01-01T02:00:00Z' }));
      smallProfiler.record(createMetrics({ id: 'q-3', timestamp: '2024-01-01T03:00:00Z' }));
      smallProfiler.record(createMetrics({ id: 'q-4', timestamp: '2024-01-01T04:00:00Z' }));

      const result = smallProfiler.getHistory(1, 10);
      const ids = result.entries.map((e) => e.id);

      // Should contain the 3 most recent entries
      expect(ids).toContain('q-2');
      expect(ids).toContain('q-3');
      expect(ids).toContain('q-4');
      expect(ids).not.toContain('q-0');
      expect(ids).not.toContain('q-1');
    });

    it('should default to max 1000 entries', () => {
      const defaultProfiler = new QueryProfiler();

      for (let i = 0; i < 1005; i++) {
        defaultProfiler.record(createMetrics({ id: `q-${i}` }));
      }

      expect(defaultProfiler.size()).toBe(1000);
    });
  });

  describe('getHistory', () => {
    beforeEach(() => {
      // Add 10 entries with different timestamps
      for (let i = 0; i < 10; i++) {
        profiler.record(createMetrics({
          id: `q-${i}`,
          timestamp: new Date(2024, 0, 1, i).toISOString(),
          driver: i % 2 === 0 ? 'postgresql' : 'mysql',
          status: i % 3 === 0 ? 'error' : 'success',
          executionTimeMs: (i + 1) * 100,
          connectionId: `conn-${i % 3}`,
        }));
      }
    });

    it('should return paginated results', () => {
      const result = profiler.getHistory(1, 5);

      expect(result.entries).toHaveLength(5);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(5);
      expect(result.totalPages).toBe(2);
    });

    it('should return second page', () => {
      const result = profiler.getHistory(2, 5);

      expect(result.entries).toHaveLength(5);
      expect(result.page).toBe(2);
    });

    it('should return entries sorted by timestamp descending', () => {
      const result = profiler.getHistory(1, 10);

      for (let i = 0; i < result.entries.length - 1; i++) {
        const current = new Date(result.entries[i].timestamp).getTime();
        const next = new Date(result.entries[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('should filter by driver', () => {
      const result = profiler.getHistory(1, 50, { driver: 'postgresql' });

      expect(result.entries.every((e) => e.driver === 'postgresql')).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should filter by status', () => {
      const result = profiler.getHistory(1, 50, { status: 'error' });

      expect(result.entries.every((e) => e.status === 'error')).toBe(true);
    });

    it('should filter by connectionId', () => {
      const result = profiler.getHistory(1, 50, { connectionId: 'conn-0' });

      expect(result.entries.every((e) => e.connectionId === 'conn-0')).toBe(true);
    });

    it('should filter by minExecutionTimeMs', () => {
      const result = profiler.getHistory(1, 50, { minExecutionTimeMs: 500 });

      expect(result.entries.every((e) => e.executionTimeMs >= 500)).toBe(true);
    });

    it('should filter by maxExecutionTimeMs', () => {
      const result = profiler.getHistory(1, 50, { maxExecutionTimeMs: 300 });

      expect(result.entries.every((e) => e.executionTimeMs <= 300)).toBe(true);
    });

    it('should filter by date range (since)', () => {
      const since = new Date(2024, 0, 1, 5).toISOString();
      const result = profiler.getHistory(1, 50, { since });

      expect(result.entries.every((e) =>
        new Date(e.timestamp).getTime() >= new Date(since).getTime()
      )).toBe(true);
    });

    it('should filter by date range (until)', () => {
      const until = new Date(2024, 0, 1, 5).toISOString();
      const result = profiler.getHistory(1, 50, { until });

      expect(result.entries.every((e) =>
        new Date(e.timestamp).getTime() <= new Date(until).getTime()
      )).toBe(true);
    });

    it('should combine multiple filters', () => {
      const result = profiler.getHistory(1, 50, {
        driver: 'postgresql',
        status: 'success',
      });

      expect(result.entries.every((e) =>
        e.driver === 'postgresql' && e.status === 'success'
      )).toBe(true);
    });

    it('should clamp page to minimum 1', () => {
      const result = profiler.getHistory(-5, 10);
      expect(result.page).toBe(1);
    });

    it('should clamp pageSize to maximum 100', () => {
      const result = profiler.getHistory(1, 200);
      expect(result.pageSize).toBe(100);
    });

    it('should return empty results for empty profiler', () => {
      const emptyProfiler = new QueryProfiler();
      const result = emptyProfiler.getHistory(1, 50);

      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty profiler', () => {
      const emptyProfiler = new QueryProfiler();
      const stats = emptyProfiler.getStats();

      expect(stats.totalQueries).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.avgExecutionTimeMs).toBe(0);
      expect(stats.p95ExecutionTimeMs).toBe(0);
      expect(stats.totalBytesTransferred).toBe(0);
    });

    it('should compute correct statistics', () => {
      profiler.record(createMetrics({ executionTimeMs: 100, bytesTransferred: 500, status: 'success' }));
      profiler.record(createMetrics({ executionTimeMs: 200, bytesTransferred: 1000, status: 'success' }));
      profiler.record(createMetrics({ executionTimeMs: 300, bytesTransferred: 1500, status: 'error' }));

      const stats = profiler.getStats();

      expect(stats.totalQueries).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(1);
      expect(stats.avgExecutionTimeMs).toBe(200);
      expect(stats.totalBytesTransferred).toBe(3000);
    });

    it('should compute p95 execution time', () => {
      // Add 20 entries with execution times 10, 20, ..., 200
      for (let i = 1; i <= 20; i++) {
        profiler.record(createMetrics({ executionTimeMs: i * 10 }));
      }

      const stats = profiler.getStats();
      // p95 index = floor(20 * 0.95) = 19 → value at index 19 in sorted array = 200
      expect(stats.p95ExecutionTimeMs).toBe(200);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      profiler.record(createMetrics());
      profiler.record(createMetrics());
      profiler.record(createMetrics());

      profiler.clear();

      expect(profiler.size()).toBe(0);
      expect(profiler.getHistory(1, 50).entries).toHaveLength(0);
    });
  });
});
