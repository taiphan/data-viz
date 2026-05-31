import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createUser, verifyCredentials, getUserById } from '../services/user-store.js';
import { generateTokenPair, verifyRefreshToken, verifyAccessToken } from '../services/jwt-service.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('auth-routes');
const router = Router();

// Rate limiting state (simple in-memory, per-IP)
const loginAttempts: Map<string, { count: number; resetAt: number }> = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count++;
  return true;
}

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input.',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const { username, password, displayName } = parsed.data;

    const user = await createUser(username, password, displayName);
    const tokens = generateTokenPair({ userId: user.id, username: user.username });

    logger.info({ username: user.username }, 'User registered');

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      ...tokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';

    if (message === 'Username already exists') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'Username already taken.' },
      });
      return;
    }

    logger.error({ error: message }, 'Registration error');
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message },
    });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many login attempts. Please try again later.',
      },
    });
    return;
  }

  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username and password are required.',
        },
      });
      return;
    }

    const { username, password } = parsed.data;
    const user = await verifyCredentials(username, password);

    if (!user) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid username or password.' },
      });
      return;
    }

    const tokens = generateTokenPair({ userId: user.id, username: user.username });

    logger.info({ username: user.username }, 'User logged in');

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      ...tokens,
    });
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Login error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
  }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required.' },
      });
      return;
    }

    const payload = verifyRefreshToken(parsed.data.refreshToken);

    if (!payload) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token.' },
      });
      return;
    }

    const user = getUserById(payload.userId);

    if (!user) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'User no longer exists.' },
      });
      return;
    }

    const tokens = generateTokenPair({ userId: user.id, username: user.username });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      ...tokens,
    });
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Token refresh error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token.' },
    });
    return;
  }

  const user = getUserById(payload.userId);

  if (!user) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'User not found.' },
    });
    return;
  }

  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    },
  });
});

export default router;
