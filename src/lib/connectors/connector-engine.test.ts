import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectorEngine } from './connector-engine';

describe('ConnectorEngine', () => {
  let engine: ConnectorEngine;
  const mockBaseUrl = 'http://localhost:4000';

  beforeEach(() => {
    engine = new ConnectorEngine(mockBaseUrl);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('returns success result on successful test', async () => {
      const mockResult = { success: true, message: 'Connected', latencyMs: 42 };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await engine.testConnection('postgresql', { host: 'localhost' });

      expect(result).toEqual(mockResult);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/api/connections/test`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorId: 'postgresql', params: { host: 'localhost' } }),
        }),
      );
    });

    it('returns failure result with formatted error on network failure', async () => {
      vi.useRealTimers();
      const quickEngine = new ConnectorEngine(mockBaseUrl);
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await quickEngine.testConnection('postgresql', { host: 'localhost' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('postgresql');
      expect(result.latencyMs).toBe(0);
    });

    it('sends correct request body with connectorId and params', async () => {
      const mockResult = { success: true, message: 'OK', latencyMs: 10 };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const params = { host: 'db.example.com', port: 5432, database: 'mydb' };
      await engine.testConnection('postgresql', params);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.connectorId).toBe('postgresql');
      expect(body.params).toEqual(params);
    });

    it('returns formatted error when proxy returns non-OK response', async () => {
      vi.useRealTimers();
      const quickEngine = new ConnectorEngine(mockBaseUrl);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ message: 'Internal error' })),
      });

      const result = await quickEngine.testConnection('mysql', { host: 'localhost' });

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBe(0);
    });
  });

  describe('connect', () => {
    it('returns connection session on success', async () => {
      const mockSession = {
        connectionId: 'conn-123',
        connectorId: 'postgresql',
        status: 'connected' as const,
        connectedAt: '2024-01-01T00:00:00Z',
        lastActivityAt: '2024-01-01T00:00:00Z',
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSession),
      });

      const result = await engine.connect('postgresql', { host: 'localhost' });

      expect(result).toEqual(mockSession);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/api/connections`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws formatted error on failure', async () => {
      vi.useRealTimers();
      const quickEngine = new ConnectorEngine(mockBaseUrl);
      global.fetch = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        quickEngine.connect('postgresql', { host: 'localhost' }),
      ).rejects.toThrow();
    });
  });

  describe('disconnect', () => {
    it('sends DELETE request with encoded connectionId', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await engine.disconnect('conn-123');

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/api/connections/conn-123`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws formatted error on failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(engine.disconnect('conn-123')).rejects.toThrow();
    });
  });

  describe('getSchema', () => {
    it('returns schema info on success', async () => {
      const mockSchema = {
        schemas: [
          {
            name: 'public',
            type: 'schema' as const,
            children: [
              { name: 'users', type: 'table' as const, columns: [] },
            ],
          },
        ],
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSchema),
      });

      const result = await engine.getSchema('conn-123');

      expect(result).toEqual(mockSchema);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/api/connections/conn-123/schema`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('throws formatted error on failure', async () => {
      vi.useRealTimers();
      const quickEngine = new ConnectorEngine(mockBaseUrl);
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(quickEngine.getSchema('conn-123')).rejects.toThrow();
    });
  });

  describe('executeQuery', () => {
    it('returns query result on success', async () => {
      const mockResult = {
        fields: [{ name: 'id', dataType: 'integer' }],
        rows: [{ id: 1 }],
        rowCount: 1,
        totalRows: 1,
        executionTimeMs: 15,
        truncated: false,
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const request = { connectionId: 'conn-123', sql: 'SELECT * FROM users' };
      const result = await engine.executeQuery(request);

      expect(result).toEqual(mockResult);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/api/query`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });

    it('throws formatted error on query failure', async () => {
      vi.useRealTimers();
      const quickEngine = new ConnectorEngine(mockBaseUrl);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ message: 'syntax error' })),
      });

      await expect(
        quickEngine.executeQuery({ connectionId: 'conn-123', sql: 'INVALID SQL' }),
      ).rejects.toThrow();
    });
  });

  describe('previewTable', () => {
    it('sends GET request with correct query params', async () => {
      const mockResult = {
        fields: [{ name: 'id', dataType: 'integer' }],
        rows: [{ id: 1 }],
        rowCount: 1,
        totalRows: 100,
        executionTimeMs: 5,
        truncated: false,
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await engine.previewTable('conn-123', 'public', 'users');

      expect(result).toEqual(mockResult);
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/api/connections/conn-123/preview');
      expect(url).toContain('schema=public');
      expect(url).toContain('table=users');
      expect(url).toContain('limit=100');
    });

    it('uses custom limit when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          fields: [],
          rows: [],
          rowCount: 0,
          totalRows: 0,
          executionTimeMs: 0,
          truncated: false,
        }),
      });

      await engine.previewTable('conn-123', 'public', 'users', 50);

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('limit=50');
    });

    it('throws formatted error on failure', async () => {
      vi.useRealTimers();
      const quickEngine = new ConnectorEngine(mockBaseUrl);
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        quickEngine.previewTable('conn-123', 'public', 'users'),
      ).rejects.toThrow();
    });
  });

  describe('constructor', () => {
    it('uses provided base URL', () => {
      const customEngine = new ConnectorEngine('http://custom:5000');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'OK', latencyMs: 1 }),
      });

      customEngine.testConnection('test', {});

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('http://custom:5000');
    });
  });
});
