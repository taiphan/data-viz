import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryHistoryService, QueryHistoryEntry } from './query-history.js';

// Mock logger
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createEntry(
  overrides: Partial<Omit<QueryHistoryEntry, 'isSlow'>> = {}
): Omit<QueryHistoryEntry, 'isSlow'> {
  return {
    id: `query-${Math.random().toString(36).slice(2)}`,
    userId: 'user-1',
    sql: 'SELECT * FROM users',
    executionTimeMs: 50,
    rowsReturned: 10,
    timestamp: new Date().toISOString(),
    connectionId: 'conn-123',
    driver: 'postgresql',
    status: 'success',
    ...overrides,
  };
}

describe('QueryHistoryService', () => {
  let service: QueryHistoryService;

  beforeEach(() => {
    service = new QueryHistoryService({ maxPerUser: 10, slowThresholdMs: 5000 });
  });

  describe('record', () => {
    it('should store a query entry for a user', () => {
      service.record(createEntry());
      expect(service.getTotalEntries()).toBe(1);
    });

    it('should track entries per user', () => {
      service.record(createEntry({ userId: 'user-1' }));
      service.record(createEntry({ userId: 'user-2' }));
      service.record(createEntry({ userId: 'user-1' }));

      expect(service.getUserCount()).toBe(2);
      expect(service.getUserEntries('user-1')).toHaveLength(2);
      expect(service.getUserEntries('user-2')).toHaveLength(1);
    });

    it('should mark slow queries (>=5s)', () => {
      service.record(createEntry({ executionTimeMs: 6000 }));
      service.record(createEntry({ executionTimeMs: 100 }));

      const entries = service.getUserEntries('user-1');
      expect(entries[0].isSlow).toBe(true);
      expect(entries[1].isSlow).toBe(false);
    });

    it('should mark queries at exactly threshold as slow', () => {
      service.record(createEntry({ executionTimeMs: 5000 }));

      const entries = service.getUserEntries('user-1');
      expect(entries[0].isSlow).toBe(true);
    });
  });

  describe('per-user ring buffer', () => {
    it('should not exceed max capacity per user', () => {
      const smallService = new QueryHistoryService({ maxPerUser: 5 });

      for (let i = 0; i < 10; i++) {
        smallService.record(createEntry({ id: `q-${i}`, userId: 'user-1' }));
      }

      expect(smallService.getUserEntries('user-1')).toHaveLength(5);
    });

    it('should keep most recent entries when buffer overflows', () => {
      const smallService = new QueryHistoryService({ maxPerUser: 3 });

      for (let i = 0; i < 5; i++) {
        smallService.record(createEntry({
          id: `q-${i}`,
          userId: 'user-1',
          timestamp: new Date(2024, 0, 1, i).toISOString(),
        }));
      }

      const entries = smallService.getUserEntries('user-1');
      const ids = entries.map((e) => e.id);

      expect(ids).toContain('q-2');
      expect(ids).toContain('q-3');
      expect(ids).toContain('q-4');
      expect(ids).not.toContain('q-0');
      expect(ids).not.toContain('q-1');
    });

    it('should default to 500 entries per user', () => {
      const defaultService = new QueryHistoryService();

      for (let i = 0; i < 505; i++) {
        defaultService.record(createEntry({ id: `q-${i}`, userId: 'user-1' }));
      }

      expect(defaultService.getUserEntries('user-1')).toHaveLength(500);
    });
  });

  describe('getHistory', () => {
    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        service.record(createEntry({
          id: `q-${i}`,
          userId: i % 2 === 0 ? 'user-1' : 'user-2',
          timestamp: new Date(2024, 0, 1, i).toISOString(),
          driver: i % 2 === 0 ? 'postgresql' : 'mysql',
          status: i % 3 === 0 ? 'error' : 'success',
          executionTimeMs: i === 9 ? 6000 : (i + 1) * 100,
          connectionId: `conn-${i % 3}`,
          sql: `SELECT * FROM table_${i}`,
        }));
      }
    });

    it('should return paginated results', () => {
      const result = service.getHistory(1, 5);

      expect(result.entries).toHaveLength(5);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(5);
      expect(result.totalPages).toBe(2);
    });

    it('should return second page', () => {
      const result = service.getHistory(2, 5);

      expect(result.entries).toHaveLength(5);
      expect(result.page).toBe(2);
    });

    it('should include slow and failed counts', () => {
      const result = service.getHistory(1, 50);

      expect(result.slowCount).toBe(1); // q-9 has 6000ms
      expect(result.failedCount).toBe(4); // i=0,3,6,9 have error status
    });

    it('should sort by timestamp descending by default', () => {
      const result = service.getHistory(1, 10);

      for (let i = 0; i < result.entries.length - 1; i++) {
        const current = new Date(result.entries[i].timestamp).getTime();
        const next = new Date(result.entries[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('should sort by executionTimeMs ascending', () => {
      const result = service.getHistory(1, 10, undefined, {
        field: 'executionTimeMs',
        order: 'asc',
      });

      for (let i = 0; i < result.entries.length - 1; i++) {
        expect(result.entries[i].executionTimeMs)
          .toBeLessThanOrEqual(result.entries[i + 1].executionTimeMs);
      }
    });

    it('should sort by rowsReturned descending', () => {
      const result = service.getHistory(1, 10, undefined, {
        field: 'rowsReturned',
        order: 'desc',
      });

      for (let i = 0; i < result.entries.length - 1; i++) {
        expect(result.entries[i].rowsReturned)
          .toBeGreaterThanOrEqual(result.entries[i + 1].rowsReturned);
      }
    });

    it('should filter by userId', () => {
      const result = service.getHistory(1, 50, { userId: 'user-1' });

      expect(result.entries.every((e) => e.userId === 'user-1')).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should filter by search (SQL text)', () => {
      const result = service.getHistory(1, 50, { search: 'table_3' });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].sql).toContain('table_3');
    });

    it('should search case-insensitively', () => {
      const result = service.getHistory(1, 50, { search: 'SELECT' });

      expect(result.total).toBe(10);
    });

    it('should filter by driver', () => {
      const result = service.getHistory(1, 50, { driver: 'postgresql' });

      expect(result.entries.every((e) => e.driver === 'postgresql')).toBe(true);
    });

    it('should filter by status', () => {
      const result = service.getHistory(1, 50, { status: 'error' });

      expect(result.entries.every((e) => e.status === 'error')).toBe(true);
    });

    it('should filter by connectionId', () => {
      const result = service.getHistory(1, 50, { connectionId: 'conn-0' });

      expect(result.entries.every((e) => e.connectionId === 'conn-0')).toBe(true);
    });

    it('should filter slow queries only', () => {
      const result = service.getHistory(1, 50, { slowOnly: true });

      expect(result.entries.every((e) => e.isSlow)).toBe(true);
      expect(result.total).toBe(1);
    });

    it('should filter by date range (since)', () => {
      const since = new Date(2024, 0, 1, 5).toISOString();
      const result = service.getHistory(1, 50, { since });

      expect(result.entries.every((e) =>
        new Date(e.timestamp).getTime() >= new Date(since).getTime()
      )).toBe(true);
    });

    it('should filter by date range (until)', () => {
      const until = new Date(2024, 0, 1, 5).toISOString();
      const result = service.getHistory(1, 50, { until });

      expect(result.entries.every((e) =>
        new Date(e.timestamp).getTime() <= new Date(until).getTime()
      )).toBe(true);
    });

    it('should combine multiple filters', () => {
      const result = service.getHistory(1, 50, {
        userId: 'user-1',
        status: 'success',
      });

      expect(result.entries.every((e) =>
        e.userId === 'user-1' && e.status === 'success'
      )).toBe(true);
    });

    it('should clamp page to minimum 1', () => {
      const result = service.getHistory(-5, 10);
      expect(result.page).toBe(1);
    });

    it('should clamp pageSize to maximum 100', () => {
      const result = service.getHistory(1, 200);
      expect(result.pageSize).toBe(100);
    });

    it('should return empty results for unknown user', () => {
      const result = service.getHistory(1, 50, { userId: 'unknown-user' });

      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all entries for all users', () => {
      service.record(createEntry({ userId: 'user-1' }));
      service.record(createEntry({ userId: 'user-2' }));

      service.clear();

      expect(service.getTotalEntries()).toBe(0);
      expect(service.getUserCount()).toBe(0);
    });
  });

  describe('clearUser', () => {
    it('should remove entries for a specific user only', () => {
      service.record(createEntry({ userId: 'user-1' }));
      service.record(createEntry({ userId: 'user-2' }));

      service.clearUser('user-1');

      expect(service.getUserEntries('user-1')).toHaveLength(0);
      expect(service.getUserEntries('user-2')).toHaveLength(1);
    });
  });

  describe('getSlowThresholdMs', () => {
    it('should return the configured threshold', () => {
      expect(service.getSlowThresholdMs()).toBe(5000);
    });

    it('should default to 5000ms', () => {
      const defaultService = new QueryHistoryService();
      expect(defaultService.getSlowThresholdMs()).toBe(5000);
    });
  });
});
