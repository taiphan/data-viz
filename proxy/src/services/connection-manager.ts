import { Pool as PgPool } from 'pg';
import * as mysql from 'mysql2/promise';
import * as mssql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('connection-manager');

const MAX_POOL_SIZE = 10;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export type DatabaseDriver = 'postgresql' | 'mysql' | 'mssql';

export interface ConnectionConfig {
  driver: DatabaseDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
}

export interface PoolEntry {
  connectionId: string;
  driver: DatabaseDriver;
  pool: PgPool | mysql.Pool | mssql.ConnectionPool;
  createdAt: Date;
  lastUsedAt: Date;
  activeConnections: number;
}

export interface HealthCheckResult {
  connectionId: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

class ConnectionManager {
  private pools: Map<string, PoolEntry> = new Map();
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  private shutdownInProgress = false;

  /**
   * Creates a new connection pool for the given configuration.
   * Returns a unique connectionId to reference this pool.
   */
  async createPool(config: ConnectionConfig): Promise<string> {
    if (this.shutdownInProgress) {
      throw new Error('Connection manager is shutting down');
    }

    const connectionId = uuidv4();
    const pool = await this.initializePool(config);

    const entry: PoolEntry = {
      connectionId,
      driver: config.driver,
      pool,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      activeConnections: 0,
    };

    this.pools.set(connectionId, entry);
    this.resetIdleTimer(connectionId);

    logger.info({ connectionId, driver: config.driver }, 'Connection pool created');
    return connectionId;
  }

  /**
   * Gets a connection from the pool identified by connectionId.
   * Returns a driver-specific connection object.
   */
  async getConnection(connectionId: string): Promise<unknown> {
    const entry = this.pools.get(connectionId);
    if (!entry) {
      throw new Error(`No pool found for connectionId: ${connectionId}`);
    }

    if (this.shutdownInProgress) {
      throw new Error('Connection manager is shutting down');
    }

    entry.lastUsedAt = new Date();
    entry.activeConnections++;
    this.resetIdleTimer(connectionId);

    switch (entry.driver) {
      case 'postgresql': {
        const pgPool = entry.pool as PgPool;
        return pgPool.connect();
      }
      case 'mysql': {
        const mysqlPool = entry.pool as mysql.Pool;
        return mysqlPool.getConnection();
      }
      case 'mssql': {
        const mssqlPool = entry.pool as mssql.ConnectionPool;
        return mssqlPool.request();
      }
    }
  }

  /**
   * Releases a connection back to the pool.
   */
  releaseConnection(connectionId: string, connection: unknown): void {
    const entry = this.pools.get(connectionId);
    if (!entry) {
      return;
    }

    entry.activeConnections = Math.max(0, entry.activeConnections - 1);
    entry.lastUsedAt = new Date();
    this.resetIdleTimer(connectionId);

    switch (entry.driver) {
      case 'postgresql': {
        const pgClient = connection as { release: () => void };
        pgClient.release();
        break;
      }
      case 'mysql': {
        const mysqlConn = connection as mysql.PoolConnection;
        mysqlConn.release();
        break;
      }
      case 'mssql': {
        // MSSQL requests don't need explicit release
        break;
      }
    }
  }

  /**
   * Destroys a specific pool and cleans up resources.
   */
  async destroyPool(connectionId: string): Promise<void> {
    const entry = this.pools.get(connectionId);
    if (!entry) {
      return;
    }

    this.clearIdleTimer(connectionId);
    await this.closePool(entry);
    this.pools.delete(connectionId);

    logger.info({ connectionId }, 'Connection pool destroyed');
  }

