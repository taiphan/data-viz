import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { schedulerService } from '../services/scheduler.js';
import type { ExtractRefreshPayload } from '../services/scheduler.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes:extracts');
const router = Router();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

/**
 * Validates a cron expression (5 or 6 fields).
 * Format: second(optional) minute hour day-of-month month day-of-week
 */
const cronExpressionSchema = z.string().regex(
  /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/\?LW]+)\s+(\*|[0-9,\-\/A-Z]+)(\s+(\*|[0-9,\-\/\?L#A-Z]+))?$/,
  'Invalid cron expression. Expected 5 or 6 fields.',
);

const createExtractSchema = z.object({
  name: z.string().min(1).max(255),
  connectionId: z.string().uuid(),
  query: z.string().min(1).max(10000),
  destination: z.string().min(1).max(1024),
  description: z.string().max(1024).optional(),
});

const scheduleSchema = z.object({
  cron: cronExpressionSchema,
  enabled: z.boolean().optional().default(true),
  timezone: z.string().max(100).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const extractIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ============================================================
// IN-MEMORY EXTRACT STORE
// ============================================================

export interface ExtractDefinition {
  id: string;
  name: string;
  connectionId: string;
  query: string;
  destination: string;
  description?: string;
  schedule?: {
    cron: string;
    enabled: boolean;
    timezone?: string;
  };
  jobId?: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastRunAt?: string;
  lastRunDurationMs?: number;
  lastRunError?: string;
  lastRunRowCount?: number;
  nextRunAt?: string;
  history: ExtractRunRecord[];
  createdAt: string;
  updatedAt: string;
}

interface ExtractRunRecord {
  id: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed';
  rowCount?: number;
  error?: string;
}

const extractStore = new Map<string, ExtractDefinition>();

// ============================================================
// POST /api/extracts — Create extract definition
// ============================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createExtractSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid extract parameters.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { name, connectionId, query, destination, description } = parsed.data;
    const id = uuidv4();
    const now = new Date().toISOString();

    const extract: ExtractDefinition = {
      id,
      name,
      connectionId,
      query,
      destination,
      description,
      status: 'idle',
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    extractStore.set(id, extract);

    logger.info({ extractId: id, requestId: req.requestId }, 'Extract created');

    res.status(201).json({
      id,
      name,
      connectionId,
      query,
      destination,
      description,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Extract creation failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to create extract.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// PUT /api/extracts/:id/schedule — Set cron schedule
// ============================================================

router.put('/:id/schedule', async (req: Request, res: Response) => {
  try {
    const paramsParsed = extractIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid extract ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const extract = extractStore.get(id);

    if (!extract) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Extract not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const bodyParsed = scheduleSchema.safeParse(req.body);

    if (!bodyParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid schedule parameters.',
          details: bodyParsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { cron, enabled, timezone } = bodyParsed.data;

    // Remove existing scheduled job if present
    if (extract.jobId) {
      await schedulerService.removeJob(extract.jobId);
    }

    let jobId: string | undefined;

    if (enabled) {
      const payload: ExtractRefreshPayload = {
        type: 'extract-refresh',
        extractId: id,
        connectionId: extract.connectionId,
        query: extract.query,
        destination: extract.destination,
      };

      jobId = await schedulerService.addJob(payload, {
        repeat: { pattern: cron },
        jobId: `extract-${id}`,
      });
    }

    extract.schedule = { cron, enabled, timezone };
    extract.jobId = jobId;
    extract.updatedAt = new Date().toISOString();

    logger.info(
      { extractId: id, cron, enabled, requestId: req.requestId },
      'Extract schedule updated',
    );

    res.status(200).json({
      id,
      schedule: extract.schedule,
      jobId,
      updatedAt: extract.updatedAt,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Schedule update failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to update schedule.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// POST /api/extracts/:id/test — Run extract immediately (preview)
// ============================================================

router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const paramsParsed = extractIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid extract ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const extract = extractStore.get(id);

    if (!extract) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Extract not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const runId = uuidv4();
    const startedAt = new Date().toISOString();

    const runRecord: ExtractRunRecord = {
      id: runId,
      startedAt,
      status: 'running',
    };

    extract.status = 'running';
    extract.history.unshift(runRecord);

    // Queue the job for immediate execution
    const payload: ExtractRefreshPayload = {
      type: 'extract-refresh',
      extractId: id,
      connectionId: extract.connectionId,
      query: extract.query,
      destination: extract.destination,
    };

    const jobId = await schedulerService.addJob(payload, {
      jobId: `extract-test-${id}-${runId}`,
    });

    extract.lastRunAt = startedAt;
    extract.updatedAt = new Date().toISOString();

    logger.info(
      { extractId: id, runId, jobId, requestId: req.requestId },
      'Extract test run queued',
    );

    res.status(202).json({
      id,
      runId,
      jobId,
      status: 'running',
      startedAt,
      message: 'Extract test run queued for immediate execution.',
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Extract test run failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to run extract test.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/extracts/:id/status — Get extract status and history
// ============================================================

router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const paramsParsed = extractIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid extract ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const extract = extractStore.get(id);

    if (!extract) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Extract not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Resolve next run from scheduler if scheduled
    let nextRunAt: string | undefined;
    if (extract.jobId && extract.schedule?.enabled) {
      const repeatableJobs = await schedulerService.getRepeatableJobs();
      const matchingJob = repeatableJobs.find(
        (j) => j.id === `extract-${id}` || j.key?.includes(id),
      );
      if (matchingJob?.next) {
        nextRunAt = new Date(matchingJob.next).toISOString();
      }
    }

    res.status(200).json({
      id,
      name: extract.name,
      status: extract.status,
      schedule: extract.schedule ?? null,
      lastRunAt: extract.lastRunAt ?? null,
      lastRunDurationMs: extract.lastRunDurationMs ?? null,
      lastRunError: extract.lastRunError ?? null,
      lastRunRowCount: extract.lastRunRowCount ?? null,
      nextRunAt: nextRunAt ?? null,
      history: extract.history.slice(0, 20),
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Extract status fetch failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to fetch extract status.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/extracts — List all extracts with pagination
// ============================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const queryParsed = paginationSchema.safeParse(req.query);

    if (!queryParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid pagination parameters.',
          details: queryParsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { page, limit } = queryParsed.data;
    const allExtracts = Array.from(extractStore.values());

    // Sort by createdAt descending (newest first)
    allExtracts.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = allExtracts.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = allExtracts.slice(offset, offset + limit).map((e) => ({
      id: e.id,
      name: e.name,
      connectionId: e.connectionId,
      destination: e.destination,
      status: e.status,
      schedule: e.schedule ?? null,
      lastRunAt: e.lastRunAt ?? null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Extract list failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to list extracts.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// DELETE /api/extracts/:id — Remove extract and cancel jobs
// ============================================================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const paramsParsed = extractIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid extract ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const extract = extractStore.get(id);

    if (!extract) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Extract not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Cancel scheduled job if present
    if (extract.jobId) {
      await schedulerService.removeJob(extract.jobId);
    }

    // Remove any repeatable jobs associated with this extract
    const repeatableJobs = await schedulerService.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === `extract-${id}` || job.key?.includes(id)) {
        await schedulerService.removeRepeatableByKey(job.key);
      }
    }

    extractStore.delete(id);

    logger.info({ extractId: id, requestId: req.requestId }, 'Extract deleted');

    res.status(200).json({
      success: true,
      id,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Extract deletion failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to delete extract.',
      },
      requestId: req.requestId,
    });
  }
});

// Export store for testing
export { extractStore };
export default router;
