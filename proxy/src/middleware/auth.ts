import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/jwt-service.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('auth');

/**
 * Validates the JWT access token from the Authorization header.
 * Expects: Authorization: Bearer <jwt>
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn({ requestId: req.requestId }, 'Missing Authorization header');
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
      requestId: req.requestId,
    });
    return;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn({ requestId: req.requestId }, 'Malformed Authorization header');
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication format. Expected: Bearer <token>',
      },
      requestId: req.requestId,
    });
    return;
  }

  const token = parts[1];

  if (!token || token.trim().length === 0) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
      requestId: req.requestId,
    });
    return;
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    logger.warn({ requestId: req.requestId }, 'Invalid or expired token');
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired session token.',
      },
      requestId: req.requestId,
    });
    return;
  }

  // Attach user info to request
  req.userId = payload.userId;
  req.username = payload.username;
  next();
}
