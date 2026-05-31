import { JSONPath } from 'jsonpath-plus';
import { DataSource, DataField, FieldType, FieldRole } from '../types';
import { ConnectionTestResult } from './types';
import { generateId } from '../data-engine';
import { MAX_RESULT_ROWS } from './constants';

// ============================================================
// REST API CONNECTOR — Client-side REST API data fetching
// ============================================================

export type RestApiAuthType = 'none' | 'api-key' | 'bearer' | 'basic' | 'oauth2';

export type PaginationType = 'none' | 'offset' | 'cursor' | 'next-link';

export interface RestApiAuthConfig {
  type: RestApiAuthType;
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyLocation?: 'header' | 'query';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  oauth2Token?: string;
}

export interface RestApiPaginationConfig {
  type: PaginationType;
  pageParam?: string;
  limitParam?: string;
  cursorField?: string;
  nextLinkField?: string;
  pageSize?: number;
}

export interface RestApiConfig {
  baseUrl: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  auth: RestApiAuthConfig;
  responseDataPath?: string;
  pagination: RestApiPaginationConfig;
  maxRows?: number;
}

// ============================================================
// AUTH HEADER BUILDING
// ============================================================

function buildAuthHeaders(auth: RestApiAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  switch (auth.type) {
    case 'api-key': {
      if (auth.apiKey && auth.apiKeyLocation !== 'query') {
        const headerName = auth.apiKeyHeader || 'X-API-Key';
        headers[headerName] = auth.apiKey;
      }
      break;
    }
    case 'bearer': {
      if (auth.bearerToken) {
        headers['Authorization'] = `Bearer ${auth.bearerToken}`;
      }
      break;
    }
    case 'basic': {
      if (auth.basicUsername && auth.basicPassword) {
        const encoded = btoa(`${auth.basicUsername}:${auth.basicPassword}`);
        headers['Authorization'] = `Basic ${encoded}`;
      }
      break;
    }
    case 'oauth2': {
      if (auth.oauth2Token) {
        headers['Authorization'] = `Bearer ${auth.oauth2Token}`;
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  return headers;
}

// ============================================================
// URL BUILDING WITH AUTH QUERY PARAMS
// ============================================================

function buildUrl(
  baseUrl: string,
  auth: RestApiAuthConfig,
  paginationParams?: Record<string, string>,
): string {
  const url = new URL(baseUrl);

  // API key in query param
  if (auth.type === 'api-key' && auth.apiKeyLocation === 'query' && auth.apiKey) {
    const paramName = auth.apiKeyHeader || 'api_key';
    url.searchParams.set(paramName, auth.apiKey);
  }

  // Pagination params
  if (paginationParams) {
    for (const [key, value] of Object.entries(paginationParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

// ============================================================
// DATA EXTRACTION FROM RESPONSE
// ============================================================

function extractDataFromResponse(
  responseBody: unknown,
  dataPath?: string,
): unknown[] {
  if (!dataPath || dataPath.trim() === '') {
    // No path specified — expect top-level array
    if (Array.isArray(responseBody)) {
      return responseBody;
    }
    return [responseBody];
  }

  // Use JSONPath if path starts with $ (standard JSONPath syntax)
  if (dataPath.startsWith('$')) {
    const result = JSONPath({ path: dataPath, json: responseBody as object });
    if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0])) {
      return result[0];
    }
    return Array.isArray(result) ? result : [];
  }

  // Dot-notation path (e.g., "data.results")
  const parts = dataPath.split('.');
  let current: unknown = responseBody;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return [];
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (Array.isArray(current)) {
    return current;
  }

  return current != null ? [current] : [];
}

// ============================================================
// PAGINATION HELPERS
// ============================================================

function getNextCursor(
  responseBody: unknown,
  cursorField: string,
): string | null {
  if (!cursorField || responseBody == null || typeof responseBody !== 'object') {
    return null;
  }

  // Support dot-notation for cursor field
  const parts = cursorField.split('.');
  let current: unknown = responseBody;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current != null ? String(current) : null;
}

function getNextLink(
  responseBody: unknown,
  nextLinkField: string,
): string | null {
  if (!nextLinkField || responseBody == null || typeof responseBody !== 'object') {
    return null;
  }

  // Support dot-notation for next link field
  const parts = nextLinkField.split('.');
  let current: unknown = responseBody;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current === 'string' && current.length > 0) {
    return current;
  }

  return null;
}

// ============================================================
// SINGLE PAGE FETCH
// ============================================================

async function fetchPage(
  url: string,
  config: RestApiConfig,
  authHeaders: Record<string, string>,
): Promise<{ body: unknown; status: number }> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...config.headers,
    ...authHeaders,
  };

  const fetchOptions: RequestInit = {
    method: config.method,
    headers,
  };

  if (config.method === 'POST' && config.body) {
    fetchOptions.body = config.body;
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `API returned error: ${response.status} ${response.statusText}. ${text.slice(0, 200)}`,
    );
  }

  const body = await response.json();
  return { body, status: response.status };
}

