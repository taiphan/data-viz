import { Router, Request, Response, NextFunction } from 'express';
import os from 'node:os';
import { connectionManager } from '../services/connection-manager.js';
import { sessionManager } from '../services/session-manager.js';
import { queryProfiler } from '../services/query-profiler.js';
import { queryStatsStore } from '../services/query-stats.js';
import { healthMonitor } from '../services/health-monitor.js';
import {
  queryHistoryService,
  QueryHistoryFilters,
  QueryHistorySort,
  QueryHistorySortField,
  QueryHistorySortOrder,
} from '../services/query-history.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes:admin');
const router = Router();

const APP_VERSION = process.env.APP_VERSION || '0.1.0';
const startTime = Date.now();

// ============================================================
// ADMIN ROLE MIDDLEWARE
// ============================================================

/**
 * Validates that the authenticated user has admin role.
 * Expects: X-Admin-Token header matching ADMIN_SECRET env var.
 * This runs AFTER the standard authMiddleware.
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminToken = req.headers['x-admin-token'] as string | undefined;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    logger.error({ requestId: req.requestId }, 'ADMIN_SECRET not configured');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Server configuration error.',
      },
      requestId: req.requestId,
    });
    return;
  }

  if (!adminToken || adminToken !== adminSecret) {
    logger.warn({ requestId: req.requestId }, 'Admin access denied');
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required.',
      },
      requestId: req.requestId,
    });
    return;
  }

  next();
}

// Apply admin role check to all routes in this router
router.use(requireAdmin);

// ============================================================
// GET /api/admin/status
// ============================================================

router.get('/status', (_req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const uptimeMs = Date.now() - startTime;

  res.status(200).json({
    status: 'ok',
    version: APP_VERSION,
    uptime: {
      ms: uptimeMs,
      seconds: Math.floor(uptimeMs / 1000),
      formatted: formatUptime(uptimeMs),
    },
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      rssMb: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      userMs: Math.round(cpuUsage.user / 1000),
      systemMs: Math.round(cpuUsage.system / 1000),
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// GET /api/admin/health
// ============================================================

/**
 * Structured health check response with component-level status.
 * Tracks: proxy uptime, connection pool utilization, queue depth, error rates.
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await healthMonitor.getHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ error: message }, 'Health check failed');
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// GET /api/admin/connections
// ============================================================

router.get('/connections', (_req: Request, res: Response) => {
  const pools = connectionManager.getActivePools();

  const connections = pools.map((pool) => ({
    connectionId: pool.connectionId,
    driver: pool.driver,
    activeConnections: pool.activeConnections,
    createdAt: pool.createdAt.toISOString(),
    lastUsedAt: pool.lastUsedAt.toISOString(),
    idleMs: Date.now() - pool.lastUsedAt.getTime(),
  }));

  res.status(200).json({
    totalPools: connections.length,
    connections,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// GET /api/admin/sessions
// ============================================================

/**
 * Active user sessions with resource usage.
 * Uses the SessionManager to provide detailed session tracking
 * including queries/min, data transferred, and connection counts.
 */
router.get('/sessions', (_req: Request, res: Response) => {
  const metrics = sessionManager.getMetrics();
  res.status(200).json(metrics);
});

// ============================================================
// POST /api/admin/sessions/:sessionId/disconnect
// ============================================================

/**
 * Force-disconnects a specific session.
 * Used for runaway sessions that exceed resource limits.
 */
