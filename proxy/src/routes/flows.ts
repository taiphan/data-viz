import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { schedulerService } from '../services/scheduler.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes:flows');
const router = Router();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const cronExpressionSchema = z.string().regex(
  /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/\?LW]+)\s+(\*|[0-9,\-\/A-Z]+)(\s+(\*|[0-9,\-\/\?L#A-Z]+))?$/,
  'Invalid cron expression. Expected 5 or 6 fields.',
);

const flowStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.enum(['input', 'clean', 'join', 'aggregate', 'pivot', 'union', 'output']),
  config: z.record(z.unknown()),
  enabled: z.boolean(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const flowConnectionSchema = z.object({
  id: z.string().min(1),
  sourceStepId: z.string().min(1),
  targetStepId: z.string().min(1),
});

const createFlowSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(2048).optional(),
  steps: z.array(flowStepSchema).min(1),
  connections: z.array(flowConnectionSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
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

const flowIdParamSchema = z.object({
  id: z.string().min(1),
});

// ============================================================
// IN-MEMORY FLOW STORE
// ============================================================

export interface StoredFlow {
  id: string;
  name: string;
  description?: string;
  steps: unknown[];
  connections: unknown[];
  schedule?: {
    cron: string;
    enabled: boolean;
    timezone?: string;
    jobId?: string;
  };
  lastRunAt?: string;
  lastRunStatus?: 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
}

const flowStore = new Map<string, StoredFlow>();

// ============================================================
// POST /api/flows — Create or update a flow definition
// ============================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createFlowSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid flow definition.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { name, description, steps, connections } = parsed.data;
    const now = new Date().toISOString();
    const id = parsed.data.id || uuidv4();

    const existing = flowStore.get(id);

    const flow: StoredFlow = {
      id,
      name,
      description,
      steps,
      connections,
      schedule: existing?.schedule,
      lastRunAt: existing?.lastRunAt,
      lastRunStatus: existing?.lastRunStatus,
      createdAt: existing?.createdAt || parsed.data.createdAt || now,
      updatedAt: now,
    };

    flowStore.set(id, flow);

    logger.info({ flowId: id, requestId: req.requestId }, 'Flow saved');

    res.status(existing ? 200 : 201).json({
      id,
      name,
      description,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Flow save failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to save flow.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/flows/:id — Load a flow definition
// ============================================================

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const paramsParsed = flowIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid flow ID.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const flow = flowStore.get(id);

    if (!flow) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Flow not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    res.status(200).json({
      ...flow,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Flow load failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to load flow.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/flows — List all flows with pagination
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
    const allFlows = Array.from(flowStore.values());

    // Sort by updatedAt descending
    allFlows.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    const total = allFlows.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = allFlows.slice(offset, offset + limit).map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      schedule: f.schedule ?? null,
      lastRunAt: f.lastRunAt ?? null,
      lastRunStatus: f.lastRunStatus ?? null,
    }));

    res.status(200).json({
      items,
      pagination: { page, limit, total, totalPages },
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Flow list failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to list flows.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// DELETE /api/flows/:id — Delete a flow and cancel scheduled jobs
// ============================================================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const paramsParsed = flowIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid flow ID.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const flow = flowStore.get(id);

    if (!flow) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Flow not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Cancel scheduled job if present
    if (flow.schedule?.jobId) {
      await schedulerService.removeJob(flow.schedule.jobId);
    }

    // Remove repeatable jobs
    const repeatableJobs = await schedulerService.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === `flow-${id}` || job.key?.includes(id)) {
        await schedulerService.removeRepeatableByKey(job.key);
      }
    }

    flowStore.delete(id);

    logger.info({ flowId: id, requestId: req.requestId }, 'Flow deleted');

    res.status(200).json({
      success: true,
      id,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Flow deletion failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to delete flow.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// PUT /api/flows/:id/schedule — Schedule flow execution
// ============================================================

router.put('/:id/schedule', async (req: Request, res: Response) => {
  try {
    const paramsParsed = flowIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid flow ID.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const flow = flowStore.get(id);

    if (!flow) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Flow not found.',
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

    // Remove existing scheduled job
    if (flow.schedule?.jobId) {
      await schedulerService.removeJob(flow.schedule.jobId);
    }

    let jobId: string | undefined;

    if (enabled) {
      jobId = await schedulerService.addJob(
        {
          type: 'scheduled-query',
          queryId: `flow-${id}`,
          connectionId: id,
          query: JSON.stringify({ flowId: id }),
          schedule: cron,
        },
        {
          repeat: { pattern: cron },
          jobId: `flow-${id}`,
        },
      );
    }

    flow.schedule = { cron, enabled, timezone, jobId };
    flow.updatedAt = new Date().toISOString();

    logger.info(
      { flowId: id, cron, enabled, requestId: req.requestId },
      'Flow schedule updated',
    );

    res.status(200).json({
      id,
      schedule: flow.schedule,
      jobId,
      updatedAt: flow.updatedAt,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Flow schedule update failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to update flow schedule.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// DELETE /api/flows/:id/schedule — Remove flow schedule
// ============================================================

router.delete('/:id/schedule', async (req: Request, res: Response) => {
  try {
    const paramsParsed = flowIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid flow ID.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramsParsed.data;
    const flow = flowStore.get(id);

    if (!flow) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Flow not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Remove scheduled job
    if (flow.schedule?.jobId) {
      await schedulerService.removeJob(flow.schedule.jobId);
    }

    // Remove repeatable jobs
    const repeatableJobs = await schedulerService.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === `flow-${id}` || job.key?.includes(id)) {
        await schedulerService.removeRepeatableByKey(job.key);
      }
    }

    flow.schedule = undefined;
    flow.updatedAt = new Date().toISOString();

    logger.info({ flowId: id, requestId: req.requestId }, 'Flow schedule removed');

    res.status(200).json({
      success: true,
      id,
      updatedAt: flow.updatedAt,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Flow unschedule failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to remove flow schedule.',
      },
      requestId: req.requestId,
    });
  }
});

// Export store for testing
export { flowStore };
export default router;
