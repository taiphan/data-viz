import crypto from 'node:crypto';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('credential-vault');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

export interface EncryptedPayload {
  iv: string;       // hex-encoded initialization vector
  ciphertext: string; // hex-encoded encrypted data
  authTag: string;  // hex-encoded authentication tag
}

/**
 * Retrieves the encryption key from environment variables.
 * The key must be a 64-character hex string (32 bytes / 256 bits).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set.');
  }

  if (keyHex.length !== KEY_LENGTH * 2) {
    throw new Error(
      `ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes).`
    );
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Uses a random IV for each encryption operation.
 * Returns the IV, ciphertext, and authentication tag.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  logger.debug('Credential encrypted successfully');

  return {
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts an encrypted payload using AES-256-GCM.
 * Verifies the authentication tag for integrity.
 * Throws if the payload has been tampered with.
 */
export function decrypt(payload: EncryptedPayload): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, 'hex');
  const ciphertext = Buffer.from(payload.ciphertext, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  logger.debug('Credential decrypted successfully');

  return decrypted.toString('utf8');
}

/**
 * Encrypts connection parameters (credentials portion) before storage.
 * Accepts a record of key-value pairs and encrypts the entire JSON payload.
 */
export function encryptConnectionParams(
  params: Record<string, string>
): EncryptedPayload {
  const json = JSON.stringify(params);
  return encrypt(json);
}

/**
 * Decrypts connection parameters when establishing a connection.
 * Returns the original key-value pairs.
 */
export function decryptConnectionParams(
  payload: EncryptedPayload
): Record<string, string> {
  const json = decrypt(payload);
  return JSON.parse(json) as Record<string, string>;
}
