import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthHeaders,
  buildUrl,
  extractDataFromResponse,
  getNextCursor,
  getNextLink,
  transformRowsToDataSource,
  fetchAllPages,
  testRestApiConnection,
  fetchRestApi,
  RestApiConfig,
} from './rest-api-connector';

// ============================================================
// UNIT TESTS — REST API Connector
// ============================================================

describe('buildAuthHeaders', () => {
  it('returns empty headers for auth type none', () => {
    const headers = buildAuthHeaders({ type: 'none' });
    expect(headers).toEqual({});
  });

  it('returns API key header with custom name', () => {
    const headers = buildAuthHeaders({
      type: 'api-key',
      apiKey: 'my-secret-key',
      apiKeyHeader: 'X-Custom-Key',
    });
    expect(headers).toEqual({ 'X-Custom-Key': 'my-secret-key' });
  });

  it('returns default X-API-Key header when no custom name', () => {
    const headers = buildAuthHeaders({
      type: 'api-key',
      apiKey: 'key123',
    });
    expect(headers).toEqual({ 'X-API-Key': 'key123' });
  });

  it('does not add header when apiKeyLocation is query', () => {
    const headers = buildAuthHeaders({
      type: 'api-key',
      apiKey: 'key123',
      apiKeyLocation: 'query',
    });
    expect(headers).toEqual({});
  });

  it('returns Bearer token header', () => {
    const headers = buildAuthHeaders({
      type: 'bearer',
      bearerToken: 'token-abc',
    });
    expect(headers).toEqual({ 'Authorization': 'Bearer token-abc' });
  });

  it('returns Basic auth header', () => {
    const headers = buildAuthHeaders({
      type: 'basic',
      basicUsername: 'user',
      basicPassword: 'pass',
    });
    const expected = btoa('user:pass');
    expect(headers).toEqual({ 'Authorization': `Basic ${expected}` });
  });

  it('returns OAuth2 bearer header', () => {
    const headers = buildAuthHeaders({
      type: 'oauth2',
      oauth2Token: 'oauth-token-xyz',
    });
    expect(headers).toEqual({ 'Authorization': 'Bearer oauth-token-xyz' });
  });
});

describe('buildUrl', () => {
  it('returns base URL unchanged for non-query auth', () => {
    const url = buildUrl('https://api.example.com/data', { type: 'none' });
    expect(url).toBe('https://api.example.com/data');
  });

  it('adds API key as query param when location is query', () => {
    const url = buildUrl('https://api.example.com/data', {
      type: 'api-key',
      apiKey: 'secret',
      apiKeyLocation: 'query',
      apiKeyHeader: 'key',
    });
    expect(url).toBe('https://api.example.com/data?key=secret');
  });

  it('adds pagination params to URL', () => {
    const url = buildUrl(
      'https://api.example.com/data',
      { type: 'none' },
      { limit: '50', offset: '100' },
    );
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=100');
  });
});

