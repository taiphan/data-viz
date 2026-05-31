// ============================================================
// CONNECTOR TYPES — Data Source Connector Architecture
// ============================================================

export type ConnectorCategory =
  | 'cloud-warehouse'
  | 'database'
  | 'cloud-service'
  | 'file'
  | 'cloud-storage'
  | 'rest-api'
  | 'connectivity';

export type AuthMethod =
  | 'username-password'
  | 'oauth2'
  | 'api-key'
  | 'service-account'
  | 'iam-role'
  | 'none';

export type FormFieldType =
  | 'text'
  | 'password'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'textarea'
  | 'file'
  | 'oauth-button';

export interface FormFieldDefinition {
  id: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required: boolean;
  defaultValue?: string | number | boolean;
  options?: { label: string; value: string }[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  dependsOn?: { field: string; value: string | boolean };
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  icon: string;
  description: string;
  authMethods: AuthMethod[];
  fields: FormFieldDefinition[];
  defaultPort?: number;
  supportsSchemaDiscovery: boolean;
  supportsCustomQuery: boolean;
  proxyRequired: boolean;
}

// ============================================================
// CONNECTION LIFECYCLE
// ============================================================

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

export interface ConnectionSession {
  connectionId: string;
  connectorId: string;
  profileId?: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt: string;
  lastActivityAt: string;
}

// ============================================================
// SCHEMA DISCOVERY
// ============================================================

export interface SchemaInfo {
  schemas: SchemaNode[];
}

export interface SchemaNode {
  name: string;
  type: 'schema' | 'table' | 'view';
  children?: SchemaNode[];
  columns?: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
}

// ============================================================
// QUERY EXECUTION
// ============================================================

export interface QueryRequest {
  connectionId: string;
  sql: string;
  parameters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  fields: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  totalRows: number;
  executionTimeMs: number;
  truncated: boolean;
}

// ============================================================
// RETRY CONFIGURATION
// ============================================================

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface RetryState {
  attempt: number;
  lastError: string | null;
  nextRetryAt: number | null;
}

// ============================================================
// DATA SOURCE METADATA (extends existing DataSource)
// ============================================================

export interface DataSourceMeta {
  connectorId: string;
  connectionProfileId?: string;
  query?: string;
  tableName?: string;
  schemaName?: string;
  refreshedAt?: string;
}

// ============================================================
// CONNECTION PROFILES
// ============================================================

export interface ConnectionProfile {
  id: string;
  name: string;
  connectorId: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
}

// ============================================================
// CLOUD STORAGE
// ============================================================

export interface CloudStorageProvider {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
}

export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedAt: string;
  path: string;
}

// ============================================================
// FILE PARSE OPTIONS
// ============================================================

export interface FileParseOptions {
  delimiter?: string;
  quoteChar?: string;
  encoding?: string;
  sheetName?: string;
  headerRow?: number;
}

// ============================================================
// CONNECTOR ENGINE INTERFACE
// ============================================================

export interface ConnectorEngineInterface {
  testConnection(connectorId: string, params: Record<string, unknown>): Promise<ConnectionTestResult>;
  connect(connectorId: string, params: Record<string, unknown>): Promise<ConnectionSession>;
  disconnect(connectionId: string): Promise<void>;
  getSchema(connectionId: string): Promise<SchemaInfo>;
  executeQuery(request: QueryRequest): Promise<QueryResult>;
  previewTable(connectionId: string, schema: string, table: string, limit?: number): Promise<QueryResult>;
}
