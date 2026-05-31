import { Pool as PgPool } from 'pg';
import mysql, { Pool as MysqlPool } from 'mysql2/promise';
import mssql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';
import { queryStatsStore, QueryExecutionStats } from './query-stats.js';

const logger = createLogger('query-executor');

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_QUERY_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_ROWS = 1_000_000;
const DEFAULT_PREVIEW_LIMIT = 100;

// ============================================================
// TYPES
// ============================================================

export type DatabaseDriver = 'postgresql' | 'mysql' | 'mssql';

export interface QueryField {
  name: string;
  dataType: string;
}

export interface QueryResult {
  fields: QueryField[];
  rows: Record<string, unknown>[];
  rowCount: number;
  totalRows: number;
  executionTimeMs: number;
  truncated: boolean;
}

export interface QueryOptions {
  sql: string;
  parameters?: Record<string, unknown>;
  limit?: number;
  timeoutMs?: number;
  preview?: boolean;
  connectionId?: string;
}

export interface ConnectionPool {
  driver: DatabaseDriver;
  pool: PgPool | MysqlPool | mssql.ConnectionPool;
}

// ============================================================
// PARAMETER SANITIZATION
// ============================================================

/**
 * Validates that parameter keys are safe identifiers.
 * Prevents injection through parameter names.
 */
function validateParameterKeys(parameters: Record<string, unknown>): void {
  const safeKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  for (const key of Object.keys(parameters)) {
    if (!safeKeyPattern.test(key)) {
      throw new QueryExecutionError(
        `Invalid parameter name: "${key}". Parameter names must be alphanumeric with underscores.`,
        'INVALID_PARAMETER'
      );
    }
  }
}

/**
 * Validates parameter values are safe primitive types.
 * Rejects objects, arrays, and functions to prevent injection.
 */
function validateParameterValues(parameters: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined) {
      continue;
    }
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      continue;
    }
    if (value instanceof Date) {
      continue;
    }
    throw new QueryExecutionError(
      `Invalid parameter value type for "${key}": ${type}. Only string, number, boolean, Date, and null are allowed.`,
      'INVALID_PARAMETER'
    );
  }
}

// ============================================================
// ERROR CLASS
// ============================================================

export class QueryExecutionError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'QueryExecutionError';
    this.code = code;
  }
}

// ============================================================
// QUERY EXECUTOR
// ============================================================

export class QueryExecutor {
  private readonly maxRows: number;
  private readonly defaultTimeoutMs: number;
  private readonly previewLimit: number;

  constructor(options?: {
    maxRows?: number;
    defaultTimeoutMs?: number;
    previewLimit?: number;
  }) {
    this.maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    this.previewLimit = options?.previewLimit ?? DEFAULT_PREVIEW_LIMIT;
  }

  /**
   * Execute a parameterized query against the given connection pool.
   * NEVER uses string concatenation for user values.
   */
  async execute(
    connectionPool: ConnectionPool,
    options: QueryOptions
  ): Promise<QueryResult> {
    const { sql, parameters = {}, timeoutMs, preview } = options;
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const rowLimit = preview
      ? (options.limit ?? this.previewLimit)
      : (options.limit ?? this.maxRows);

    // Validate parameters before execution
    validateParameterKeys(parameters);
    validateParameterValues(parameters);

    const startTime = performance.now();
    const queryId = uuidv4();

    try {
      const result = await this.executeWithDriver(
        connectionPool,
        sql,
        parameters,
        rowLimit,
        timeout
      );

      const executionTimeMs = Math.round(performance.now() - startTime);

      logger.info({
        driver: connectionPool.driver,
        executionTimeMs,
        rowCount: result.rows.length,
        truncated: result.truncated,
      }, 'Query executed successfully');

      // Record execution stats
      const stats: QueryExecutionStats = {
        id: queryId,
        sql: this.truncateSql(sql),
        driver: connectionPool.driver,
        executionTimeMs,
        rowsScanned: result.totalRows,
        rowsReturned: result.rowCount,
        indexUsed: this.inferIndexUsage(result, executionTimeMs),
        timestamp: new Date().toISOString(),
        connectionId: options.connectionId,
        truncated: result.truncated,
        status: 'success',
      };
      queryStatsStore.record(stats);

      return {
        ...result,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - startTime);

      // Record error stats
      const errorCode = error instanceof QueryExecutionError
        ? error.code
        : this.classifyError(error);

      const stats: QueryExecutionStats = {
        id: queryId,
        sql: this.truncateSql(sql),
        driver: connectionPool.driver,
        executionTimeMs,
        rowsScanned: 0,
        rowsReturned: 0,
        indexUsed: false,
        timestamp: new Date().toISOString(),
        connectionId: options.connectionId,
        truncated: false,
        status: 'error',
        errorCode,
      };
      queryStatsStore.record(stats);

      if (error instanceof QueryExecutionError) {
        throw error;
      }

      const errorMessage = this.sanitizeErrorMessage(error);
      logger.error({
        driver: connectionPool.driver,
        executionTimeMs,
        error: errorMessage,
      }, 'Query execution failed');

      throw new QueryExecutionError(errorMessage, this.classifyError(error));
    }
  }