  /**
   * Performs a health check on the specified pool.
   */
  async healthCheck(connectionId: string): Promise<HealthCheckResult> {
    const entry = this.pools.get(connectionId);
    if (!entry) {
      return {
        connectionId,
        healthy: false,
        latencyMs: 0,
        error: 'Pool not found',
      };
    }

    const start = Date.now();

    try {
      switch (entry.driver) {
        case 'postgresql': {
          const pgPool = entry.pool as PgPool;
          const client = await pgPool.connect();
          await client.query('SELECT 1');
          client.release();
          break;
        }
        case 'mysql': {
          const mysqlPool = entry.pool as mysql.Pool;
          const conn = await mysqlPool.getConnection();
          await conn.query('SELECT 1');
          conn.release();
          break;
        }
        case 'mssql': {
          const mssqlPool = entry.pool as mssql.ConnectionPool;
          await mssqlPool.request().query('SELECT 1');
          break;
        }
      }

      const latencyMs = Date.now() - start;
      return { connectionId, healthy: true, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.warn({ connectionId, error }, 'Health check failed');
      return { connectionId, healthy: false, latencyMs, error };
    }
  }

  /**
   * Returns information about a specific pool.
   */
  getPoolInfo(connectionId: string): PoolEntry | undefined {
    return this.pools.get(connectionId);
  }

  /**
   * Returns all active pool entries.
   */
  getActivePools(): PoolEntry[] {
    return Array.from(this.pools.values());
  }

  /**
   * Gracefully shuts down all pools.
   */
  async shutdown(): Promise<void> {
    this.shutdownInProgress = true;
    logger.info({ poolCount: this.pools.size }, 'Shutting down connection manager');

    // Clear all idle timers
    for (const [connectionId] of this.idleTimers) {
      this.clearIdleTimer(connectionId);
    }

    // Close all pools
    const closePromises = Array.from(this.pools.entries()).map(
      async ([connectionId, entry]) => {
        try {
          await this.closePool(entry);
          logger.info({ connectionId }, 'Pool closed during shutdown');
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.error({ connectionId, error }, 'Error closing pool during shutdown');
        }
      }
    );

    await Promise.all(closePromises);
    this.pools.clear();
    this.shutdownInProgress = false;

    logger.info('Connection manager shutdown complete');
  }

  private async initializePool(config: ConnectionConfig): Promise<PgPool | mysql.Pool | mssql.ConnectionPool> {
    switch (config.driver) {
      case 'postgresql': {
        const pgPool = new PgPool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          max: MAX_POOL_SIZE,
          idleTimeoutMillis: IDLE_TIMEOUT_MS,
          connectionTimeoutMillis: 30000,
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        });

        // Verify connectivity
        const client = await pgPool.connect();
        client.release();
        return pgPool;
      }

      case 'mysql': {
        const mysqlPool = mysql.createPool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          connectionLimit: MAX_POOL_SIZE,
          waitForConnections: true,
          queueLimit: 0,
          connectTimeout: 30000,
          ssl: config.ssl ? {} : undefined,
          ...config.options,
        });

        // Verify connectivity
        const conn = await mysqlPool.getConnection();
        conn.release();
        return mysqlPool;
      }

      case 'mssql': {
        const mssqlConfig: mssql.config = {
          server: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          pool: {
            max: MAX_POOL_SIZE,
            min: 0,
            idleTimeoutMillis: IDLE_TIMEOUT_MS,
          },
          options: {
            encrypt: config.ssl ?? false,
            trustServerCertificate: true,
            connectTimeout: 30000,
          },
        };

        const pool = new mssql.ConnectionPool(mssqlConfig);
        await pool.connect();
        return pool;
      }
    }
  }

  private async closePool(entry: PoolEntry): Promise<void> {
    switch (entry.driver) {
      case 'postgresql': {
        const pgPool = entry.pool as PgPool;
        await pgPool.end();
        break;
      }
      case 'mysql': {
        const mysqlPool = entry.pool as mysql.Pool;
        await mysqlPool.end();
        break;
      }
      case 'mssql': {
        const mssqlPool = entry.pool as mssql.ConnectionPool;
        await mssqlPool.close();
        break;
      }
    }
  }

  private resetIdleTimer(connectionId: string): void {
    this.clearIdleTimer(connectionId);

    const timer = setTimeout(async () => {
      const entry = this.pools.get(connectionId);
      if (entry && entry.activeConnections === 0) {
        logger.info({ connectionId }, 'Pool idle timeout reached, destroying');
        await this.destroyPool(connectionId);
      }
    }, IDLE_TIMEOUT_MS);

    // Prevent timer from keeping the process alive
    timer.unref();
    this.idleTimers.set(connectionId, timer);
  }

  private clearIdleTimer(connectionId: string): void {
    const timer = this.idleTimers.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(connectionId);
    }
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();

// Export class for testing
export { ConnectionManager };
