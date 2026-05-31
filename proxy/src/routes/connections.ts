import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { connectionManager, DatabaseDriver } from '../services/connection-manager.js';
import { encryptConnectionParams, EncryptedPayload } from '../services/credential-vault.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes:connections');
const router = Router();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const driverSchema = z.enum(['postgresql', 'mysql', 'mssql']);

const connectionParamsSchema = z.object({
  driver: driverSchema,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
  ssl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

const connectionIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ============================================================
// In-memory connection store (maps connectionId → encrypted params)
// ============================================================

interface StoredConnection {
  connectionId: string;
  driver: DatabaseDriver;
  host: string;
  port: number;
  database: string;
  ssl?: boolean;
  encryptedCredentials: EncryptedPayload;
  createdAt: string;
}

const connectionStore = new Map<string, StoredConnection>();

// ============================================================
// POST /api/connections/test
// ============================================================

router.post('/test', async (req: Request, res: Response) => {
  try {
    const parsed = connectionParamsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid connection parameters.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { driver, host, port, database, username, password, ssl, options } = parsed.data;

    // Attempt to create a pool (verifies connectivity)
    const connectionId = await connectionManager.createPool({
      driver,
      host,
      port,
      database,
      username,
      password,
      ssl,
      options,
    });

    // Run health check
    const health = await connectionManager.healthCheck(connectionId);

    // Destroy the test pool immediately
    await connectionManager.destroyPool(connectionId);

    if (health.healthy) {
      res.status(200).json({
        success: true,
        latencyMs: health.latencyMs,
        requestId: req.requestId,
      });
    } else {
      res.status(200).json({
        success: false,
        error: health.error || 'Connection test failed.',
        requestId: req.requestId,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Connection test failed');
    res.status(500).json({
      error: {
        code: 'CONNECTION_TEST_FAILED',
        message: 'Unable to test connection.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// POST /api/connections
// ============================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = connectionParamsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid connection parameters.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: req.requestId,
      });
      return;
    }

    const { driver, host, port, database, username, password, ssl, options } = parsed.data;

    const connectionId = await connectionManager.createPool({
      driver,
      host,
      port,
      database,
      username,
      password,
      ssl,
      options,
    });

    // Encrypt and store credentials
    const encryptedCredentials = encryptConnectionParams({ username, password });

    connectionStore.set(connectionId, {
      connectionId,
      driver,
      host,
      port,
      database,
      ssl,
      encryptedCredentials,
      createdAt: new Date().toISOString(),
    });

    logger.info({ connectionId, driver, requestId: req.requestId }, 'Connection established');

    res.status(201).json({
      connectionId,
      driver,
      host,
      port,
      database,
      ssl: ssl ?? false,
      createdAt: connectionStore.get(connectionId)!.createdAt,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Connection creation failed');
    res.status(500).json({
      error: {
        code: 'CONNECTION_FAILED',
        message: 'Unable to establish connection.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// DELETE /api/connections/:id
// ============================================================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = connectionIdParamSchema.safeParse(req.params);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid connection ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = parsed.data;
    const stored = connectionStore.get(id);

    if (!stored) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    await connectionManager.destroyPool(id);
    connectionStore.delete(id);

    logger.info({ connectionId: id, requestId: req.requestId }, 'Connection destroyed');

    res.status(200).json({
      success: true,
      connectionId: id,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Connection deletion failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to close connection.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// GET /api/connections/:id/schema
// ============================================================

router.get('/:id/schema', async (req: Request, res: Response) => {
  try {
    const parsed = connectionIdParamSchema.safeParse(req.params);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid connection ID format.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const { id } = parsed.data;
    const stored = connectionStore.get(id);

    if (!stored) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const poolInfo = connectionManager.getPoolInfo(id);
    if (!poolInfo) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Connection pool not found.',
        },
        requestId: req.requestId,
      });
      return;
    }

    const schema = await fetchSchema(id, stored.driver);

    res.status(200).json({
      connectionId: id,
      schema,
      requestId: req.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, requestId: req.requestId }, 'Schema fetch failed');
    res.status(500).json({
      error: {
        code: 'SCHEMA_FETCH_FAILED',
        message: 'Unable to retrieve schema information.',
      },
      requestId: req.requestId,
    });
  }
});

// ============================================================
// SCHEMA DISCOVERY HELPERS
// ============================================================

interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

interface SchemaTable {
  name: string;
  type: 'table' | 'view';
  columns: SchemaColumn[];
}

interface SchemaEntry {
  name: string;
  tables: SchemaTable[];
}

async function fetchSchema(connectionId: string, driver: DatabaseDriver): Promise<SchemaEntry[]> {
  const connection = await connectionManager.getConnection(connectionId);

  try {
    switch (driver) {
      case 'postgresql':
        return fetchPostgresqlSchema(connection);
      case 'mysql':
        return fetchMysqlSchema(connection);
      case 'mssql':
        return fetchMssqlSchema(connection);
    }
  } finally {
    connectionManager.releaseConnection(connectionId, connection);
  }
}

async function fetchPostgresqlSchema(connection: unknown): Promise<SchemaEntry[]> {
  const client = connection as { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };

  const schemasResult = await client.query(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
     ORDER BY schema_name`
  );

  const schemas: SchemaEntry[] = [];

  for (const row of schemasResult.rows) {
    const schemaName = row.schema_name as string;

    const tablesResult = await client.query(
      `SELECT table_name, table_type FROM information_schema.tables
       WHERE table_schema = '${schemaName}'
       ORDER BY table_name`
    );

    const tables: SchemaTable[] = [];

    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name as string;
      const tableType = (tableRow.table_type as string) === 'VIEW' ? 'view' : 'table';

      const columnsResult = await client.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'
         ORDER BY ordinal_position`
      );

      const columns: SchemaColumn[] = columnsResult.rows.map((col) => ({
        name: col.column_name as string,
        dataType: col.data_type as string,
        nullable: (col.is_nullable as string) === 'YES',
      }));

      tables.push({ name: tableName, type: tableType, columns });
    }

    schemas.push({ name: schemaName, tables });
  }

  return schemas;
}

async function fetchMysqlSchema(connection: unknown): Promise<SchemaEntry[]> {
  const conn = connection as { query: (sql: string) => Promise<[Record<string, unknown>[], unknown]> };

  const [databases] = await conn.query('SHOW DATABASES');

  const schemas: SchemaEntry[] = [];
  const systemDbs = ['information_schema', 'mysql', 'performance_schema', 'sys'];

  for (const row of databases) {
    const dbName = (row as Record<string, unknown>).Database as string;
    if (systemDbs.includes(dbName)) continue;

    const [tablesRows] = await conn.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = '${dbName}' ORDER BY TABLE_NAME`
    );

    const tables: SchemaTable[] = [];

    for (const tableRow of tablesRows as Record<string, unknown>[]) {
      const tableName = tableRow.TABLE_NAME as string;
      const tableType = (tableRow.TABLE_TYPE as string) === 'VIEW' ? 'view' : 'table';

      const [columnsRows] = await conn.query(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${tableName}'
         ORDER BY ORDINAL_POSITION`
      );

      const columns: SchemaColumn[] = (columnsRows as Record<string, unknown>[]).map((col) => ({
        name: col.COLUMN_NAME as string,
        dataType: col.DATA_TYPE as string,
        nullable: (col.IS_NULLABLE as string) === 'YES',
      }));

      tables.push({ name: tableName, type: tableType, columns });
    }

    schemas.push({ name: dbName, tables });
  }

  return schemas;
}

async function fetchMssqlSchema(connection: unknown): Promise<SchemaEntry[]> {
  const request = connection as { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> };

  const schemasResult = await request.query(
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
     WHERE SCHEMA_NAME NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys')
     ORDER BY SCHEMA_NAME`
  );

  const schemas: SchemaEntry[] = [];

  for (const row of schemasResult.recordset) {
    const schemaName = row.SCHEMA_NAME as string;

    const tablesResult = await request.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = '${schemaName}' ORDER BY TABLE_NAME`
    );

    const tables: SchemaTable[] = [];

    for (const tableRow of tablesResult.recordset) {
      const tableName = tableRow.TABLE_NAME as string;
      const tableType = (tableRow.TABLE_TYPE as string) === 'VIEW' ? 'view' : 'table';

      const columnsResult = await request.query(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableName}'
         ORDER BY ORDINAL_POSITION`
      );

      const columns: SchemaColumn[] = columnsResult.recordset.map((col) => ({
        name: col.COLUMN_NAME as string,
        dataType: col.DATA_TYPE as string,
        nullable: (col.IS_NULLABLE as string) === 'YES',
      }));

      tables.push({ name: tableName, type: tableType, columns });
    }

    schemas.push({ name: schemaName, tables });
  }

  return schemas;
}

// Export for use in other modules
export { connectionStore };
export default router;
