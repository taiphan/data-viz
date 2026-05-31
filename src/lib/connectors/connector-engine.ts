import {
  ConnectorEngineInterface,
  ConnectionTestResult,
  ConnectionSession,
  SchemaInfo,
  QueryRequest,
  QueryResult,
} from './types';
import { withRetry } from './retry';
import { formatConnectionError } from './error-utils';
import {
  DEFAULT_RETRY_CONFIG,
  CONNECTION_TIMEOUT_MS,
  QUERY_TIMEOUT_MS,
  PREVIEW_ROW_LIMIT,
} from './constants';

// ============================================================
// CONNECTOR ENGINE — Client-side service communicating with proxy
// ============================================================

const PROXY_BASE_URL = process.env.NEXT_PUBLIC_CONNECTOR_PROXY_URL || 'http://localhost:4000';

/**
 * Performs a fetch request with a timeout using AbortController.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parses a response body and throws a descriptive error if the response is not OK.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.message || parsed.error || `Request failed with status ${response.status}`;
    } catch {
      message = `Request failed with status ${response.status}`;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/**
 * ConnectorEngine is the client-side service that communicates with the
 * Connector Proxy backend to manage database connections, execute queries,
 * and retrieve schema information.
 *
 * It implements ConnectorEngineInterface and integrates:
 * - Retry logic with exponential backoff for transient failures
 * - Timeout handling for connection and query operations
 * - User-friendly error formatting that never exposes credentials
 */
export class ConnectorEngine implements ConnectorEngineInterface {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || PROXY_BASE_URL;
  }

  /**
   * Tests connectivity to a data source without establishing a persistent connection.
   * Retries up to 3 times with exponential backoff on transient failures.
   *
   * @param connectorId - The connector type identifier
   * @param params - Connection parameters (host, port, credentials, etc.)
   * @returns ConnectionTestResult with success status, message, and latency
   */
  async testConnection(
    connectorId: string,
    params: Record<string, unknown>,
  ): Promise<ConnectionTestResult> {
    try {
      const result = await withRetry(
        () => this.postRequest<ConnectionTestResult>(
          '/api/connections/test',
          { connectorId, params },
          CONNECTION_TIMEOUT_MS,
        ),
        DEFAULT_RETRY_CONFIG,
      );
      return result;
    } catch (error) {
      return {
        success: false,
        message: formatConnectionError(error, connectorId),
        latencyMs: 0,
      };
    }
  }

  /**
   * Establishes a persistent connection to a data source via the proxy.
   * Retries on transient network failures.
   *
   * @param connectorId - The connector type identifier
   * @param params - Connection parameters
   * @returns ConnectionSession with connection ID and status
   */
  async connect(
    connectorId: string,
    params: Record<string, unknown>,
  ): Promise<ConnectionSession> {
    try {
      const session = await withRetry(
        () => this.postRequest<ConnectionSession>(
          '/api/connections',
          { connectorId, params },
          CONNECTION_TIMEOUT_MS,
        ),
        DEFAULT_RETRY_CONFIG,
      );
      return session;
    } catch (error) {
      throw new Error(formatConnectionError(error, connectorId));
    }
  }

  /**
   * Disconnects an active connection, releasing server-side resources.
   * Does not retry — disconnection failures are non-critical.
   *
   * @param connectionId - The active connection ID to close
   */
  async disconnect(connectionId: string): Promise<void> {
    try {
      await fetchWithTimeout(
        `${this.baseUrl}/api/connections/${encodeURIComponent(connectionId)}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        },
        CONNECTION_TIMEOUT_MS,
      );
    } catch (error) {
      throw new Error(formatConnectionError(error));
    }
  }

  /**
   * Retrieves the schema (databases, tables, columns) for an active connection.
   * Retries on transient failures since schema discovery can be slow.
   *
   * @param connectionId - The active connection ID
   * @returns SchemaInfo with the full schema tree
   */
  async getSchema(connectionId: string): Promise<SchemaInfo> {
    try {
      const schema = await withRetry(
        () => this.getRequest<SchemaInfo>(
          `/api/connections/${encodeURIComponent(connectionId)}/schema`,
          CONNECTION_TIMEOUT_MS,
        ),
        DEFAULT_RETRY_CONFIG,
      );
      return schema;
    } catch (error) {
      throw new Error(formatConnectionError(error));
    }
  }

  /**
   * Executes a SQL query against a connected data source.
   * Uses a longer timeout (120s) for query execution.
   * Retries on transient network failures.
   *
   * @param request - QueryRequest with connectionId, sql, parameters, limit, offset
   * @returns QueryResult with fields, rows, and execution metadata
   */
  async executeQuery(request: QueryRequest): Promise<QueryResult> {
    try {
      const result = await withRetry(
        () => this.postRequest<QueryResult>(
          '/api/query',
          request,
          QUERY_TIMEOUT_MS,
        ),
        DEFAULT_RETRY_CONFIG,
      );
      return result;
    } catch (error) {
      throw new Error(formatConnectionError(error));
    }
  }

  /**
   * Fetches a preview of a table (first N rows) for the schema browser.
   * Uses the default preview limit of 100 rows.
   *
   * @param connectionId - The active connection ID
   * @param schema - Schema name containing the table
   * @param table - Table name to preview
   * @param limit - Number of rows to fetch (defaults to PREVIEW_ROW_LIMIT)
   * @returns QueryResult with preview data
   */
  async previewTable(
    connectionId: string,
    schema: string,
    table: string,
    limit?: number,
  ): Promise<QueryResult> {
    const rowLimit = limit ?? PREVIEW_ROW_LIMIT;
    const params = new URLSearchParams({
      schema,
      table,
      limit: String(rowLimit),
    });

    try {
      const result = await withRetry(
        () => this.getRequest<QueryResult>(
          `/api/connections/${encodeURIComponent(connectionId)}/preview?${params.toString()}`,
          QUERY_TIMEOUT_MS,
        ),
        DEFAULT_RETRY_CONFIG,
      );
      return result;
    } catch (error) {
      throw new Error(formatConnectionError(error));
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  private async postRequest<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    return handleResponse<T>(response);
  }

  private async getRequest<T>(
    path: string,
    timeoutMs: number,
  ): Promise<T> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      },
      timeoutMs,
    );
    return handleResponse<T>(response);
  }
}

/**
 * Singleton instance of the ConnectorEngine for use throughout the application.
 */
export const connectorEngine = new ConnectorEngine();
