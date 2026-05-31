import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QueryExecutor,
  QueryExecutionError,
  ConnectionPool,
} from './query-executor.js';

// ============================================================
// MOCK SETUP
// ============================================================

function createMockPgPool(queryFn: (...args: unknown[]) => unknown) {
  const client = {
    query: vi.fn(queryFn),
    release: vi.fn(),
  };
  return {
    connect: vi.fn().mockResolvedValue(client),
    __client: client,
  };
}

function createMockMysqlPool(queryFn: (...args: unknown[]) => unknown) {
  const connection = {
    query: vi.fn(queryFn),
    release: vi.fn(),
  };
  return {
    getConnection: vi.fn().mockResolvedValue(connection),
    __connection: connection,
  };
}

function createMockMssqlPool(queryFn: (...args: unknown[]) => unknown) {
  const request = {
    timeout: 0,
    input: vi.fn().mockReturnThis(),
    query: vi.fn(queryFn),
  };
  return {
    request: vi.fn().mockReturnValue(request),
    __request: request,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('QueryExecutor', () => {
  let executor: QueryExecutor;

  beforeEach(() => {
    executor = new QueryExecutor({
      maxRows: 100,
      defaultTimeoutMs: 120_000,
      previewLimit: 10,
    });
  });

  describe('Parameter validation', () => {
    it('rejects parameter names with special characters', async () => {
      const pool = createMockPgPool(() => ({}));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await expect(
        executor.execute(connectionPool, {
          sql: 'SELECT * FROM users WHERE id = :id',
          parameters: { 'id; DROP TABLE users': 1 },
        })
      ).rejects.toThrow(QueryExecutionError);
    });

    it('rejects parameter names starting with numbers', async () => {
      const pool = createMockPgPool(() => ({}));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await expect(
        executor.execute(connectionPool, {
          sql: 'SELECT * FROM users WHERE id = :id',
          parameters: { '1invalid': 'value' },
        })
      ).rejects.toThrow(QueryExecutionError);
    });

    it('accepts valid parameter names', async () => {
      const pool = createMockPgPool(() => ({
        rows: [{ id: 1, name: 'test' }],
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'name', dataTypeID: 25 },
        ],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, {
        sql: 'SELECT * FROM users WHERE id = :user_id AND name = :userName',
        parameters: { user_id: 1, userName: 'test' },
      });

      expect(result.rowCount).toBe(1);
    });

    it('rejects object parameter values', async () => {
      const pool = createMockPgPool(() => ({}));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await expect(
        executor.execute(connectionPool, {
          sql: 'SELECT * FROM users WHERE data = :data',
          parameters: { data: { nested: 'object' } },
        })
      ).rejects.toThrow(QueryExecutionError);
    });

    it('rejects array parameter values', async () => {
      const pool = createMockPgPool(() => ({}));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await expect(
        executor.execute(connectionPool, {
          sql: 'SELECT * FROM users WHERE id IN :ids',
          parameters: { ids: [1, 2, 3] },
        })
      ).rejects.toThrow(QueryExecutionError);
    });

    it('allows null parameter values', async () => {
      const pool = createMockPgPool(() => ({
        rows: [],
        fields: [],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, {
        sql: 'SELECT * FROM users WHERE name = :name',
        parameters: { name: null },
      });

      expect(result.rowCount).toBe(0);
    });

    it('allows Date parameter values', async () => {
      const pool = createMockPgPool(() => ({
        rows: [],
        fields: [],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, {
        sql: 'SELECT * FROM events WHERE created_at > :since',
        parameters: { since: new Date('2024-01-01') },
      });

      expect(result.rowCount).toBe(0);
    });
  });

  describe('PostgreSQL execution', () => {
    it('converts named parameters to positional ($1, $2)', async () => {
      const pool = createMockPgPool(() => ({
        rows: [{ id: 1, name: 'Alice' }],
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'name', dataTypeID: 25 },
        ],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await executor.execute(connectionPool, {
        sql: 'SELECT * FROM users WHERE id = :id AND name = :name',
        parameters: { id: 1, name: 'Alice' },
      });

      const client = pool.__client;
      // First call sets statement_timeout, second is the actual query
      const queryCalls = client.query.mock.calls;
      expect(queryCalls[0][0]).toContain('SET statement_timeout');

      // The actual query should use $1, $2 positional params
      const actualSql = queryCalls[1][0] as string;
      expect(actualSql).toContain('$1');
      expect(actualSql).toContain('$2');
      expect(actualSql).not.toContain(':id');
      expect(actualSql).not.toContain(':name');

      // Values should be passed separately
      const values = queryCalls[1][1] as unknown[];
      expect(values).toContain(1);
      expect(values).toContain('Alice');
    });

    it('sets statement timeout', async () => {
      const pool = createMockPgPool(() => ({
        rows: [],
        fields: [],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await executor.execute(connectionPool, {
        sql: 'SELECT 1',
        timeoutMs: 60_000,
      });

      const client = pool.__client;
      expect(client.query.mock.calls[0][0]).toBe('SET statement_timeout = 60000');
    });

    it('releases client after successful query', async () => {
      const pool = createMockPgPool(() => ({
        rows: [],
        fields: [],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await executor.execute(connectionPool, { sql: 'SELECT 1' });

      expect(pool.__client.release).toHaveBeenCalled();
    });

    it('releases client after failed query', async () => {
      const pool = createMockPgPool(() => {
        throw new Error('syntax error');
      });
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await expect(
        executor.execute(connectionPool, { sql: 'INVALID SQL' })
      ).rejects.toThrow();

      expect(pool.__client.release).toHaveBeenCalled();
    });

    it('maps PostgreSQL type OIDs correctly', async () => {
      const pool = createMockPgPool(() => ({
        rows: [{ count: 42, active: true, name: 'test' }],
        fields: [
          { name: 'count', dataTypeID: 23 },
          { name: 'active', dataTypeID: 16 },
          { name: 'name', dataTypeID: 1043 },
        ],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, { sql: 'SELECT 1' });

      expect(result.fields).toEqual([
        { name: 'count', dataType: 'integer' },
        { name: 'active', dataType: 'boolean' },
        { name: 'name', dataType: 'varchar' },
      ]);
    });
  });

  describe('Row limit enforcement', () => {
    it('truncates results exceeding row limit', async () => {
      // Generate rows exceeding the limit (100 + 1)
      const rows = Array.from({ length: 101 }, (_, i) => ({ id: i }));
      const pool = createMockPgPool(() => ({
        rows,
        fields: [{ name: 'id', dataTypeID: 23 }],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, {
        sql: 'SELECT * FROM large_table',
      });

      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(100);
      expect(result.rows.length).toBe(100);
    });

    it('does not truncate results within row limit', async () => {
      const rows = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const pool = createMockPgPool(() => ({
        rows,
        fields: [{ name: 'id', dataTypeID: 23 }],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, {
        sql: 'SELECT * FROM small_table',
      });

      expect(result.truncated).toBe(false);
      expect(result.rowCount).toBe(50);
    });

    it('respects custom limit option', async () => {
      const rows = Array.from({ length: 26 }, (_, i) => ({ id: i }));
      const pool = createMockPgPool(() => ({
        rows,
        fields: [{ name: 'id', dataTypeID: 23 }],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, {
        sql: 'SELECT * FROM table',
        limit: 25,
      });

      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(25);
    });
  });

  describe('Preview mode', () => {
    it('uses preview limit (default 10) in preview mode', async () => {
      const pool = createMockPgPool(() => ({
        rows: Array.from({ length: 11 }, (_, i) => ({ id: i })),
        fields: [{ name: 'id', dataTypeID: 23 }],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.preview(connectionPool, 'SELECT * FROM users');

      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(10);
    });

    it('uses custom preview limit', async () => {
      const pool = createMockPgPool(() => ({
        rows: Array.from({ length: 6 }, (_, i) => ({ id: i })),
        fields: [{ name: 'id', dataTypeID: 23 }],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.preview(connectionPool, 'SELECT * FROM users', {}, 5);

      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(5);
    });
  });

  describe('Execution time tracking', () => {
    it('reports execution time in milliseconds', async () => {
      const pool = createMockPgPool(() => ({
        rows: [],
        fields: [],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, { sql: 'SELECT 1' });

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.executionTimeMs).toBe('number');
    });
  });

  describe('Error handling', () => {
    it('classifies timeout errors', async () => {
      const pool = createMockPgPool(() => {
        throw new Error('canceling statement due to statement timeout');
      });
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      try {
        await executor.execute(connectionPool, { sql: 'SELECT pg_sleep(999)' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryExecutionError);
        expect((error as QueryExecutionError).code).toBe('QUERY_TIMEOUT');
        expect((error as QueryExecutionError).message).toContain('120 seconds');
      }
    });

    it('classifies connection errors', async () => {
      const pool = createMockPgPool(() => {
        throw new Error('ECONNREFUSED 127.0.0.1:5432');
      });
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      try {
        await executor.execute(connectionPool, { sql: 'SELECT 1' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryExecutionError);
        expect((error as QueryExecutionError).code).toBe('CONNECTION_ERROR');
      }
    });

    it('never exposes credentials in error messages', async () => {
      const pool = createMockPgPool(() => {
        throw new Error('password=secret123 host=db.internal.com authentication failed');
      });
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      try {
        await executor.execute(connectionPool, { sql: 'SELECT 1' });
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as QueryExecutionError).message;
        expect(message).not.toContain('secret123');
        expect(message).not.toContain('db.internal.com');
      }
    });

    it('throws MISSING_PARAMETER for undefined parameters', async () => {
      const pool = createMockPgPool(() => ({
        rows: [],
        fields: [],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      try {
        await executor.execute(connectionPool, {
          sql: 'SELECT * FROM users WHERE id = :id',
          parameters: { name: 'test' },
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryExecutionError);
        expect((error as QueryExecutionError).code).toBe('MISSING_PARAMETER');
      }
    });

    it('rejects unsupported database drivers', async () => {
      const connectionPool: ConnectionPool = {
        driver: 'oracle' as unknown as ConnectionPool['driver'],
        pool: {} as unknown as ConnectionPool['pool'],
      };

      await expect(
        executor.execute(connectionPool, { sql: 'SELECT 1' })
      ).rejects.toThrow('Unsupported database driver');
    });
  });

  describe('MySQL execution', () => {
    it('converts named parameters to positional (?)', async () => {
      const pool = createMockMysqlPool(() => [
        [{ id: 1, name: 'Bob' }],
        [{ name: 'id', type: 3 }, { name: 'name', type: 253 }],
      ]);
      const connectionPool: ConnectionPool = {
        driver: 'mysql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await executor.execute(connectionPool, {
        sql: 'SELECT * FROM users WHERE id = :id',
        parameters: { id: 1 },
      });

      const connection = pool.__connection;
      // Second call is the actual query (first sets timeout)
      const queryCalls = connection.query.mock.calls;
      const actualSql = queryCalls[1][0] as string;
      expect(actualSql).toContain('?');
      expect(actualSql).not.toContain(':id');

      const values = queryCalls[1][1] as unknown[];
      expect(values).toContain(1);
    });

    it('releases connection after execution', async () => {
      const pool = createMockMysqlPool(() => [
        [],
        [],
      ]);
      const connectionPool: ConnectionPool = {
        driver: 'mysql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await executor.execute(connectionPool, { sql: 'SELECT 1' });

      expect(pool.__connection.release).toHaveBeenCalled();
    });
  });

  describe('MSSQL execution', () => {
    it('uses mssql input() for parameterization', async () => {
      const pool = createMockMssqlPool(() => ({
        recordset: Object.assign([{ id: 1 }], {
          columns: { id: { index: 0, name: 'id', type: { name: 'Int' }, nullable: false } },
        }),
      }));
      const connectionPool: ConnectionPool = {
        driver: 'mssql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      await executor.execute(connectionPool, {
        sql: 'SELECT * FROM users WHERE id = @id',
        parameters: { id: 42 },
      });

      const request = pool.__request;
      expect(request.input).toHaveBeenCalledWith('id', expect.anything(), 42);
    });
  });

  describe('QueryResult format', () => {
    it('returns correct QueryResult structure', async () => {
      const pool = createMockPgPool(() => ({
        rows: [
          { id: 1, name: 'Alice', active: true },
          { id: 2, name: 'Bob', active: false },
        ],
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'name', dataTypeID: 25 },
          { name: 'active', dataTypeID: 16 },
        ],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const result = await executor.execute(connectionPool, { sql: 'SELECT * FROM users' });

      expect(result).toMatchObject({
        fields: [
          { name: 'id', dataType: 'integer' },
          { name: 'name', dataType: 'text' },
          { name: 'active', dataType: 'boolean' },
        ],
        rows: [
          { id: 1, name: 'Alice', active: true },
          { id: 2, name: 'Bob', active: false },
        ],
        rowCount: 2,
        totalRows: 2,
        truncated: false,
      });
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SQL injection prevention', () => {
    it('never interpolates parameter values into SQL string', async () => {
      const pool = createMockPgPool(() => ({
        rows: [],
        fields: [],
      }));
      const connectionPool: ConnectionPool = {
        driver: 'postgresql',
        pool: pool as unknown as ConnectionPool['pool'],
      };

      const maliciousValue = "'; DROP TABLE users; --";

      await executor.execute(connectionPool, {
        sql: 'SELECT * FROM users WHERE name = :name',
        parameters: { name: maliciousValue },
      });

      const client = pool.__client;
      const queryCalls = client.query.mock.calls;
      const actualSql = queryCalls[1][0] as string;

      // SQL should NOT contain the malicious value
      expect(actualSql).not.toContain(maliciousValue);
      expect(actualSql).not.toContain('DROP TABLE');

      // Value should be in the parameters array
      const values = queryCalls[1][1] as unknown[];
      expect(values).toContain(maliciousValue);
    });
  });
});