router.post('/sessions/:sessionId/disconnect', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const reason = (req.body?.reason as string) || 'admin-initiated';

  const success = sessionManager.forceDisconnect(sessionId, reason);

  if (!success) {
    res.status(404).json({
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found or already inactive.',
      },
      requestId: req.requestId,
    });
    return;
  }

  res.status(200).json({
    message: 'Session disconnected.',
    sessionId,
    reason,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// POST /api/admin/users/:userId/disconnect
// ============================================================

/**
 * Force-disconnects all sessions for a specific user.
 */
router.post('/users/:userId/disconnect', (req: Request, res: Response) => {
  const userId = req.params.userId as string;
  const reason = (req.body?.reason as string) || 'admin-initiated';

  const disconnected = sessionManager.forceDisconnectUser(userId, reason);

  res.status(200).json({
    message: `Disconnected ${disconnected} session(s).`,
    userId,
    disconnected,
    reason,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// GET /api/admin/queues
// ============================================================

/**
 * BullMQ queue status.
 * Returns queue depth, active/waiting/failed counts.
 * If Redis/BullMQ is not available, returns empty state.
 */
router.get('/queues', async (req: Request, res: Response) => {
  try {
    const queueStats = getQueueStats();

    res.status(200).json({
      queues: queueStats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Failed to fetch queue stats');
    res.status(500).json({
      error: {
        code: 'QUEUE_STATUS_ERROR',
        message: 'Unable to retrieve queue status.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/admin/query-history
// ============================================================

/**
 * Returns paginated query execution history with search, sort, and filter.
 * Supports per-user tracking with slow query (>5s) and failed query highlighting.
 *
 * Query params:
 *   - page (number, default 1)
 *   - pageSize (number, default 50, max 100)
 *   - userId (string, filter by user)
 *   - search (string, search SQL text)
 *   - driver (string, filter by database driver)
 *   - connectionId (string, filter by connection)
 *   - status ('success' | 'error')
 *   - slowOnly ('true', filter to slow queries >5s)
 *   - since (ISO date string)
 *   - until (ISO date string)
 *   - sortBy ('timestamp' | 'executionTimeMs' | 'rowsReturned')
 *   - sortOrder ('asc' | 'desc')
 */
router.get('/query-history', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 50;

  const filters: QueryHistoryFilters = {};

  if (req.query.userId) {
    filters.userId = req.query.userId as string;
  }
  if (req.query.search) {
    filters.search = req.query.search as string;
  }
  if (req.query.driver) {
    filters.driver = req.query.driver as string;
  }
  if (req.query.connectionId) {
    filters.connectionId = req.query.connectionId as string;
  }
  if (req.query.status === 'success' || req.query.status === 'error') {
    filters.status = req.query.status;
  }
  if (req.query.slowOnly === 'true') {
    filters.slowOnly = true;
  }
  if (req.query.since) {
    filters.since = req.query.since as string;
  }
  if (req.query.until) {
    filters.until = req.query.until as string;
  }

  const validSortFields: QueryHistorySortField[] = [
    'timestamp',
    'executionTimeMs',
    'rowsReturned',
  ];
  const validSortOrders: QueryHistorySortOrder[] = ['asc', 'desc'];

  let sort: QueryHistorySort | undefined;
  const sortBy = req.query.sortBy as string | undefined;
  const sortOrder = req.query.sortOrder as string | undefined;

  if (sortBy && validSortFields.includes(sortBy as QueryHistorySortField)) {
    sort = {
      field: sortBy as QueryHistorySortField,
      order: validSortOrders.includes(sortOrder as QueryHistorySortOrder)
        ? (sortOrder as QueryHistorySortOrder)
        : 'desc',
    };
  }

  const hasFilters = Object.keys(filters).length > 0;
  const result = queryHistoryService.getHistory(
    page,
    pageSize,
    hasFilters ? filters : undefined,
    sort
  );

  // Also include legacy profiler stats for backward compatibility
  const profilerStats = queryProfiler.getStats();

  res.status(200).json({
    ...result,
    stats: profilerStats,
    slowThresholdMs: queryHistoryService.getSlowThresholdMs(),
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// GET /api/admin/query-stats
// ============================================================

/**
 * Returns query execution statistics with optional filtering.
 * Query params:
 *   - driver (string, filter by database driver)
 *   - status ('success' | 'error')
 *   - minExecutionTimeMs (number, filter slow queries)
 *   - limit (number, default 50, max 100)
 *   - offset (number, default 0)
 *   - summary (boolean, include summary stats)
 */
router.get('/query-stats', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
  const offset = parseInt(req.query.offset as string, 10) || 0;

  const filter: {
    driver?: string;
    status?: 'success' | 'error';
    minExecutionTimeMs?: number;
    limit: number;
    offset: number;
  } = { limit, offset };

  if (req.query.driver) {
    filter.driver = req.query.driver as string;
  }
  if (req.query.status === 'success' || req.query.status === 'error') {
    filter.status = req.query.status;
  }
  if (req.query.minExecutionTimeMs) {
    const val = parseInt(req.query.minExecutionTimeMs as string, 10);
    if (!isNaN(val)) filter.minExecutionTimeMs = val;
  }

  const result = queryStatsStore.getStats(filter);
  const includeSummary = req.query.summary === 'true';

  const response: Record<string, unknown> = {
    stats: result.stats,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    timestamp: new Date().toISOString(),
  };

  if (includeSummary) {
    response.summary = queryStatsStore.getSummary();
  }

  res.status(200).json(response);
});

// ============================================================
// HELPERS
// ============================================================

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Returns BullMQ queue statistics.
 * When the scheduler service (task 15.1) is available, this will
 * query actual queue state. For now, returns a placeholder structure
 * that reports no queues if Redis is not connected.
 */
function getQueueStats(): Array<{
  name: string;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  // Scheduler service is created in task 15.1.
  // When available, import and query it here.
  // For now, return empty array indicating no queues configured.
  return [];
}

export { requireAdmin };
export default router;