  /**
   * Execute a preview query (limited rows for data inspection).
   */
  async preview(
    connectionPool: ConnectionPool,
    sql: string,
    parameters?: Record<string, unknown>,
    limit?: number
  ): Promise<QueryResult> {
    return this.execute(connectionPool, {
      sql,
      parameters,
      limit: limit ?? this.previewLimit,
      preview: true,
    });
  }

  // ============================================================
  // DRIVER-SPECIFIC EXECUTION
  // ============================================================

  private async executeWithDriver(
    connectionPool: ConnectionPool,
    sql: string,
    parameters: Record<string, unknown>,
    rowLimit: number,
    timeoutMs: number
  ): Promise<Omit<QueryResult, 'executionTimeMs'>> {
    switch (connectionPool.driver) {
      case 'postgresql':
        return this.executePostgresql(
          connectionPool.pool as PgPool,
          sql,
          parameters,
          rowLimit,
          timeoutMs
        );
      case 'mysql':
        return this.executeMysql(
          connectionPool.pool as MysqlPool,
          sql,
          parameters,
          rowLimit,
          timeoutMs
        );
      case 'mssql':
        return this.executeMssql(
          connectionPool.pool as mssql.ConnectionPool,
          sql,
          parameters,
          rowLimit,
          timeoutMs
        );
      default:
        throw new QueryExecutionError(
          `Unsupported database driver: ${connectionPool.driver}`,
          'UNSUPPORTED_DRIVER'
        );
    }
  }

  // ============================================================
  // POSTGRESQL
  // ============================================================

  private async executePostgresql(
    pool: PgPool,
    sql: string,
    parameters: Record<string, unknown>,
    rowLimit: number,
    timeoutMs: number
  ): Promise<Omit<QueryResult, 'executionTimeMs'>> {
    const client = await pool.connect();

    try {
      // Set statement timeout for this session
      await client.query(`SET statement_timeout = ${timeoutMs}`);

      // Convert named parameters to positional ($1, $2, ...)
      const { text, values } = this.convertToPositionalParams(sql, parameters);

      // Wrap with row limit (fetch limit + 1 to detect truncation)
      const limitedSql = `SELECT * FROM (${text}) AS __limited_query LIMIT ${rowLimit + 1}`;

      const result = await client.query(limitedSql, values);

      const truncated = result.rows.length > rowLimit;
      const rows = truncated ? result.rows.slice(0, rowLimit) : result.rows;

      const fields: QueryField[] = result.fields.map((f) => ({
        name: f.name,
        dataType: this.mapPgType(f.dataTypeID),
      }));

      return {
        fields,
        rows,
        rowCount: rows.length,
        totalRows: truncated ? rowLimit + 1 : rows.length,
        truncated,
      };
    } finally {
      client.release();
    }
  }

  // ============================================================
  // MYSQL
  // ============================================================

