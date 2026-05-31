import { Router, Request, Response } from 'express';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import { schedulerService } from '../services/scheduler.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes:webhooks');
const router = Router();

// ============================================================
// TYPES
// ============================================================

export interface WebhookConfig {
  extractId: string;
  secret: string;
  filters?: PayloadFilter[];
  enabled: boolean;
  createdAt: string;
}

export interface PayloadFilter {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'exists';
  value?: string | number | boolean;
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const extractIdParamSchema = z.object({
  extractId: z.string().min(1).max(255),
});

const payloadFilterSchema = z.object({
  field: z.string().min(1).max(255),
  operator: z.enum(['eq', 'neq', 'contains', 'exists']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const webhookConfigSchema = z.object({
  extractId: z.string().min(1).max(255),
  secret: z.string().min(32).max(512),
  filters: z.array(payloadFilterSchema).max(20).optional(),
  enabled: z.boolean().optional().default(true),
});

// ============================================================
// IN-MEMORY WEBHOOK CONFIG STORE
// ============================================================

const webhookStore = new Map<string, WebhookConfig>();

// ============================================================
// HMAC-SHA256 SIGNATURE VERIFICATION
// ============================================================

/**
 * Verifies the HMAC-SHA256 signature of the request body.
 * Expects header: X-Webhook-Signature: sha256=<hex-digest>
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret || !payload) {
    return false;
  }

  const prefix = 'sha256=';
  if (!signature.startsWith(prefix)) {
    return false;
  }

  const providedDigest = signature.slice(prefix.length);
  const expectedDigest = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(providedDigest, 'hex'),
    Buffer.from(expectedDigest, 'hex'),
  );
}

// ============================================================
// PAYLOAD FILTER EVALUATION
// ============================================================

/**
 * Evaluates payload filters against the incoming webhook body.
 * Returns true if ALL filters match (AND logic).
 * Returns true if no filters are configured.
 */
export function evaluateFilters(
  payload: Record<string, unknown>,
  filters: PayloadFilter[],
): boolean {
  if (!filters || filters.length === 0) {
    return true;
  }

  return filters.every((filter) => evaluateSingleFilter(payload, filter));
}

function evaluateSingleFilter(
  payload: Record<string, unknown>,
  filter: PayloadFilter,
): boolean {
  const value = getNestedValue(payload, filter.field);

  switch (filter.operator) {
    case 'exists':
      return value !== undefined && value !== null;
    case 'eq':
      return value === filter.value;
    case 'neq':
      return value !== filter.value;
    case 'contains':
      if (typeof value === 'string' && typeof filter.value === 'string') {
        return value.includes(filter.value);
      }
      return false;
    default:
      return false;
  }
}

/**
 * Resolves dot-notation field paths (e.g., "data.action") from a nested object.
 */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================
// POST /api/webhooks/trigger/:extractId
// ============================================================

router.post('/trigger/:extractId', async (req: Request, res: Response) => {
  try {
    const paramsParsed = extractIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid extract ID.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { extractId } = paramsParsed.data;

    // Look up webhook configuration
    const config = webhookStore.get(extractId);

    if (!config) {
      // Return 404 but with generic message to avoid enumeration
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not configured for this extract.',
        },
        requestId: req.requestId,
      });
      return;
    }

    if (!config.enabled) {
      res.status(403).json({
        error: {
          code: 'WEBHOOK_DISABLED',
          message: 'Webhook trigger is disabled for this extract.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Verify HMAC-SHA256 signature
    const signature = req.headers['x-webhook-signature'] as string | undefined;

    if (!signature) {
      logger.warn({ extractId, requestId: req.requestId }, 'Missing webhook signature');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing webhook signature.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // We need the raw body for signature verification
    const rawBody = JSON.stringify(req.body);
    const isValid = verifySignature(rawBody, signature, config.secret);

    if (!isValid) {
      logger.warn({ extractId, requestId: req.requestId }, 'Invalid webhook signature');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid webhook signature.',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Evaluate payload filters
    const payload = (req.body || {}) as Record<string, unknown>;

    if (config.filters && config.filters.length > 0) {
      const filtersMatch = evaluateFilters(payload, config.filters);

      if (!filtersMatch) {
        logger.info(
          { extractId, requestId: req.requestId },
          'Webhook payload did not match filters — skipping',
        );
        res.status(200).json({
          triggered: false,
          reason: 'Payload did not match configured filters.',
          requestId: req.requestId,
        });
        return;
      }
    }

    // Queue extract refresh job
    const jobId = await schedulerService.addJob(
      {
        type: 'extract-refresh',
        extractId,
        connectionId: payload.connectionId as string || '',
        query: payload.query as string || '',
        destination: payload.destination as string || '',
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    logger.info(
      { extractId, jobId, requestId: req.requestId },
      'Webhook triggered extract refresh',
    );

    res.status(202).json({
      triggered: true,
      jobId,
      extractId,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Webhook trigger failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to process webhook trigger.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// POST /api/webhooks/config
// Register or update a webhook configuration for an extract.
// ============================================================

router.post('/config', async (req: Request, res: Response) => {
  try {
    const parsed = webhookConfigSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid webhook configuration.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { extractId, secret, filters, enabled } = parsed.data;

    const config: WebhookConfig = {
      extractId,
      secret,
      filters: (filters || []) as PayloadFilter[],
      enabled,
      createdAt: new Date().toISOString(),
    };

    webhookStore.set(extractId, config);

    logger.info({ extractId, requestId: req.requestId }, 'Webhook configured');

    res.status(201).json({
      extractId,
      enabled,
      filtersCount: config.filters?.length || 0,
      createdAt: config.createdAt,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Webhook config failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to save webhook configuration.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// DELETE /api/webhooks/config/:extractId
// Remove a webhook configuration.
// ============================================================

router.delete('/config/:extractId', async (req: Request, res: Response) => {
  try {
    const paramsParsed = extractIdParamSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid extract ID.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { extractId } = paramsParsed.data;
    const existed = webhookStore.delete(extractId);

    if (!existed) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook configuration not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    logger.info({ extractId, requestId: req.requestId }, 'Webhook config removed');

    res.status(200).json({
      success: true,
      extractId,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Webhook config deletion failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to remove webhook configuration.',
      },
      requestId: req.requestId,
    });
  }
});

// Export for testing
export { webhookStore };
export default router;