// ============================================================
// PAGINATED FETCH
// ============================================================

export async function fetchAllPages(
  config: RestApiConfig,
): Promise<unknown[]> {
  const authHeaders = buildAuthHeaders(config.auth);
  const maxRows = config.maxRows ?? MAX_RESULT_ROWS;
  const allRows: unknown[] = [];
  const { pagination } = config;

  if (pagination.type === 'none') {
    const url = buildUrl(config.baseUrl, config.auth);
    const { body } = await fetchPage(url, config, authHeaders);
    const data = extractDataFromResponse(body, config.responseDataPath);
    return data.slice(0, maxRows);
  }

  if (pagination.type === 'offset') {
    const pageSize = pagination.pageSize ?? 100;
    const limitParam = pagination.limitParam || 'limit';
    const pageParam = pagination.pageParam || 'offset';
    let offset = 0;

    while (allRows.length < maxRows) {
      const paginationParams: Record<string, string> = {
        [limitParam]: String(pageSize),
        [pageParam]: String(offset),
      };

      const url = buildUrl(config.baseUrl, config.auth, paginationParams);
      const { body } = await fetchPage(url, config, authHeaders);
      const data = extractDataFromResponse(body, config.responseDataPath);

      if (data.length === 0) break;

      allRows.push(...data);
      offset += pageSize;

      // If we got fewer results than page size, we've reached the end
      if (data.length < pageSize) break;
    }

    return allRows.slice(0, maxRows);
  }

  if (pagination.type === 'cursor') {
    const pageSize = pagination.pageSize ?? 100;
    const limitParam = pagination.limitParam || 'limit';
    const cursorField = pagination.cursorField || 'next_cursor';
    let cursor: string | null = null;

    while (allRows.length < maxRows) {
      const paginationParams: Record<string, string> = {
        [limitParam]: String(pageSize),
      };

      if (cursor) {
        const cursorParam = pagination.pageParam || 'cursor';
        paginationParams[cursorParam] = cursor;
      }

      const url = buildUrl(config.baseUrl, config.auth, paginationParams);
      const { body } = await fetchPage(url, config, authHeaders);
      const data = extractDataFromResponse(body, config.responseDataPath);

      if (data.length === 0) break;

      allRows.push(...data);
      cursor = getNextCursor(body, cursorField);

      if (!cursor) break;
    }

    return allRows.slice(0, maxRows);
  }

  if (pagination.type === 'next-link') {
    const nextLinkField = pagination.nextLinkField || 'next';
    let nextUrl: string | null = buildUrl(config.baseUrl, config.auth);

    while (nextUrl && allRows.length < maxRows) {
      const { body } = await fetchPage(nextUrl, config, authHeaders);
      const data = extractDataFromResponse(body, config.responseDataPath);

      if (data.length === 0) break;

      allRows.push(...data);
      nextUrl = getNextLink(body, nextLinkField);
    }

    return allRows.slice(0, maxRows);
  }

  // Fallback: no pagination
  const url = buildUrl(config.baseUrl, config.auth);
  const { body } = await fetchPage(url, config, authHeaders);
  const data = extractDataFromResponse(body, config.responseDataPath);
  return data.slice(0, maxRows);
}

// ============================================================
// TYPE DETECTION FROM VALUES
// ============================================================

