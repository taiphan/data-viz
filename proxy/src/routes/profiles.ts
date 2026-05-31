import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { encryptConnectionParams, decryptConnectionParams, EncryptedPayload } from '../services/credential-vault.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes:profiles');
const router = Router();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const driverSchema = z.enum(['postgresql', 'mysql', 'mssql']);

const createProfileSchema = z.object({
  name: z.string().min(1).max(255),
  driver: driverSchema,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
  ssl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  driver: driverSchema.optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1).max(255).optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).max(1024).optional(),
  ssl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

const profileIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ============================================================
// In-memory profile store
// ============================================================

interface StoredProfile {
  id: string;
  name: string;
  driver: string;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  options?: Record<string, unknown>;
  encryptedCredentials: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
}

const profileStore = new Map<string, StoredProfile>();

// ============================================================
// POST /api/profiles
// ============================================================

router.post('/', (req: Request, res: Response) => {
  try {
    const parsed = createProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid profile parameters.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { name, driver, host, port, database, username, password, ssl, options } = parsed.data;

    const id = uuidv4();
    const now = new Date().toISOString();
    const encryptedCredentials = encryptConnectionParams({ username, password });

    const profile: StoredProfile = {
      id,
      name,
      driver,
      host,
      port,
      database,
      ssl: ssl ?? false,
      options,
      encryptedCredentials,
      createdAt: now,
      updatedAt: now,
    };

    profileStore.set(id, profile);

    logger.info({ profileId: id, name, requestId: req.requestId }, 'Profile created');

    res.status(201).json({
      id,
      name,
      driver,
      host,
      port,
      database,
      ssl: ssl ?? false,
      createdAt: now,
      updatedAt: now,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Profile creation failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to create profile.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/profiles
// ============================================================

router.get('/', (_req: Request, res: Response) => {
  const profiles = Array.from(profileStore.values()).map((p) => ({
    id: p.id,
    name: p.name,
    driver: p.driver,
    host: p.host,
    port: p.port,
    database: p.database,
    ssl: p.ssl,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  res.status(200).json({
    profiles,
    count: profiles.length,
    requestId: _req.requestId,
  });
});

// ============================================================
// GET /api/profiles/:id
// ============================================================

router.get('/:id', (req: Request, res: Response) => {
  const parsed = profileIdParamSchema.safeParse(req.params);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile ID format.',
      },
      requestId: req.requestId,
    });
    return;
  }

  const { id } = parsed.data;
  const profile = profileStore.get(id);

  if (!profile) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Profile not found.',
      },
      requestId: req.requestId,
    });
    return;
  }

  // Decrypt credentials for pre-populating the form
  const credentials = decryptConnectionParams(profile.encryptedCredentials);

  res.status(200).json({
    id: profile.id,
    name: profile.name,
    driver: profile.driver,
    host: profile.host,
    port: profile.port,
    database: profile.database,
    ssl: profile.ssl,
    username: credentials.username,
    password: credentials.password,
    options: profile.options,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    requestId: req.requestId,
  });
});

// ============================================================
// PUT /api/profiles/:id
// ============================================================

router.put('/:id', (req: Request, res: Response) => {
  try {
    const paramParsed = profileIdParamSchema.safeParse(req.params);

    if (!paramParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid profile ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = paramParsed.data;
    const existing = profileStore.get(id);

    if (!existing) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Profile not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const bodyParsed = updateProfileSchema.safeParse(req.body);

    if (!bodyParsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid update parameters.',
          details: bodyParsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const updates = bodyParsed.data;
    const now = new Date().toISOString();

    // If credentials are being updated, re-encrypt
    let encryptedCredentials = existing.encryptedCredentials;
    if (updates.username || updates.password) {
      const currentCreds = decryptConnectionParams(existing.encryptedCredentials);
      encryptedCredentials = encryptConnectionParams({
        username: updates.username ?? currentCreds.username,
        password: updates.password ?? currentCreds.password,
      });
    }

    const updated: StoredProfile = {
      ...existing,
      name: updates.name ?? existing.name,
      driver: updates.driver ?? existing.driver,
      host: updates.host ?? existing.host,
      port: updates.port ?? existing.port,
      database: updates.database ?? existing.database,
      ssl: updates.ssl ?? existing.ssl,
      options: updates.options ?? existing.options,
      encryptedCredentials,
      updatedAt: now,
    };

    profileStore.set(id, updated);

    logger.info({ profileId: id, requestId: req.requestId }, 'Profile updated');

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      driver: updated.driver,
      host: updated.host,
      port: updated.port,
      database: updated.database,
      ssl: updated.ssl,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Profile update failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to update profile.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// DELETE /api/profiles/:id
// ============================================================

router.delete('/:id', (req: Request, res: Response) => {
  const parsed = profileIdParamSchema.safeParse(req.params);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile ID format.',
      },
      requestId: req.requestId,
    });
    return;
  }

  const { id } = parsed.data;
  const profile = profileStore.get(id);

  if (!profile) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Profile not found.',
      },
      requestId: req.requestId,
    });
    return;
  }

  profileStore.delete(id);

  logger.info({ profileId: id, requestId: req.requestId }, 'Profile deleted');

  res.status(200).json({
    success: true,
    id,
    requestId: req.requestId,
  });
});

// Export for testing
export { profileStore };
export default router;
