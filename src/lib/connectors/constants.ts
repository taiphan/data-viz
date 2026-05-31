import { ConnectorCategory, RetryConfig } from './types';

export const CONNECTOR_CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  'cloud-warehouse': 'Cloud Data Warehouses',
  'database': 'Databases',
  'cloud-service': 'Cloud Services',
  'file': 'Files',
  'cloud-storage': 'Cloud Storage',
  'rest-api': 'REST APIs',
  'connectivity': 'Connectivity Protocols',
};

export const CONNECTOR_CATEGORY_ORDER: ConnectorCategory[] = [
  'cloud-warehouse',
  'database',
  'cloud-service',
  'file',
  'cloud-storage',
  'rest-api',
  'connectivity',
];

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

export const CONNECTION_TIMEOUT_MS = 30000;
export const QUERY_TIMEOUT_MS = 120000;
export const IDLE_TIMEOUT_MS = 600000; // 10 minutes
export const MAX_RESULT_ROWS = 1_000_000;
export const LARGE_IMPORT_THRESHOLD = 5_000_000;
export const PREVIEW_ROW_LIMIT = 100;
export const MAX_POOL_SIZE = 10;