function detectFieldTypeFromValues(values: unknown[]): FieldType {
  const nonNull = values.filter((v) => v != null);
  if (nonNull.length === 0) return 'string';

  const allNumbers = nonNull.every(
    (v) => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''),
  );
  if (allNumbers) return 'number';

  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{2}-\d{2}-\d{4}/,
  ];
  const allDates = nonNull.every(
    (v) => typeof v === 'string' && datePatterns.some((p) => p.test(v)),
  );
  if (allDates) return 'date';

  const allBooleans = nonNull.every((v) => typeof v === 'boolean');
  if (allBooleans) return 'boolean';

  return 'string';
}

function assignFieldRole(type: FieldType): FieldRole {
  return type === 'number' ? 'measure' : 'dimension';
}

// ============================================================
// TRANSFORM RAW ROWS TO DATASOURCE
// ============================================================

function transformRowsToDataSource(
  rawRows: unknown[],
  name: string,
): DataSource {
  // Flatten rows to Record<string, unknown>
  const rows: Record<string, unknown>[] = rawRows.map((row) => {
    if (row != null && typeof row === 'object' && !Array.isArray(row)) {
      return row as Record<string, unknown>;
    }
    return { value: row };
  });

  if (rows.length === 0) {
    return {
      id: generateId(),
      name,
      fileName: name,
      fields: [],
      rows: [],
      rowCount: 0,
      importedAt: new Date().toISOString(),
      sourceInfo: { connectorId: 'rest-api' },
    };
  }

  // Collect all field names from all rows
  const fieldNames = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      fieldNames.add(key);
    }
  }

  // Build fields with type detection
  const sampleRows = rows.slice(0, 200);
  const fields: DataField[] = Array.from(fieldNames).map((fieldName) => {
    const values = sampleRows.map((row) => row[fieldName]);
    const type = detectFieldTypeFromValues(values);
    const role = assignFieldRole(type);

    const nonNullValues = rows
      .map((row) => row[fieldName])
      .filter((v) => v != null);
    const sampleValues = Array.from(new Set(nonNullValues.map(String))).slice(0, 20);
    const nullCount = rows.filter((row) => row[fieldName] == null).length;
    const uniqueCount = new Set(rows.map((row) => row[fieldName])).size;

    return {
      id: generateId(),
      name: fieldName,
      originalName: fieldName,
      type,
      role,
      sampleValues,
      nullCount,
      uniqueCount,
    };
  });

  // Cast values to detected types
  const typedRows = rows.map((row) => {
    const typedRow: Record<string, unknown> = {};
    for (const field of fields) {
      const value = row[field.name];
      if (value == null) {
        typedRow[field.name] = null;
      } else if (field.type === 'number') {
        typedRow[field.name] = typeof value === 'number' ? value : Number(value);
      } else if (field.type === 'boolean') {
        typedRow[field.name] = typeof value === 'boolean' ? value : value === 'true';
      } else {
        typedRow[field.name] = String(value);
      }
    }
    return typedRow;
  });

  return {
    id: generateId(),
    name,
    fileName: name,
    fields,
    rows: typedRows,
    rowCount: typedRows.length,
    importedAt: new Date().toISOString(),
    sourceInfo: { connectorId: 'rest-api' },
  };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Tests connectivity to a REST API endpoint by making a single request.
 */
export async function testRestApiConnection(
  config: RestApiConfig,
): Promise<ConnectionTestResult> {
  const start = Date.now();

  try {
    const authHeaders = buildAuthHeaders(config.auth);
    const url = buildUrl(config.baseUrl, config.auth);
    await fetchPage(url, config, authHeaders);

    return {
      success: true,
      message: 'Successfully connected to REST API endpoint.',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to connect to REST API.',
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Fetches data from a REST API endpoint, handles pagination,
 * extracts data using JSONPath/dot-notation, and transforms
 * the result into a DataSource.
 */
export async function fetchRestApi(
  config: RestApiConfig,
): Promise<DataSource> {
  const rawRows = await fetchAllPages(config);
  const name = new URL(config.baseUrl).hostname;
  return transformRowsToDataSource(rawRows, name);
}

// Re-export for testing
export {
  buildAuthHeaders,
  buildUrl,
  extractDataFromResponse,
  getNextCursor,
  getNextLink,
  transformRowsToDataSource,
};
