import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { connectionManager } from '../services/connection-manager.js';
import { QueryExecutor } from '../services/query-executor.js';
import { ExplainService } from '../services/explain-service.js';
import { createLogger } from '../lib/logger.js';
import { connectionStore } from './connections.js';

const logger = createLogger('routes:query');
const router = Router();
const queryExecutor = new QueryExecutor();
const explainService = new ExplainService();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const executeQuerySchema = z.object({
  connectionId: z.string().uuid(),
  sql: z.string().min(1).max(100_000),
  parameters: z.record(z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ])).optional(),
  limit: z.number().int().min(1).max(1_000_000).optional(),
  timeoutMs: z.number().int().min(1000).max(300_000).optional(),
});

const previewParamSchema = z.object({
  id: z.string().uuid(),
});

const previewQuerySchema = z.object({
  table: z.string().min(1).max(255),
  schema: z.string().min(1).max(255).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const explainQuerySchema = z.object({
  connectionId: z.string().uuid(),
  sql: z.string().min(1).max(100_000),
  analyze: z.boolean().optional(),
});

// ============================================================
// In-memory query result cache (for preview retrieval)
// ============================================================

interface CachedQuery {
  queryId: string;
  connectionId: string;
  sql: string;
  createdAt: string;
  result?: {
    fields: { name: string; dataType: string }[];
    rows: Record<string, unknown>[];
    rowCount: number;
    totalRows: number;
    executionTimeMs: number;
    truncated: boolean;
  };
}

const queryCache = new Map<string, CachedQuery>();

// Clean up old cache entries every 10 minutes
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [id, entry] of queryCache) {
    if (new Date(entry.createdAt).getTime() < tenMinutesAgo) {
      queryCache.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

// ============================================================
// POST /api/query
// ============================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = executeQuerySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { connectionId, sql, parameters, limit, timeoutMs } = parsed.data;

    // Verify connection exists
    const stored = connectionStore.get(connectionId);
    if (!stored) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const poolInfo = connectionManager.getPoolInfo(connectionId);
    if (!poolInfo) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection pool not found or expired.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const result = await queryExecutor.execute(
      { driver: stored.driver, pool: poolInfo.pool },
      { sql, parameters, limit, timeoutMs }
    );

    // Cache the result for preview retrieval
    const queryId = uuidv4();
    queryCache.set(queryId, {
      queryId,
      connectionId,
      sql,
      createdAt: new Date().toISOString(),
      result,
    });

    logger.info({
      queryId,
      connectionId,
      rowCount: result.rowCount,
      executionTimeMs: result.executionTimeMs,
      requestId: req.requestId,
    }, 'Query executed');

    res.status(200).json({
      queryId,
      ...result,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = (err as { code?: string }).code || 'QUERY_ERROR';
    logger.error({ err: message, requestId: req.requestId }, 'Query execution failed');
    res.status(500).json({
      error: {
        code,
        message,
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// POST /api/query/explain
// ============================================================

router.post('/explain', async (req: Request, res: Response) => {
  try {
    const parsed = explainQuerySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid explain parameters.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { connectionId, sql, analyze } = parsed.data;

    // Verify connection exists
    const stored = connectionStore.get(connectionId);
    if (!stored) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const poolInfo = connectionManager.getPoolInfo(connectionId);
    if (!poolInfo) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection pool not found or expired.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const plan = await explainService.explain(
      { driver: stored.driver, pool: poolInfo.pool },
      { sql, analyze }
    );

    logger.info({
      connectionId,
      totalCost: plan.totalCost,
      totalRows: plan.totalRows,
      requestId: req.requestId,
    }, 'EXPLAIN plan generated');

    res.status(200).json({
      ...plan,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = (err as { code?: string }).code || 'EXPLAIN_ERROR';
    logger.error({ err: message, requestId: req.requestId }, 'EXPLAIN execution failed');
    res.status(500).json({
      error: {
        code,
        message: 'Unable to generate execution plan.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/query/:id/preview
// ============================================================

router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const paramParsed = previewParamSchema.safeParse(req.params);

    if (!paramParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramParsed.data;

    // Check if this is a cached query result
    const cached = queryCache.get(id);
    if (cached && cached.result) {
      const previewRows = cached.result.rows.slice(0, 100);
      res.status(200).json({
        queryId: id,
        fields: cached.result.fields,
        rows: previewRows,
        rowCount: previewRows.length,
        totalRows: cached.result.totalRows,
        executionTimeMs: cached.result.executionTimeMs,
        truncated: cached.result.truncated,
        requestId: req.requestId,
      });
      return;
    }

    // If not cached, check if it's a connectionId for table preview
    const queryParsed = previewQuerySchema.safeParse(req.query);

    if (!queryParsed.success) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Query result not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { table, schema, limit } = queryParsed.data;
    const stored = connectionStore.get(id);

    if (!stored) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const poolInfo = connectionManager.getPoolInfo(id);
    if (!poolInfo) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection pool not found or expired.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Build preview SQL based on driver
    const previewLimit = limit ?? 100;
    const qualifiedTable = schema ? `${schema}.${table}` : table;
    const previewSql = `SELECT * FROM ${qualifiedTable}`;

    const result = await queryExecutor.preview(
      { driver: stored.driver, pool: poolInfo.pool },
      previewSql,
      {},
      previewLimit
    );

    res.status(200).json({
      queryId: id,
      table: qualifiedTable,
      ...result,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Query preview failed');
    res.status(500).json({
      error: {
        code: 'PREVIEW_FAILED',
        message: 'Unable to fetch preview.',
      },
      requestId: req.requestId,
    });
  }
});

export default router;
