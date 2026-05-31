import jwt from 'jsonwebtoken';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('jwt');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPayload {
  userId: string;
  username: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function generateTokenPair(payload: TokenPayload): TokenPair {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY },
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & { type?: string };
    if (decoded.type === 'refresh') return null;
    return { userId: decoded.userId, username: decoded.username };
  } catch (err) {
    logger.debug({ error: (err as Error).message }, 'Token verification failed');
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & { type?: string };
    if (decoded.type !== 'refresh') return null;
    return { userId: decoded.userId, username: decoded.username };
  } catch (err) {
    logger.debug({ error: (err as Error).message }, 'Refresh token verification failed');
    return null;
  }
}
