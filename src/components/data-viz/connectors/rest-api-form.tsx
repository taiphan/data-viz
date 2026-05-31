'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchRestApi,
  testRestApiConnection,
  RestApiConfig,
  RestApiAuthType,
  RestApiAuthConfig,
  RestApiPaginationConfig,
  PaginationType,
} from '@/lib/connectors/rest-api-connector';
import { useWorkbookStore } from '@/lib/store';
import { DataSource } from '@/lib/types';
import {
  Globe,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Table2,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface HeaderEntry {
  id: string;
  key: string;
  value: string;
}

interface ConnectionStatus {
  type: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  latencyMs?: number;
}

// ============================================================
// REST API CONNECTOR FORM
// ============================================================

export function RestApiForm() {
  const { addDataSource } = useWorkbookStore();

  // URL and method
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');

  // Headers
  const [headers, setHeaders] = useState<HeaderEntry[]>([]);

  // Auth
  const [authType, setAuthType] = useState<RestApiAuthType>('none');
  const [authConfig, setAuthConfig] = useState<RestApiAuthConfig>({ type: 'none' });

  // Request body (POST)
  const [body, setBody] = useState('');

  // Data extraction
  const [responseDataPath, setResponseDataPath] = useState('');

  // Pagination
  const [paginationType, setPaginationType] = useState<PaginationType>('none');
  const [paginationConfig, setPaginationConfig] = useState<RestApiPaginationConfig>({
    type: 'none',
  });

  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ type: 'idle' });
  const [isFetching, setIsFetching] = useState(false);
  const [preview, setPreview] = useState<DataSource | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ---- Build config from form state ----
  const buildConfig = useCallback((): RestApiConfig => {
    const headersRecord: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) {
        headersRecord[h.key.trim()] = h.value;
      }
    }

    return {
      baseUrl: url,
      method,
      headers: Object.keys(headersRecord).length > 0 ? headersRecord : undefined,
      body: method === 'POST' && body.trim() ? body : undefined,
      auth: { ...authConfig, type: authType },
      responseDataPath: responseDataPath.trim() || undefined,
      pagination: { ...paginationConfig, type: paginationType },
    };
  }, [url, method, headers, authType, authConfig, body, responseDataPath, paginationType, paginationConfig]);

  // ---- Test Connection ----
  const handleTestConnection = useCallback(async () => {
    if (!url.trim()) return;
    setConnectionStatus({ type: 'testing' });
    try {
      const result = await testRestApiConnection(buildConfig());
      if (result.success) {
        setConnectionStatus({
          type: 'success',
          message: result.message,
          latencyMs: result.latencyMs,
        });
      } else {
        setConnectionStatus({ type: 'error', message: result.message });
      }
    } catch (err) {
      setConnectionStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    }
  }, [url, buildConfig]);

  // ---- Fetch Data ----
  const handleFetchData = useCallback(async () => {
    if (!url.trim()) return;
    setIsFetching(true);
    setFetchError(null);
    setPreview(null);
    try {
      const dataSource = await fetchRestApi(buildConfig());
      setPreview(dataSource);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsFetching(false);
    }
  }, [url, buildConfig]);

  // ---- Import to workbook ----
  const handleImport = useCallback(() => {
    if (preview) {
      addDataSource(preview);
      setPreview(null);
    }
  }, [preview, addDataSource]);

  // ---- Header management ----
  const addHeader = () => {
    setHeaders((prev) => [...prev, { id: crypto.randomUUID(), key: '', value: '' }]);
  };

  const removeHeader = (id: string) => {
    setHeaders((prev) => prev.filter((h) => h.id !== id));
  };

  const updateHeader = (id: string, field: 'key' | 'value', val: string) => {
    setHeaders((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: val } : h)),
    );
  };

  return (
    <div className="space-y-4 p-4 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold">REST API Connector</h2>
      </div>

      {/* URL and Method */}
      <div className="flex gap-2">
        <div className="w-28">
          <Label htmlFor="rest-method">Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as 'GET' | 'POST')}>
            <SelectTrigger className="w-full mt-1" id="rest-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label htmlFor="rest-url">URL</Label>
          <Input
            id="rest-url"
            placeholder="https://api.example.com/data"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      {/* Tabs for config sections */}
      <Tabs defaultValue="headers">
        <TabsList>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          {method === 'POST' && <TabsTrigger value="body">Body</TabsTrigger>}
          <TabsTrigger value="data-path">Data Path</TabsTrigger>
          <TabsTrigger value="pagination">Pagination</TabsTrigger>
        </TabsList>

        {/* Headers Tab */}
        <TabsContent value="headers">
          <div className="space-y-2 pt-2">
            {headers.map((header) => (
              <div key={header.id} className="flex gap-2 items-center">
                <Input
                  placeholder="Header name"
                  value={header.key}
                  onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                  className="flex-1"
                  aria-label="Header name"
                />
                <Input
                  placeholder="Value"
                  value={header.value}
                  onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                  className="flex-1"
                  aria-label="Header value"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeHeader(header.id)}
                  aria-label="Remove header"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addHeader} className="gap-1">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Header
            </Button>
          </div>
        </TabsContent>

        {/* Auth Tab */}
        <TabsContent value="auth">
          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="auth-type">Authentication Type</Label>
              <Select
                value={authType}
                onValueChange={(v) => {
                  const newType = v as RestApiAuthType;
                  setAuthType(newType);
                  setAuthConfig({ type: newType });
                }}
              >
                <SelectTrigger className="w-full mt-1" id="auth-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="api-key">API Key</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* API Key fields */}
            {authType === 'api-key' && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="api-key-value">API Key</Label>
                  <Input
                    id="api-key-value"
                    type="password"
                    placeholder="Your API key"
                    value={authConfig.apiKey || ''}
                    onChange={(e) =>
                      setAuthConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="api-key-header">Header/Param Name</Label>
                  <Input
                    id="api-key-header"
                    placeholder="X-API-Key"
                    value={authConfig.apiKeyHeader || ''}
                    onChange={(e) =>
                      setAuthConfig((prev) => ({ ...prev, apiKeyHeader: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="api-key-location">Location</Label>
                  <Select
                    value={authConfig.apiKeyLocation || 'header'}
                    onValueChange={(v) =>
                      setAuthConfig((prev) => ({
                        ...prev,
                        apiKeyLocation: v as 'header' | 'query',
                      }))
                    }
                  >
                    <SelectTrigger className="w-full mt-1" id="api-key-location">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header">Header</SelectItem>
                      <SelectItem value="query">Query Parameter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Bearer Token fields */}
            {authType === 'bearer' && (
              <div>
                <Label htmlFor="bearer-token">Token</Label>
                <Input
                  id="bearer-token"
                  type="password"
                  placeholder="Bearer token"
                  value={authConfig.bearerToken || ''}
                  onChange={(e) =>
                    setAuthConfig((prev) => ({ ...prev, bearerToken: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            )}

            {/* Basic Auth fields */}
            {authType === 'basic' && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="basic-username">Username</Label>
                  <Input
                    id="basic-username"
                    placeholder="Username"
                    value={authConfig.basicUsername || ''}
                    onChange={(e) =>
                      setAuthConfig((prev) => ({ ...prev, basicUsername: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="basic-password">Password</Label>
                  <Input
                    id="basic-password"
                    type="password"
                    placeholder="Password"
                    value={authConfig.basicPassword || ''}
                    onChange={(e) =>
                      setAuthConfig((prev) => ({ ...prev, basicPassword: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* OAuth2 fields */}
            {authType === 'oauth2' && (
              <div>
                <Label htmlFor="oauth2-token">Access Token</Label>
                <Input
                  id="oauth2-token"
                  type="password"
                  placeholder="OAuth 2.0 access token"
                  value={authConfig.oauth2Token || ''}
                  onChange={(e) =>
                    setAuthConfig((prev) => ({ ...prev, oauth2Token: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            )}
          </div>
        </TabsContent>

        {/* Body Tab (POST only) */}
        {method === 'POST' && (
          <TabsContent value="body">
            <div className="pt-2">
              <Label htmlFor="request-body">Request Body (JSON)</Label>
              <Textarea
                id="request-body"
                placeholder='{"query": "...", "filters": {}}'
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1 font-mono text-xs min-h-24"
              />
            </div>
          </TabsContent>
        )}

        {/* Data Path Tab */}
        <TabsContent value="data-path">
          <div className="pt-2">
            <Label htmlFor="data-path-input">JSONPath / Data Path</Label>
            <Input
              id="data-path-input"
              placeholder="data.results or $.data.items"
              value={responseDataPath}
              onChange={(e) => setResponseDataPath(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Path to the data array in the response. Use dot-notation (data.results)
              or JSONPath ($.data.items). Leave empty for top-level arrays.
            </p>
          </div>
        </TabsContent>

        {/* Pagination Tab */}
        <TabsContent value="pagination">
          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="pagination-type">Pagination Type</Label>
              <Select
                value={paginationType}
                onValueChange={(v) => {
                  const newType = v as PaginationType;
                  setPaginationType(newType);
                  setPaginationConfig({ type: newType });
                }}
              >
                <SelectTrigger className="w-full mt-1" id="pagination-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="offset">Offset / Limit</SelectItem>
                  <SelectItem value="cursor">Cursor-based</SelectItem>
                  <SelectItem value="next-link">Next Link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Offset pagination fields */}
            {paginationType === 'offset' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="offset-param">Offset Param</Label>
                    <Input
                      id="offset-param"
                      placeholder="offset"
                      value={paginationConfig.pageParam || ''}
                      onChange={(e) =>
                        setPaginationConfig((prev) => ({ ...prev, pageParam: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="limit-param">Limit Param</Label>
                    <Input
                      id="limit-param"
                      placeholder="limit"
                      value={paginationConfig.limitParam || ''}
                      onChange={(e) =>
                        setPaginationConfig((prev) => ({ ...prev, limitParam: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="page-size">Page Size</Label>
                  <Input
                    id="page-size"
                    type="number"
                    placeholder="100"
                    value={paginationConfig.pageSize || ''}
                    onChange={(e) =>
                      setPaginationConfig((prev) => ({
                        ...prev,
                        pageSize: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Cursor pagination fields */}
            {paginationType === 'cursor' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="cursor-param">Cursor Param</Label>
                    <Input
                      id="cursor-param"
                      placeholder="cursor"
                      value={paginationConfig.pageParam || ''}
                      onChange={(e) =>
                        setPaginationConfig((prev) => ({ ...prev, pageParam: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cursor-field">Cursor Response Field</Label>
                    <Input
                      id="cursor-field"
                      placeholder="next_cursor"
                      value={paginationConfig.cursorField || ''}
                      onChange={(e) =>
                        setPaginationConfig((prev) => ({ ...prev, cursorField: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="cursor-limit-param">Limit Param</Label>
                    <Input
                      id="cursor-limit-param"
                      placeholder="limit"
                      value={paginationConfig.limitParam || ''}
                      onChange={(e) =>
                        setPaginationConfig((prev) => ({ ...prev, limitParam: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cursor-page-size">Page Size</Label>
                    <Input
                      id="cursor-page-size"
                      type="number"
                      placeholder="100"
                      value={paginationConfig.pageSize || ''}
                      onChange={(e) =>
                        setPaginationConfig((prev) => ({
                          ...prev,
                          pageSize: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Next-link pagination fields */}
            {paginationType === 'next-link' && (
              <div>
                <Label htmlFor="next-link-field">Next Link Field</Label>
                <Input
                  id="next-link-field"
                  placeholder="next or pagination.next_url"
                  value={paginationConfig.nextLinkField || ''}
                  onChange={(e) =>
                    setPaginationConfig((prev) => ({ ...prev, nextLinkField: e.target.value }))
                  }
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Dot-notation path to the next page URL in the response body.
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={handleTestConnection}
          disabled={!url.trim() || connectionStatus.type === 'testing'}
          className="gap-1.5"
        >
          {connectionStatus.type === 'testing' && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          Test Connection
        </Button>
        <Button
          onClick={handleFetchData}
          disabled={!url.trim() || isFetching}
          className="gap-1.5"
        >
          {isFetching && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          Fetch Data
        </Button>
      </div>

      {/* Connection Status */}
      {connectionStatus.type === 'success' && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/20 p-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
          <span className="text-sm text-green-700 dark:text-green-400">
            {connectionStatus.message}
            {connectionStatus.latencyMs != null && (
              <span className="text-xs ml-1 opacity-70">
                ({connectionStatus.latencyMs}ms)
              </span>
            )}
          </span>
        </div>
      )}
      {connectionStatus.type === 'error' && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
          <span className="text-sm text-destructive">{connectionStatus.message}</span>
        </div>
      )}

      {/* Fetch Error */}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
          <span className="text-sm text-destructive">{fetchError}</span>
        </div>
      )}

      {/* Data Preview */}
      {preview && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Table2 className="h-4 w-4" aria-hidden="true" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {preview.rowCount.toLocaleString()} rows •{' '}
                  {preview.fields.length} fields
                </span>
                <Button size="sm" onClick={handleImport} className="gap-1.5">
                  Import
                </Button>
              </div>

              {/* Field summary */}
              <div className="flex flex-wrap gap-1">
                {preview.fields.slice(0, 10).map((field) => (
                  <span
                    key={field.id}
                    className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
                  >
                    {field.name}
                    <span className="ml-1 text-muted-foreground">({field.type})</span>
                  </span>
                ))}
                {preview.fields.length > 10 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{preview.fields.length - 10} more
                  </span>
                )}
              </div>

              {/* Sample rows table */}
              {preview.rows.length > 0 && (
                <div className="overflow-x-auto rounded border max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {preview.fields.slice(0, 6).map((field) => (
                          <th
                            key={field.id}
                            className="px-2 py-1 text-left font-medium whitespace-nowrap"
                          >
                            {field.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t">
                          {preview.fields.slice(0, 6).map((field) => (
                            <td
                              key={field.id}
                              className="px-2 py-1 whitespace-nowrap max-w-32 truncate"
                            >
                              {row[field.name] != null ? String(row[field.name]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