  private async executeMysql(
    pool: MysqlPool,
    sql: string,
    parameters: Record<string, unknown>,
    rowLimit: number,
    timeoutMs: number
  ): Promise<Omit<QueryResult, 'executionTimeMs'>> {
    const connection = await pool.getConnection();

    try {
      // Set query timeout (in seconds for MySQL)
      const timeoutSec = Math.ceil(timeoutMs / 1000);
      await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${timeoutSec * 1000}`);

      // Convert named parameters to positional (?)
      const { text, values } = this.convertToMysqlParams(sql, parameters);

      // Wrap with row limit (fetch limit + 1 to detect truncation)
      const limitedSql = `SELECT * FROM (${text}) AS __limited_query LIMIT ${rowLimit + 1}`;

      const [rows, fields] = await connection.query(limitedSql, values);
      const resultRows = rows as Record<string, unknown>[];

      const truncated = resultRows.length > rowLimit;
      const limitedRows = truncated ? resultRows.slice(0, rowLimit) : resultRows;

      const queryFields: QueryField[] = (fields as mysql.FieldPacket[]).map((f) => ({
        name: f.name,
        dataType: this.mapMysqlType(f.type),
      }));

      return {
        fields: queryFields,
        rows: limitedRows,
        rowCount: limitedRows.length,
        totalRows: truncated ? rowLimit + 1 : limitedRows.length,
        truncated,
      };
    } finally {
      connection.release();
    }
  }

  // ============================================================
  // MSSQL
  // ============================================================

  private async executeMssql(
    pool: mssql.ConnectionPool,
    sql: string,
    parameters: Record<string, unknown>,
    rowLimit: number,
    timeoutMs: number
  ): Promise<Omit<QueryResult, 'executionTimeMs'>> {
    const request = pool.request();

    // Set request timeout via the underlying config
    (request as unknown as { timeout: number }).timeout = timeoutMs;

    // Bind parameters safely using mssql's built-in parameterization
    for (const [key, value] of Object.entries(parameters)) {
      request.input(key, this.getMssqlType(value), value);
    }

    // Wrap with row limit using TOP (fetch limit + 1 to detect truncation)
    const limitedSql = `SELECT TOP ${rowLimit + 1} * FROM (${sql}) AS __limited_query`;

    const result = await request.query(limitedSql);

    const resultRows = result.recordset ?? [];
    const truncated = resultRows.length > rowLimit;
    const rows = truncated ? resultRows.slice(0, rowLimit) : resultRows;

    const columns = result.recordset.columns ?? {};
    const fields: QueryField[] = Object.keys(columns).map((name) => {
      const col = columns[name];
      return {
        name,
        dataType: this.mapMssqlType(col.type),
      };
    });

    return {
      fields,
      rows,
      rowCount: rows.length,
      totalRows: truncated ? rowLimit + 1 : rows.length,
      truncated,
    };
  }

  // ============================================================
  // PARAMETER CONVERSION (Named → Positional)
  // ============================================================

  /**
   * Converts named parameters (:paramName) to PostgreSQL positional ($1, $2, ...).
   * NEVER interpolates values into the SQL string.
   */
  private convertToPositionalParams(
    sql: string,
    parameters: Record<string, unknown>
  ): { text: string; values: unknown[] } {
    const values: unknown[] = [];
    const paramMap = new Map<string, number>();
    let paramIndex = 0;

    const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      if (!(name in parameters)) {
        throw new QueryExecutionError(
          `Missing parameter: "${name}"`,
          'MISSING_PARAMETER'
        );
      }

      if (!paramMap.has(name)) {
        paramIndex++;
        paramMap.set(name, paramIndex);
        values.push(parameters[name]);
      }

      return `$${paramMap.get(name)}`;
    });

    return { text, values };
  }

  /**
   * Converts named parameters (:paramName) to MySQL positional (?).
   * NEVER interpolates values into the SQL string.
   */
  private convertToMysqlParams(
    sql: string,
    parameters: Record<string, unknown>
  ): { text: string; values: unknown[] } {
    const values: unknown[] = [];

    const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      if (!(name in parameters)) {
        throw new QueryExecutionError(
          `Missing parameter: "${name}"`,
          'MISSING_PARAMETER'
        );
      }

      values.push(parameters[name]);
      return '?';
    });

    return { text, values };
  }

  // ============================================================
  // TYPE MAPPING
  // ============================================================

  private mapPgType(oid: number): string {
    const pgTypeMap: Record<number, string> = {
      16: 'boolean',
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      700: 'float',
      701: 'double',
      1043: 'varchar',
      1082: 'date',
      1114: 'timestamp',
      1184: 'timestamptz',
      1700: 'numeric',
      2950: 'uuid',
      3802: 'jsonb',
      114: 'json',
    };
    return pgTypeMap[oid] ?? 'text';
  }

  private mapMysqlType(typeId: number | undefined): string {
    if (typeId === undefined) return 'text';

    // mysql2 field type constants
    const mysqlTypeMap: Record<number, string> = {
      0: 'decimal',
      1: 'tinyint',
      2: 'smallint',
      3: 'integer',
      4: 'float',
      5: 'double',
      7: 'timestamp',
      8: 'bigint',
      9: 'mediumint',
      10: 'date',
      11: 'time',
      12: 'datetime',
      13: 'year',
      15: 'varchar',
      245: 'json',
      246: 'decimal',
      252: 'blob',
      253: 'varchar',
      254: 'char',
    };
    return mysqlTypeMap[typeId] ?? 'text';
  }

  private mapMssqlType(type: (() => mssql.ISqlType) | mssql.ISqlType | undefined): string {
    if (!type) return 'text';

    // type can be a function or an ISqlType object
    const typeName = typeof type === 'function' ? type.name : (type as { type?: string }).type ?? '';
    const mssqlTypeMap: Record<string, string> = {
      Int: 'integer',
      BigInt: 'bigint',
      SmallInt: 'smallint',
      TinyInt: 'tinyint',
      Float: 'float',
      Real: 'float',
      Decimal: 'decimal',
      Numeric: 'numeric',
      Bit: 'boolean',
      NVarChar: 'varchar',
      VarChar: 'varchar',
      NChar: 'char',
      Char: 'char',
      Text: 'text',
      NText: 'text',
      Date: 'date',
      DateTime: 'datetime',
      DateTime2: 'datetime',
      SmallDateTime: 'datetime',
      UniqueIdentifier: 'uuid',
    };
    return mssqlTypeMap[typeName] ?? 'text';
  }

  private getMssqlType(value: unknown): (() => mssql.ISqlType) | mssql.ISqlType {
    if (value === null || value === undefined) {
      return mssql.NVarChar(mssql.MAX);
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? mssql.Int() : mssql.Float();
    }
    if (typeof value === 'boolean') {
      return mssql.Bit();
    }
    if (value instanceof Date) {
      return mssql.DateTime2();
    }
    return mssql.NVarChar(mssql.MAX);
  }

  // ============================================================
  // STATS HELPERS
  // ============================================================

  /**
   * Truncates SQL for storage (avoids storing very large queries).
   * Keeps first 500 characters.
   */
  private truncateSql(sql: string): string {
    const maxLength = 500;
    if (sql.length <= maxLength) return sql;
    return sql.slice(0, maxLength) + '...';
  }

  /**
   * Infers whether an index was likely used based on heuristics:
   * - Low execution time relative to rows returned suggests index usage
   * - High rows scanned vs rows returned suggests full table scan (no index)
   */
  private inferIndexUsage(
    result: Omit<QueryResult, 'executionTimeMs'>,
    executionTimeMs: number
  ): boolean {
    // If very few rows returned quickly, likely used an index
    if (result.rowCount <= 100 && executionTimeMs < 50) {
      return true;
    }

    // If many rows scanned but few returned, likely no index (full scan)
    if (result.totalRows > 1000 && result.rowCount < result.totalRows * 0.1) {
      return false;
    }

    // If execution was fast relative to rows, likely indexed
    if (executionTimeMs < 100 && result.rowCount > 0) {
      return true;
    }

    // Default: assume index used if execution time is reasonable
    return executionTimeMs < 500;
  }

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  /**
   * Sanitizes error messages to prevent leaking internal details.
   */
  private sanitizeErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'An unexpected error occurred during query execution.';
    }

    const message = error.message;

    // Detect timeout errors
    if (
      message.includes('timeout') ||
      message.includes('canceling statement due to statement timeout') ||
      message.includes('MAX_EXECUTION_TIME')
    ) {
      return 'Query exceeded the maximum execution time limit (120 seconds).';
    }

    // Detect connection errors
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('ETIMEDOUT')
    ) {
      return 'Unable to reach the database server.';
    }

    // Detect permission errors
    if (
      message.includes('permission denied') ||
      message.includes('Access denied')
    ) {
      return 'Insufficient permissions to execute this query.';
    }

    // Return a sanitized version — strip potential credential/path info
    const sanitized = message
      .replace(/password[=:]\s*\S+/gi, 'password=***')
      .replace(/host[=:]\s*\S+/gi, 'host=***')
      .replace(/\/\/.+@/g, '//***@');

    // Limit message length
    return sanitized.length > 200
      ? sanitized.slice(0, 200) + '...'
      : sanitized;
  }

  private classifyError(error: unknown): string {
    if (!(error instanceof Error)) return 'UNKNOWN_ERROR';

    const message = error.message.toLowerCase();

    if (message.includes('timeout')) return 'QUERY_TIMEOUT';
    if (message.includes('econnrefused') || message.includes('enotfound')) return 'CONNECTION_ERROR';
    if (message.includes('permission') || message.includes('access denied')) return 'PERMISSION_ERROR';
    if (message.includes('syntax')) return 'SYNTAX_ERROR';
    if (message.includes('does not exist') || message.includes('unknown column')) return 'INVALID_REFERENCE';

    return 'EXECUTION_ERROR';
  }
}
