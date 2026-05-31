import { describe, it, expect } from 'vitest';
import {
  formatConnectionError,
  formatConnectionErrorStructured,
  detectErrorCategory,
  sanitizeMessage,
  ErrorCategory,
  FormattedConnectionError,
} from './error-utils';

describe('error-utils', () => {
  describe('detectErrorCategory', () => {
    it('detects auth errors from Error objects', () => {
      expect(detectErrorCategory(new Error('Authentication failed'))).toBe('auth');
      expect(detectErrorCategory(new Error('401 Unauthorized'))).toBe('auth');
      expect(detectErrorCategory(new Error('403 Forbidden'))).toBe('auth');
      expect(detectErrorCategory(new Error('permission denied'))).toBe('auth');
      expect(detectErrorCategory(new Error('login failed'))).toBe('auth');
    });

    it('detects timeout errors', () => {
      expect(detectErrorCategory(new Error('Connection timed out'))).toBe('timeout');
      expect(detectErrorCategory(new Error('ETIMEDOUT'))).toBe('timeout');
      expect(detectErrorCategory(new Error('ESOCKETTIMEDOUT'))).toBe('timeout');
      expect(detectErrorCategory(new Error('deadline exceeded'))).toBe('timeout');
    });

    it('detects network errors', () => {
      expect(detectErrorCategory(new Error('ECONNREFUSED'))).toBe('network');
      expect(detectErrorCategory(new Error('ECONNRESET'))).toBe('network');
      expect(detectErrorCategory(new Error('ENOTFOUND'))).toBe('network');
      expect(detectErrorCategory(new Error('EHOSTUNREACH'))).toBe('network');
      expect(detectErrorCategory(new Error('fetch failed'))).toBe('network');
    });

    it('detects proxy-unavailable errors', () => {
      expect(detectErrorCategory(new Error('503 Service Unavailable'))).toBe('proxy-unavailable');
      expect(detectErrorCategory(new Error('502 Bad Gateway'))).toBe('proxy-unavailable');
      expect(detectErrorCategory(new Error('proxy error'))).toBe('proxy-unavailable');
    });

    it('detects parse errors', () => {
      expect(detectErrorCategory(new Error('JSON parse error'))).toBe('parse');
      expect(detectErrorCategory(new Error('Unexpected token <'))).toBe('parse');
      expect(detectErrorCategory(new Error('malformed response'))).toBe('parse');
    });

    it('detects query errors', () => {
      expect(detectErrorCategory(new Error('syntax error at position 5'))).toBe('query');
      expect(detectErrorCategory(new Error('relation "users" does not exist'))).toBe('query');
      expect(detectErrorCategory(new Error('column "foo" does not exist'))).toBe('query');
    });

    it('defaults to network for unknown errors', () => {
      expect(detectErrorCategory(new Error('something went wrong'))).toBe('network');
      expect(detectErrorCategory(null)).toBe('network');
      expect(detectErrorCategory(undefined)).toBe('network');
      expect(detectErrorCategory(42)).toBe('network');
    });

    it('handles string errors', () => {
      expect(detectErrorCategory('Authentication failed')).toBe('auth');
      expect(detectErrorCategory('ECONNREFUSED')).toBe('network');
    });

    it('handles objects with message property', () => {
      expect(detectErrorCategory({ message: 'timeout' })).toBe('timeout');
    });
  });

  describe('formatConnectionError', () => {
    it('returns a user-friendly string', () => {
      const result = formatConnectionError(new Error('ECONNREFUSED'));
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('maps ECONNREFUSED to "Connection refused" message', () => {
      const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const result = formatConnectionError(error);
      expect(result).toContain('Connection refused');
    });

    it('maps ETIMEDOUT to "Connection timed out" message', () => {
      const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
      const result = formatConnectionError(error);
      expect(result).toContain('Connection timed out');
    });

    it('maps ENOTFOUND to "Host not found" message', () => {
      const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      const result = formatConnectionError(error);
      expect(result).toContain('Host not found');
    });

    it('maps EHOSTUNREACH to "Host is unreachable" message', () => {
      const error = Object.assign(new Error('EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
      const result = formatConnectionError(error);
      expect(result).toContain('Host is unreachable');
    });

    it('maps ECONNRESET to friendly message', () => {
      const error = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
      const result = formatConnectionError(error);
      expect(result).toContain('Connection was reset');
    });

    it('includes connectorId when provided', () => {
      const error = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const result = formatConnectionError(error, 'postgresql');
      expect(result).toContain('[postgresql]');
    });

    it('works without connectorId', () => {
      const error = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const result = formatConnectionError(error);
      expect(result).not.toContain('[');
    });

    it('falls back to category message for unknown error codes', () => {
      const result = formatConnectionError(new Error('Authentication failed'));
      expect(result).toContain('Authentication failed');
    });

    it('provides generic fallback for completely unknown errors', () => {
      const result = formatConnectionError(new Error('something weird'));
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain('something weird');
    });

    it('never exposes credentials from error messages', () => {
      const error = new Error('Failed to connect with password=super_secret_123');
      const result = formatConnectionError(error, 'postgresql');
      expect(result).not.toContain('super_secret_123');
    });

    it('never exposes stack traces', () => {
      const error = new Error('ECONNREFUSED');
      const result = formatConnectionError(error);
      expect(result).not.toContain('at ');
      expect(result).not.toMatch(/:\d+:\d+/);
    });

    it('never exposes internal file paths', () => {
      const error = new Error('Error at /usr/local/lib/node_modules/pg/connection.js:45');
      const result = formatConnectionError(error);
      expect(result).not.toContain('/usr/local');
      expect(result).not.toContain('node_modules');
    });

    it('handles null and undefined errors gracefully', () => {
      expect(formatConnectionError(null)).toBeTruthy();
      expect(formatConnectionError(undefined)).toBeTruthy();
    });
  });

  describe('formatConnectionErrorStructured', () => {
    it('returns a FormattedConnectionError with correct structure', () => {
      const result = formatConnectionErrorStructured(
        new Error('ECONNREFUSED'),
        'postgresql',
        { host: 'localhost', port: 5432 },
      );

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('connectorType');
      expect(result).toHaveProperty('timestamp');
    });

    it('includes connector type in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('ECONNREFUSED'),
        'postgresql',
      );

      expect(result.message).toContain('postgresql');
      expect(result.connectorType).toBe('postgresql');
    });

    it('includes ISO timestamp in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('timeout'),
        'mysql',
      );

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.message).toContain(result.timestamp);
    });

    it('assigns correct category based on error', () => {
      const authResult = formatConnectionErrorStructured(
        new Error('Authentication failed'),
        'snowflake',
      );
      expect(authResult.category).toBe('auth');

      const networkResult = formatConnectionErrorStructured(
        new Error('ECONNREFUSED'),
        'postgresql',
      );
      expect(networkResult.category).toBe('network');

      const timeoutResult = formatConnectionErrorStructured(
        new Error('Connection timed out'),
        'mysql',
      );
      expect(timeoutResult.category).toBe('timeout');
    });

    it('NEVER includes password values in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('Connection failed: super_secret_password_123'),
        'postgresql',
        { host: 'localhost', password: 'super_secret_password_123' },
      );

      expect(result.message).not.toContain('super_secret_password_123');
    });

    it('NEVER includes token values in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('Auth error with token: my-bearer-token-xyz'),
        'rest-api',
        { url: 'https://api.example.com', token: 'my-bearer-token-xyz' },
      );

      expect(result.message).not.toContain('my-bearer-token-xyz');
    });

    it('NEVER includes apiKey values in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('Invalid apiKey: sk-abc123def456'),
        'salesforce',
        { host: 'salesforce.com', apiKey: 'sk-abc123def456' },
      );

      expect(result.message).not.toContain('sk-abc123def456');
    });

    it('NEVER includes secret values in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('Secret mismatch: client_secret_value'),
        'oauth-service',
        { clientId: 'app-123', secret: 'client_secret_value' },
      );

      expect(result.message).not.toContain('client_secret_value');
    });

    it('NEVER includes accessKey values in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('AWS error: AKIAIOSFODNN7EXAMPLE'),
        's3',
        { bucket: 'my-bucket', accessKey: 'AKIAIOSFODNN7EXAMPLE' },
      );

      expect(result.message).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('NEVER includes privateKey values in the message', () => {
      const result = formatConnectionErrorStructured(
        new Error('Key error: -----BEGIN RSA PRIVATE KEY-----'),
        'bigquery',
        { project: 'my-project', privateKey: '-----BEGIN RSA PRIVATE KEY-----' },
      );

      expect(result.message).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
    });

    it('strips nested credential values from params', () => {
      const result = formatConnectionErrorStructured(
        new Error('Failed with nested_secret_value'),
        'snowflake',
        {
          host: 'account.snowflake.com',
          credentials: { password: 'nested_secret_value' },
        },
      );

      expect(result.message).not.toContain('nested_secret_value');
    });

    it('handles empty params gracefully', () => {
      const result = formatConnectionErrorStructured(
        new Error('ECONNREFUSED'),
        'postgresql',
      );

      expect(result.category).toBe('network');
      expect(result.connectorType).toBe('postgresql');
      expect(result.message).toBeTruthy();
    });

    it('produces user-friendly messages for each category', () => {
      const categories: ErrorCategory[] = [
        'network',
        'auth',
        'timeout',
        'query',
        'parse',
        'proxy-unavailable',
      ];

      const errorExamples: Record<ErrorCategory, string> = {
        network: 'ECONNREFUSED',
        auth: 'Authentication failed',
        timeout: 'Connection timed out',
        query: 'syntax error in SQL',
        parse: 'JSON parse error',
        'proxy-unavailable': '503 Service Unavailable',
      };

      for (const category of categories) {
        const result = formatConnectionErrorStructured(
          new Error(errorExamples[category]),
          'test-connector',
        );
        expect(result.category).toBe(category);
        expect(result.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('sanitizeMessage', () => {
    it('redacts connection strings with credentials', () => {
      const msg = 'Error connecting to postgres://admin:secret123@host:5432/db';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('admin:secret123');
      expect(result).not.toContain('postgres://');
      expect(result).toContain('[REDACTED_CONNECTION_STRING]');
    });

    it('redacts MongoDB connection strings', () => {
      const msg = 'Failed: mongodb://user:pass@cluster.mongodb.net/mydb';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('user:pass');
      expect(result).toContain('[REDACTED_CONNECTION_STRING]');
    });

    it('redacts Bearer tokens', () => {
      const msg = 'Auth header: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts password= patterns', () => {
      const msg = 'Connection failed: password=my_super_secret';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('my_super_secret');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts token= patterns', () => {
      const msg = 'Request with token=abc123xyz789long';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('abc123xyz789long');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts AWS access keys', () => {
      const msg = 'AWS error with key AKIAIOSFODNN7EXAMPLE';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result).toContain('[REDACTED_AWS_KEY]');
    });

    it('redacts private keys in PEM format', () => {
      const msg = 'Key: -----BEGIN RSA PRIVATE KEY-----\nMIIE...data...\n-----END RSA PRIVATE KEY-----';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(result).toContain('[REDACTED_PRIVATE_KEY]');
    });

    it('redacts Unix file paths', () => {
      const msg = 'Error at /home/user/project/src/db/connection.ts:42';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('/home/user/project');
    });

    it('removes stack trace lines', () => {
      const msg = 'Error occurred\n    at Connection.connect (pg/lib/client.js:45:12)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('at Connection.connect');
      expect(result).not.toContain('processTicksAndRejections');
    });

    it('redacts JWT tokens', () => {
      const msg = 'Token expired: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(result).toContain('[REDACTED_TOKEN]');
    });

    it('preserves non-sensitive content', () => {
      const msg = 'Connection refused on port 5432';
      const result = sanitizeMessage(msg);
      expect(result).toBe('Connection refused on port 5432');
    });

    it('handles empty strings', () => {
      expect(sanitizeMessage('')).toBe('');
    });

    it('handles messages with no sensitive data', () => {
      const msg = 'Unable to reach the server. Check your connection.';
      expect(sanitizeMessage(msg)).toBe(msg);
    });

    it('redacts api_key patterns', () => {
      const msg = 'Request failed: api_key=sk_live_abcdef123456';
      const result = sanitizeMessage(msg);
      expect(result).not.toContain('sk_live_abcdef123456');
    });
  });
});
