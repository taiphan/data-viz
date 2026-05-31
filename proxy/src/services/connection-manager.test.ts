import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager, ConnectionConfig, DatabaseDriver } from './connection-manager.js';

// Mock pg
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    release: vi.fn(),
  };
  const MockPool = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  }));
  return { Pool: MockPool };
});

// Mock mysql2/promise
vi.mock('mysql2/promise', () => {
  const mockConnection = {
    query: vi.fn().mockResolvedValue([[{ 1: 1 }], []]),
    release: vi.fn(),
  };
  return {
    createPool: vi.fn().mockReturnValue({
      getConnection: vi.fn().mockResolvedValue(mockConnection),
      end: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

// Mock mssql
vi.mock('mssql', () => {
  const mockRequest = {
    query: vi.fn().mockResolvedValue({ recordset: [{ '': 1 }] }),
  };
  const MockConnectionPool = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockReturnValue(mockRequest),
    close: vi.fn().mockResolvedValue(undefined),
    connected: true,
  }));
  return {
    ConnectionPool: MockConnectionPool,
  };
});

function createConfig(driver: DatabaseDriver = 'postgresql'): ConnectionConfig {
  return {
    driver,
    host: 'localhost',
    port: driver === 'postgresql' ? 5432 : driver === 'mysql' ? 3306 : 1433,
    database: 'testdb',
    username: 'user',
    password: 'pass',
  };
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ConnectionManager();
  });

  afterEach(async () => {
    await manager.shutdown();
    vi.useRealTimers();
  });

  describe('createPool', () => {
    it('creates a PostgreSQL pool and returns a connectionId', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      expect(connectionId).toBeDefined();
      expect(connectionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('creates a MySQL pool and returns a connectionId', async () => {
      const connectionId = await manager.createPool(createConfig('mysql'));
      expect(connectionId).toBeDefined();
      expect(manager.getPoolInfo(connectionId)?.driver).toBe('mysql');
    });

    it('creates a MSSQL pool and returns a connectionId', async () => {
      const connectionId = await manager.createPool(createConfig('mssql'));
      expect(connectionId).toBeDefined();
      expect(manager.getPoolInfo(connectionId)?.driver).toBe('mssql');
    });

    it('throws when shutdown is in progress', async () => {
      const shutdownPromise = manager.shutdown();
      await expect(manager.createPool(createConfig())).rejects.toThrow(
        'Connection manager is shutting down'
      );
      await shutdownPromise;
    });
  });

  describe('getConnection', () => {
    it('returns a connection from a PostgreSQL pool', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      const conn = await manager.getConnection(connectionId);
      expect(conn).toBeDefined();
    });

    it('returns a connection from a MySQL pool', async () => {
      const connectionId = await manager.createPool(createConfig('mysql'));
      const conn = await manager.getConnection(connectionId);
      expect(conn).toBeDefined();
    });

    it('returns a request from a MSSQL pool', async () => {
      const connectionId = await manager.createPool(createConfig('mssql'));
      const conn = await manager.getConnection(connectionId);
      expect(conn).toBeDefined();
    });

    it('throws for unknown connectionId', async () => {
      await expect(manager.getConnection('nonexistent')).rejects.toThrow(
        'No pool found for connectionId: nonexistent'
      );
    });

    it('increments activeConnections count', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      await manager.getConnection(connectionId);
      const info = manager.getPoolInfo(connectionId);
      expect(info?.activeConnections).toBe(1);
    });
  });

  describe('releaseConnection', () => {
    it('decrements activeConnections for PostgreSQL', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      const conn = await manager.getConnection(connectionId);
      manager.releaseConnection(connectionId, conn);
      const info = manager.getPoolInfo(connectionId);
      expect(info?.activeConnections).toBe(0);
    });

    it('decrements activeConnections for MySQL', async () => {
      const connectionId = await manager.createPool(createConfig('mysql'));
      const conn = await manager.getConnection(connectionId);
      manager.releaseConnection(connectionId, conn);
      const info = manager.getPoolInfo(connectionId);
      expect(info?.activeConnections).toBe(0);
    });

    it('does not go below zero', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      const conn = await manager.getConnection(connectionId);
      manager.releaseConnection(connectionId, conn);
      manager.releaseConnection(connectionId, conn);
      const info = manager.getPoolInfo(connectionId);
      expect(info?.activeConnections).toBe(0);
    });

    it('handles unknown connectionId gracefully', () => {
      expect(() => manager.releaseConnection('nonexistent', {})).not.toThrow();
    });
  });

  describe('destroyPool', () => {
    it('removes the pool from active pools', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      expect(manager.getPoolInfo(connectionId)).toBeDefined();
      await manager.destroyPool(connectionId);
      expect(manager.getPoolInfo(connectionId)).toBeUndefined();
    });

    it('handles destroying non-existent pool gracefully', async () => {
      await expect(manager.destroyPool('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy for a valid PostgreSQL pool', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      const result = await manager.healthCheck(connectionId);
      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns healthy for a valid MySQL pool', async () => {
      const connectionId = await manager.createPool(createConfig('mysql'));
      const result = await manager.healthCheck(connectionId);
      expect(result.healthy).toBe(true);
    });

    it('returns healthy for a valid MSSQL pool', async () => {
      const connectionId = await manager.createPool(createConfig('mssql'));
      const result = await manager.healthCheck(connectionId);
      expect(result.healthy).toBe(true);
    });

    it('returns unhealthy for non-existent pool', async () => {
      const result = await manager.healthCheck('nonexistent');
      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Pool not found');
    });
  });

  describe('idle timeout', () => {
    it('destroys pool after idle timeout with no active connections', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      expect(manager.getPoolInfo(connectionId)).toBeDefined();

      // Advance time past idle timeout (10 minutes)
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100);

      expect(manager.getPoolInfo(connectionId)).toBeUndefined();
    });

    it('does not destroy pool with active connections', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      await manager.getConnection(connectionId);

      // Advance time past idle timeout
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100);

      // Pool should still exist because there's an active connection
      expect(manager.getPoolInfo(connectionId)).toBeDefined();
    });

    it('resets idle timer on getConnection', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));

      // Advance 9 minutes
      await vi.advanceTimersByTimeAsync(9 * 60 * 1000);

      // Get and release a connection (resets timer)
      const conn = await manager.getConnection(connectionId);
      manager.releaseConnection(connectionId, conn);

      // Advance another 9 minutes (total 18 from start, but only 9 from last use)
      await vi.advanceTimersByTimeAsync(9 * 60 * 1000);

      // Pool should still exist
      expect(manager.getPoolInfo(connectionId)).toBeDefined();

      // Advance past the full idle timeout from last use
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

      expect(manager.getPoolInfo(connectionId)).toBeUndefined();
    });
  });

  describe('getActivePools', () => {
    it('returns all active pools', async () => {
      await manager.createPool(createConfig('postgresql'));
      await manager.createPool(createConfig('mysql'));
      const pools = manager.getActivePools();
      expect(pools).toHaveLength(2);
    });

    it('returns empty array when no pools exist', () => {
      expect(manager.getActivePools()).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    it('closes all pools', async () => {
      await manager.createPool(createConfig('postgresql'));
      await manager.createPool(createConfig('mysql'));
      await manager.createPool(createConfig('mssql'));

      expect(manager.getActivePools()).toHaveLength(3);
      await manager.shutdown();
      expect(manager.getActivePools()).toHaveLength(0);
    });

    it('prevents new connections during shutdown', async () => {
      const connectionId = await manager.createPool(createConfig('postgresql'));
      const shutdownPromise = manager.shutdown();

      await expect(manager.getConnection(connectionId)).rejects.toThrow(
        'Connection manager is shutting down'
      );

      await shutdownPromise;
    });
  });
});