describe('extractDataFromResponse', () => {
  it('returns top-level array directly', () => {
    const data = [{ id: 1 }, { id: 2 }];
    expect(extractDataFromResponse(data)).toEqual(data);
  });

  it('wraps non-array response in array when no path', () => {
    const data = { id: 1, name: 'test' };
    expect(extractDataFromResponse(data)).toEqual([data]);
  });

  it('extracts data using dot-notation path', () => {
    const response = {
      data: {
        results: [{ id: 1 }, { id: 2 }],
      },
    };
    expect(extractDataFromResponse(response, 'data.results')).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it('extracts data using JSONPath syntax', () => {
    const response = {
      data: {
        items: [{ name: 'a' }, { name: 'b' }],
      },
    };
    expect(extractDataFromResponse(response, '$.data.items')).toEqual([
      { name: 'a' },
      { name: 'b' },
    ]);
  });

  it('returns empty array for invalid path', () => {
    const response = { data: { items: [] } };
    expect(extractDataFromResponse(response, 'nonexistent.path')).toEqual([]);
  });

  it('handles empty data path', () => {
    const data = [{ id: 1 }];
    expect(extractDataFromResponse(data, '')).toEqual(data);
  });
});

describe('getNextCursor', () => {
  it('extracts cursor from top-level field', () => {
    const body = { next_cursor: 'abc123', data: [] };
    expect(getNextCursor(body, 'next_cursor')).toBe('abc123');
  });

  it('extracts cursor from nested field', () => {
    const body = { pagination: { cursor: 'xyz' }, data: [] };
    expect(getNextCursor(body, 'pagination.cursor')).toBe('xyz');
  });

  it('returns null when cursor field is missing', () => {
    const body = { data: [] };
    expect(getNextCursor(body, 'next_cursor')).toBeNull();
  });

  it('returns null for null body', () => {
    expect(getNextCursor(null, 'cursor')).toBeNull();
  });
});

describe('getNextLink', () => {
  it('extracts next link from top-level field', () => {
    const body = { next: 'https://api.example.com/data?page=2', data: [] };
    expect(getNextLink(body, 'next')).toBe('https://api.example.com/data?page=2');
  });

  it('extracts next link from nested field', () => {
    const body = { links: { next: 'https://api.example.com/page/3' } };
    expect(getNextLink(body, 'links.next')).toBe('https://api.example.com/page/3');
  });

  it('returns null when next link is empty string', () => {
    const body = { next: '' };
    expect(getNextLink(body, 'next')).toBeNull();
  });

  it('returns null when field is not a string', () => {
    const body = { next: 123 };
    expect(getNextLink(body, 'next')).toBeNull();
  });
});

describe('transformRowsToDataSource', () => {
  it('transforms array of objects into DataSource', () => {
    const rows = [
      { name: 'Alice', age: 30, active: true },
      { name: 'Bob', age: 25, active: false },
    ];

    const ds = transformRowsToDataSource(rows, 'test-api');

    expect(ds.name).toBe('test-api');
    expect(ds.rowCount).toBe(2);
    expect(ds.fields).toHaveLength(3);
    expect(ds.sourceInfo?.connectorId).toBe('rest-api');
    expect(ds.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('detects number fields correctly', () => {
    const rows = [
      { count: 10, label: 'a' },
      { count: 20, label: 'b' },
    ];

    const ds = transformRowsToDataSource(rows, 'test');
    const countField = ds.fields.find((f) => f.name === 'count');
    expect(countField?.type).toBe('number');
    expect(countField?.role).toBe('measure');
  });

  it('detects string fields correctly', () => {
    const rows = [
      { city: 'NYC' },
      { city: 'LA' },
    ];

    const ds = transformRowsToDataSource(rows, 'test');
    const cityField = ds.fields.find((f) => f.name === 'city');
    expect(cityField?.type).toBe('string');
    expect(cityField?.role).toBe('dimension');
  });

  it('handles empty rows array', () => {
    const ds = transformRowsToDataSource([], 'empty');
    expect(ds.rowCount).toBe(0);
    expect(ds.fields).toHaveLength(0);
    expect(ds.rows).toHaveLength(0);
  });

  it('handles non-object rows by wrapping in value field', () => {
    const rows = [1, 2, 3];
    const ds = transformRowsToDataSource(rows, 'primitives');
    expect(ds.fields).toHaveLength(1);
    expect(ds.fields[0].name).toBe('value');
    expect(ds.rowCount).toBe(3);
  });

  it('casts values to detected types', () => {
    const rows = [
      { score: 95, name: 'Alice' },
      { score: 88, name: 'Bob' },
    ];

    const ds = transformRowsToDataSource(rows, 'test');
    expect(ds.rows[0]['score']).toBe(95);
    expect(typeof ds.rows[0]['score']).toBe('number');
    expect(typeof ds.rows[0]['name']).toBe('string');
  });
});

describe('fetchAllPages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches single page when pagination is none', async () => {
    const mockResponse = [{ id: 1 }, { id: 2 }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const config: RestApiConfig = {
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'none' },
      pagination: { type: 'none' },
    };

    const rows = await fetchAllPages(config);
    expect(rows).toEqual(mockResponse);
  });

  it('fetches multiple pages with offset pagination', async () => {
    const page1 = [{ id: 1 }, { id: 2 }];
    const page2 = [{ id: 3 }];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page2), { status: 200 }),
      );

    const config: RestApiConfig = {
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'none' },
      pagination: { type: 'offset', pageSize: 2 },
    };

    const rows = await fetchAllPages(config);
    expect(rows).toEqual([...page1, ...page2]);
  });

  it('stops offset pagination when empty page returned', async () => {
    const page1 = [{ id: 1 }];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

    const config: RestApiConfig = {
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'none' },
      pagination: { type: 'offset', pageSize: 10 },
    };

    const rows = await fetchAllPages(config);
    expect(rows).toEqual(page1);
  });

  it('fetches with cursor pagination', async () => {
    const response1 = { data: [{ id: 1 }], next_cursor: 'cursor2' };
    const response2 = { data: [{ id: 2 }], next_cursor: null };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(response1), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(response2), { status: 200 }),
      );

    const config: RestApiConfig = {
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'none' },
      responseDataPath: 'data',
      pagination: { type: 'cursor', cursorField: 'next_cursor', pageSize: 10 },
    };

    const rows = await fetchAllPages(config);
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('fetches with next-link pagination', async () => {
    const response1 = {
      results: [{ id: 1 }],
      next: 'https://api.example.com/data?page=2',
    };
    const response2 = {
      results: [{ id: 2 }],
      next: null,
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(response1), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(response2), { status: 200 }),
      );

    const config: RestApiConfig = {
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'none' },
      responseDataPath: 'results',
      pagination: { type: 'next-link', nextLinkField: 'next' },
    };

    const rows = await fetchAllPages(config);
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('respects maxRows limit', async () => {
    const largeData = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(largeData), { status: 200 }),
    );

    const config: RestApiConfig = {
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'none' },
      pagination: { type: 'none' },
      maxRows: 10,
    };

    const rows = await fetchAllPages(config);
    expect(rows).toHaveLength(10);
  });
});

