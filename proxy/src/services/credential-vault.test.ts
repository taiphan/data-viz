import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { encrypt, decrypt, encryptConnectionParams, decryptConnectionParams } from './credential-vault.js';
import type { EncryptedPayload } from './credential-vault.js';

// Generate a valid 256-bit key for testing
const TEST_KEY = crypto.randomBytes(32).toString('hex');

describe('credential-vault', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'my-secret-password';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt an empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode characters', () => {
      const plaintext = '密码🔐パスワード';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt a long string', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encryption properties', () => {
    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'same-password';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it('should produce a valid EncryptedPayload structure', () => {
      const encrypted = encrypt('test');

      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted.iv).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.ciphertext).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce a 12-byte IV (24 hex chars)', () => {
      const encrypted = encrypt('test');
      expect(encrypted.iv.length).toBe(24);
    });

    it('should produce a 16-byte auth tag (32 hex chars)', () => {
      const encrypted = encrypt('test');
      expect(encrypted.authTag.length).toBe(32);
    });
  });

  describe('integrity verification', () => {
    it('should throw when ciphertext is tampered with', () => {
      const encrypted = encrypt('secret');
      const tampered: EncryptedPayload = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.replace(
          encrypted.ciphertext[0],
          encrypted.ciphertext[0] === 'a' ? 'b' : 'a'
        ),
      };

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw when auth tag is tampered with', () => {
      const encrypted = encrypt('secret');
      const tampered: EncryptedPayload = {
        ...encrypted,
        authTag: '0'.repeat(32),
      };

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw when IV is tampered with', () => {
      const encrypted = encrypt('secret');
      const tampered: EncryptedPayload = {
        ...encrypted,
        iv: '0'.repeat(24),
      };

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('key validation', () => {
    it('should throw when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is not set.');
    });

    it('should throw when ENCRYPTION_KEY has wrong length', () => {
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
    });
  });

  describe('encryptConnectionParams/decryptConnectionParams', () => {
    it('should round-trip connection parameters', () => {
      const params = {
        host: 'db.example.com',
        port: '5432',
        database: 'analytics',
        username: 'admin',
        password: 'super-secret-p@ss!',
      };

      const encrypted = encryptConnectionParams(params);
      const decrypted = decryptConnectionParams(encrypted);

      expect(decrypted).toEqual(params);
    });

    it('should handle empty params object', () => {
      const params = {};
      const encrypted = encryptConnectionParams(params);
      const decrypted = decryptConnectionParams(encrypted);

      expect(decrypted).toEqual(params);
    });

    it('should handle params with special characters', () => {
      const params = {
        password: 'p@$$w0rd!#%^&*(){}[]|\\:";\'<>?,./~`',
        connectionString: 'postgres://user:p%40ss@host:5432/db?ssl=true&timeout=30',
      };

      const encrypted = encryptConnectionParams(params);
      const decrypted = decryptConnectionParams(encrypted);

      expect(decrypted).toEqual(params);
    });
  });
});
