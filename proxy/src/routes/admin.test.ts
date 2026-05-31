import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import adminRouter from './admin.js';

// Mock connection-manager
vi.mock('../services/connection-manager.js', () => ({
  connectionManager: {
    getActivePools: vi.fn(() => []),
  },
}));

// Mock query-profiler
vi.mock('../services/query-profiler.js', () => ({
  queryProfiler: {
    getHistory: vi.fn(() => ({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    })),
    getStats: vi.fn(() => ({
      totalQueries: 0,
      successCount: 0,
      errorCount: 0,
      avgExecutionTimeMs: 0,
      p95ExecutionTimeMs: 0,
      totalBytesTransferred: 0,
    })),
  },
}));

// Mock query-history
vi.mock('../services/query-history.js', () => ({
  queryHistoryService: {
    getHistory: vi.fn(() => ({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
      slowCount: 0,
      failedCount: 0,
    })),
    getSlowThresholdMs: vi.fn(() => 5000),
  },
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createApp() {
  const app = express();
  app.use(express.json());

  // Simulate requestId middleware
  app.use((req, _res, next) => {
    (req as express.Request & { requestId: string }).requestId = 'test-request-id';
    next();
  });

  app.use('/api/admin', adminRouter);
  return app;
}

describe('Admin Routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_SECRET: 'test-admin-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('requireAdmin middleware', () => {
    it('should return 403 when X-Admin-Token header is missing', async () => {
      const app = createApp();
      const res = await request(app).get('/api/admin/status');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 403 when X-Admin-Token is invalid', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/status')
        .set('X-Admin-Token', 'wrong-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 500 when ADMIN_SECRET is not configured', async () => {
      delete process.env.ADMIN_SECRET;
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/status')
        .set('X-Admin-Token', 'any-token');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should allow access with valid admin token', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/status')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/status', () => {
    it('should return proxy health information', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/status')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body.uptime).toHaveProperty('ms');
      expect(res.body.uptime).toHaveProperty('seconds');
      expect(res.body.uptime).toHaveProperty('formatted');
      expect(res.body).toHaveProperty('memory');
      expect(res.body.memory).toHaveProperty('rss');
      expect(res.body.memory).toHaveProperty('heapUsed');
      expect(res.body.memory).toHaveProperty('rssMb');
      expect(res.body).toHaveProperty('cpu');
      expect(res.body.cpu).toHaveProperty('user');
      expect(res.body.cpu).toHaveProperty('system');
      expect(res.body).toHaveProperty('system');
      expect(res.body.system).toHaveProperty('platform');
      expect(res.body.system).toHaveProperty('nodeVersion');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/admin/connections', () => {
    it('should return empty connections when no pools exist', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/connections')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalPools', 0);
      expect(res.body).toHaveProperty('connections');
      expect(res.body.connections).toEqual([]);
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return pool info when connections exist', async () => {
      const { connectionManager } = await import('../services/connection-manager.js');
      const mockPool = {
        connectionId: 'test-id-123',
        driver: 'postgresql',
        activeConnections: 2,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        lastUsedAt: new Date('2024-01-01T01:00:00Z'),
      };
      vi.mocked(connectionManager.getActivePools).mockReturnValueOnce([mockPool as any]);

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/connections')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.totalPools).toBe(1);
      expect(res.body.connections[0]).toMatchObject({
        connectionId: 'test-id-123',
        driver: 'postgresql',
        activeConnections: 2,
      });
    });
  });

  describe('GET /api/admin/sessions', () => {
    it('should return empty sessions when no pools exist', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/sessions')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('activeSessions', 0);
      expect(res.body).toHaveProperty('sessions');
      expect(res.body.sessions).toEqual([]);
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/admin/queues', () => {
    it('should return empty queues when no scheduler is configured', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/queues')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('queues');
      expect(res.body.queues).toEqual([]);
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/admin/query-history', () => {
    it('should return empty history when no queries have been profiled', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-history')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entries');
      expect(res.body.entries).toEqual([]);
      expect(res.body).toHaveProperty('total', 0);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pageSize', 50);
      expect(res.body).toHaveProperty('totalPages', 0);
      expect(res.body).toHaveProperty('stats');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should pass pagination parameters to query history service', async () => {
      const { queryHistoryService } = await import('../services/query-history.js');

      const app = createApp();
      await request(app)
        .get('/api/admin/query-history?page=2&pageSize=25')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(queryHistoryService.getHistory).toHaveBeenCalledWith(
        2, 25, undefined, undefined
      );
    });

    it('should pass filter parameters to query history service', async () => {
      const { queryHistoryService } = await import('../services/query-history.js');

      const app = createApp();
      await request(app)
        .get('/api/admin/query-history?driver=postgresql&status=error&userId=user-1&search=SELECT')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(queryHistoryService.getHistory).toHaveBeenCalledWith(1, 50, {
        driver: 'postgresql',
        status: 'error',
        userId: 'user-1',
        search: 'SELECT',
      }, undefined);
    });

    it('should include stats in response', async () => {
      const { queryProfiler } = await import('../services/query-profiler.js');
      vi.mocked(queryProfiler.getStats).mockReturnValueOnce({
        totalQueries: 5,
        successCount: 4,
        errorCount: 1,
        avgExecutionTimeMs: 150,
        p95ExecutionTimeMs: 400,
        totalBytesTransferred: 5000,
      });

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-history')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.stats).toEqual({
        totalQueries: 5,
        successCount: 4,
        errorCount: 1,
        avgExecutionTimeMs: 150,
        p95ExecutionTimeMs: 400,
        totalBytesTransferred: 5000,
      });
    });

    it('should return entries when available', async () => {
      const { queryHistoryService } = await import('../services/query-history.js');
      const mockEntries = [
        {
          id: 'q-1',
          userId: 'user-1',
          sql: 'SELECT * FROM users',
          driver: 'postgresql',
          connectionId: 'conn-1',
          executionTimeMs: 120,
          rowsReturned: 50,
          timestamp: '2024-01-01T12:00:00.000Z',
          status: 'success' as const,
          isSlow: false,
        },
      ];

      vi.mocked(queryHistoryService.getHistory).mockReturnValueOnce({
        entries: mockEntries,
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        slowCount: 0,
        failedCount: 0,
      });

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-history')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]).toMatchObject({
        id: 'q-1',
        userId: 'user-1',
        sql: 'SELECT * FROM users',
        driver: 'postgresql',
        executionTimeMs: 120,
        rowsReturned: 50,
        isSlow: false,
      });
      expect(res.body).toHaveProperty('slowCount', 0);
      expect(res.body).toHaveProperty('failedCount', 0);
      expect(res.body).toHaveProperty('slowThresholdMs', 5000);
    });

    it('should require admin authentication', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-history');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/admin/query-stats', () => {
    it('should return empty stats when no queries have been executed', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toEqual([]);
      expect(res.body).toHaveProperty('total', 0);
      expect(res.body).toHaveProperty('limit', 50);
      expect(res.body).toHaveProperty('offset', 0);
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return recorded query stats', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();
      queryStatsStore.record({
        id: 'test-q-1',
        sql: 'SELECT * FROM users',
        driver: 'postgresql',
        executionTimeMs: 150,
        rowsScanned: 1000,
        rowsReturned: 50,
        indexUsed: true,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'success',
      });

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(1);
      expect(res.body.stats[0]).toMatchObject({
        id: 'test-q-1',
        sql: 'SELECT * FROM users',
        driver: 'postgresql',
        executionTimeMs: 150,
        rowsScanned: 1000,
        rowsReturned: 50,
        indexUsed: true,
        status: 'success',
      });
      expect(res.body.total).toBe(1);
    });

    it('should filter by driver', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();
      queryStatsStore.record({
        id: 'pg-1',
        sql: 'SELECT 1',
        driver: 'postgresql',
        executionTimeMs: 10,
        rowsScanned: 1,
        rowsReturned: 1,
        indexUsed: true,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'success',
      });
      queryStatsStore.record({
        id: 'my-1',
        sql: 'SELECT 1',
        driver: 'mysql',
        executionTimeMs: 20,
        rowsScanned: 1,
        rowsReturned: 1,
        indexUsed: true,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'success',
      });

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats?driver=mysql')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(1);
      expect(res.body.stats[0].id).toBe('my-1');
    });

    it('should filter by status', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();
      queryStatsStore.record({
        id: 'ok-1',
        sql: 'SELECT 1',
        driver: 'postgresql',
        executionTimeMs: 10,
        rowsScanned: 1,
        rowsReturned: 1,
        indexUsed: true,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'success',
      });
      queryStatsStore.record({
        id: 'err-1',
        sql: 'INVALID SQL',
        driver: 'postgresql',
        executionTimeMs: 5,
        rowsScanned: 0,
        rowsReturned: 0,
        indexUsed: false,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'error',
        errorCode: 'SYNTAX_ERROR',
      });

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats?status=error')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(1);
      expect(res.body.stats[0].id).toBe('err-1');
    });

    it('should filter by minimum execution time', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();
      queryStatsStore.record({
        id: 'fast',
        sql: 'SELECT 1',
        driver: 'postgresql',
        executionTimeMs: 5,
        rowsScanned: 1,
        rowsReturned: 1,
        indexUsed: true,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'success',
      });
      queryStatsStore.record({
        id: 'slow',
        sql: 'SELECT * FROM big_table',
        driver: 'postgresql',
        executionTimeMs: 5000,
        rowsScanned: 100000,
        rowsReturned: 100000,
        indexUsed: false,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'success',
      });

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats?minExecutionTimeMs=1000')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(1);
      expect(res.body.stats[0].id).toBe('slow');
    });

    it('should respect pagination parameters', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();
      for (let i = 0; i < 10; i++) {
        queryStatsStore.record({
          id: `q-${i}`,
          sql: `SELECT ${i}`,
          driver: 'postgresql',
          executionTimeMs: i * 10,
          rowsScanned: i,
          rowsReturned: i,
          indexUsed: true,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          truncated: false,
          status: 'success',
        });
      }

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats?limit=3&offset=2')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(3);
      expect(res.body.total).toBe(10);
      expect(res.body.limit).toBe(3);
      expect(res.body.offset).toBe(2);
    });

    it('should cap limit at 100', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats?limit=500')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('should include summary when requested', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();
      queryStatsStore.record({
        id: 'q-1',
        sql: 'SELECT 1',
        driver: 'postgresql',
        executionTimeMs: 100,
        rowsScanned: 50,
        rowsReturned: 10,
        indexUsed: true,
        timestamp: new Date().toISOString(),
        truncated: false,
        status: 'success',
      });

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats?summary=true')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary).toHaveProperty('totalQueries', 1);
      expect(res.body.summary).toHaveProperty('avgExecutionTimeMs', 100);
      expect(res.body.summary).toHaveProperty('maxExecutionTimeMs', 100);
      expect(res.body.summary).toHaveProperty('totalRowsReturned', 10);
      expect(res.body.summary).toHaveProperty('queriesWithIndexUsage', 1);
      expect(res.body.summary).toHaveProperty('queriesWithoutIndexUsage', 0);
      expect(res.body.summary).toHaveProperty('errorCount', 0);
    });

    it('should not include summary by default', async () => {
      const { queryStatsStore } = await import('../services/query-stats.js');
      queryStatsStore.clear();

      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats')
        .set('X-Admin-Token', 'test-admin-secret');

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('summary');
    });

    it('should require admin authentication', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/query-stats');

      expect(res.status).toBe(403);
    });
  });
});