describe('testRestApiConnection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success on 200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await testRestApiConnection({
      baseUrl: 'https://api.example.com/health',
      method: 'GET',
      auth: { type: 'none' },
      pagination: { type: 'none' },
    });

    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns failure on error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    const result = await testRestApiConnection({
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'bearer', bearerToken: 'bad-token' },
      pagination: { type: 'none' },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('401');
  });

  it('returns failure on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error'),
    );

    const result = await testRestApiConnection({
      baseUrl: 'https://api.example.com/data',
      method: 'GET',
      auth: { type: 'none' },
      pagination: { type: 'none' },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Network error');
  });
});

describe('fetchRestApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a DataSource from API response', async () => {
    const mockData = [
      { name: 'Product A', price: 29.99 },
      { name: 'Product B', price: 49.99 },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const ds = await fetchRestApi({
      baseUrl: 'https://api.example.com/products',
      method: 'GET',
      auth: { type: 'none' },
      pagination: { type: 'none' },
    });

    expect(ds.rowCount).toBe(2);
    expect(ds.fields).toHaveLength(2);
    expect(ds.name).toBe('api.example.com');
    expect(ds.sourceInfo?.connectorId).toBe('rest-api');
  });

  it('extracts nested data with responseDataPath', async () => {
    const mockResponse = {
      status: 'ok',
      data: {
        items: [
          { id: 1, value: 100 },
          { id: 2, value: 200 },
        ],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const ds = await fetchRestApi({
      baseUrl: 'https://api.example.com/report',
      method: 'GET',
      auth: { type: 'bearer', bearerToken: 'token123' },
      responseDataPath: 'data.items',
      pagination: { type: 'none' },
    });

    expect(ds.rowCount).toBe(2);
    expect(ds.rows[0]['id']).toBe(1);
    expect(ds.rows[0]['value']).toBe(100);
  });
});
