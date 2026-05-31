import bcrypt from 'bcrypt';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('user-store');

const BCRYPT_ROUNDS = 12;

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

/**
 * In-memory user store.
 * In production, this would be backed by PostgreSQL via Prisma.
 */
const users: Map<string, User> = new Map();

export async function createUser(
  username: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const normalized = username.toLowerCase().trim();

  if (users.has(normalized)) {
    throw new Error('Username already exists');
  }

  if (normalized.length < 3 || normalized.length > 32) {
    throw new Error('Username must be 3-32 characters');
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must be 8-128 characters');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user: User = {
    id: crypto.randomUUID(),
    username: normalized,
    passwordHash,
    displayName: displayName || normalized,
    createdAt: new Date().toISOString(),
  };

  users.set(normalized, user);
  logger.info({ username: normalized }, 'User created');

  return user;
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const normalized = username.toLowerCase().trim();
  const user = users.get(normalized);

  if (!user) {
    // Constant-time comparison to prevent timing attacks
    await bcrypt.hash(password, BCRYPT_ROUNDS);
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export function getUserById(id: string): User | undefined {
  for (const user of users.values()) {
    if (user.id === id) return user;
  }
  return undefined;
}

export function getUserByUsername(username: string): User | undefined {
  return users.get(username.toLowerCase().trim());
}
