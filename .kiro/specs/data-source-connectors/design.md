# Design Document: Data Source Connectors & Advanced Visualization

## Overview

This design introduces a plugin-based connector architecture and advanced visualization capabilities to the Data Viz application, inspired by Tableau's April 2026 release. The system is split into two execution contexts:

1. **Client-side connectors** — File parsers (Excel, PDF, text, statistical, Parquet), REST API connector, the connector registry UI, Sankey charts, groups/bins, percent-of-total, parameter actions, AI insights, and AI color palettes run entirely in the browser.
2. **Server-side Connector Proxy** — A lightweight Express.js API that securely holds credentials, establishes database/warehouse connections, executes queries, and streams results back to the client.

The architecture follows a declarative connector definition pattern where each connector is described by a JSON schema. The UI dynamically renders connection forms, schema browsers, and query builders based on these definitions.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Express.js proxy (not Next.js API routes) | DB drivers require persistent connections and pooling that don't fit serverless/edge functions. |
| Declarative connector definitions | Adding a new connector requires only a JSON definition file — no UI changes. Scales to 60+ connectors. |
| Client-side file parsing | Files contain no credentials and can be large. Processing in-browser avoids unnecessary network transfer. |
| Client-side AI insights (statistical) | No external AI API dependency for v1. Uses statistical analysis (mean, std dev, trend detection). |
| Sankey via D3-sankey + React wrapper | Recharts doesn't support Sankey natively. D3-sankey is the standard library for flow diagrams. |
| Parameter actions via Zustand pub/sub | Parameters are global state slices that charts subscribe to, enabling cross-chart interactivity. |
| HSL-based color palette generation | Deterministic, accessible color generation without external API. Uses HSL manipulation with contrast checking. |

---

## Architecture

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js Client)                          │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Connector   │  │   Dynamic    │  │   Schema     │  │   Query    │ │
│  │   Catalog    │  │  Form Render │  │   Browser    │  │  Builder   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                  │                  │                │        │
│  ┌──────┴──────────────────┴──────────────────┴────────────────┴──────┐ │
│  │                     Connector Engine                               │ │
│  └────────────────────────────┬───────────────────────────────────────┘ │
│                               │                                         │
│  ┌────────────┐  ┌────────────┴───────────┐  ┌────────────────────────┐│
│  │   File     │  │   REST API Connector   │  │  Cloud Storage OAuth   ││
│  │ Connectors │  │  (client-side fetch)   │  │  (Google/OneDrive/etc) ││
│  └────────────┘  └────────────────────────┘  └────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    Visualization Engine                              ││
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌────────────┐  ││
│  │  │ Sankey  │ │ Groups & │ │ % of   │ │Parameter │ │ AI Insights│  ││
│  │  │ Chart   │ │  Bins    │ │ Total  │ │ Actions  │ │ & Palettes │  ││
│  │  └─────────┘ └──────────┘ └────────┘ └──────────┘ └────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    Zustand Workbook Store                            ││
│  │  dataSources[] | sheets[] | parameters[] | profiles[] | transforms  ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                               │
                    HTTP/REST (fetch)
                               │
┌──────────────────────────────┴──────────────────────────────────────────┐
│                    Connector Proxy (Express.js)                          │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │    Auth      │  │  Connection  │  │    Query     │  │ Credential │ │
│  │  Middleware  │  │   Manager    │  │  Executor    │  │   Vault    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │
│                               │                                         │
└───────────────────────────────┼─────────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────┴─────┐  ┌──────┴──────┐  ┌──────┴──────┐
        │ PostgreSQL │  │  Snowflake  │  │   MySQL     │
        │  Oracle    │  │  Redshift   │  │   MSSQL     │
        │  MongoDB   │  │  BigQuery   │  │  ClickHouse │
        └───────────┘  └─────────────┘  └─────────────┘
```

### Request Flow

```
User → Select Connector → Fill Form → Test Connection
  → Proxy validates & connects → Returns schema
  → User browses schema → Selects table/writes SQL
  → Proxy executes query → Returns rows
  → Engine transforms to DataSource → Store updated
  → Charts render automatically
```

---

## Components and Interfaces

### 1. Connector Registry

```typescript
// src/lib/connectors/types.ts

export type ConnectorCategory =
  | 'cloud-warehouse'
  | 'database'
  | 'cloud-service'
  | 'file'
  | 'cloud-storage'
  | 'rest-api'
  | 'connectivity';

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
```

### 2. REST API Connector

```typescript
// src/lib/connectors/rest-api-connector.ts

export interface RestApiConfig {
  baseUrl: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  authType: 'none' | 'api-key' | 'bearer' | 'basic' | 'oauth2';
  authConfig: Record<string, string>;
  responseDataPath: string; // JSONPath to data array (e.g., "data.results")
  pagination: {
    type: 'none' | 'offset' | 'cursor' | 'next-link';
    pageParam?: string;
    limitParam?: string;
    cursorField?: string;
    nextLinkField?: string;
    pageSize?: number;
  };
}

export interface RestApiConnector {
  testConnection(config: RestApiConfig): Promise<ConnectionTestResult>;
  fetchData(config: RestApiConfig): Promise<QueryResult>;
  fetchPreview(config: RestApiConfig, limit: number): Promise<QueryResult>;
}
```

### 3. Sankey Chart

```typescript
// src/lib/charts/sankey.ts

export interface SankeyNode {
  id: string;
  name: string;
  value: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export function transformToSankey(
  rows: Record<string, unknown>[],
  sourceField: string,
  targetField: string,
  valueField: string,
  aggregation: AggregationType
): SankeyData;
```

### 4. Groups and Bins

```typescript
// src/lib/transforms/groups-bins.ts

export interface GroupDefinition {
  id: string;
  name: string; // New field name
  sourceField: string;
  groups: { name: string; values: string[] }[];
  otherGroupName: string; // Label for ungrouped values
}

export interface BinDefinition {
  id: string;
  name: string; // New field name
  sourceField: string;
  binSize: number;
  startAt?: number;
}

export function applyGroup(
  rows: Record<string, unknown>[],
  group: GroupDefinition
): Record<string, unknown>[];

export function applyBin(
  rows: Record<string, unknown>[],
  bin: BinDefinition
): Record<string, unknown>[];
```

### 5. Percent of Total

```typescript
// src/lib/transforms/percent-of-total.ts

export function computePercentOfTotal(
  rows: Record<string, unknown>[],
  valueField: string,
  groupByField: string | null
): Record<string, unknown>[];
// Adds a `${valueField}_pct` field to each row
```

### 6. Parameter Actions

```typescript
// src/lib/parameters/types.ts

export interface Parameter {
  id: string;
  name: string;
  dataType: 'string' | 'number' | 'date';
  defaultValue: string | number;
  currentValue: string | number;
  allowedValues?: string[] | { min: number; max: number };
  inputType: 'text' | 'dropdown' | 'slider';
}

export interface ParameterAction {
  id: string;
  chartId: string;
  parameterId: string;
  sourceField: string; // Field whose value updates the parameter on click
  trigger: 'click' | 'hover';
}
```

### 7. AI Insights Engine (Client-Side Statistical)

```typescript
// src/lib/ai/insights-engine.ts

export interface Insight {
  id: string;
  type: 'trend' | 'outlier' | 'top-value' | 'bottom-value' | 'change' | 'distribution';
  title: string;
  description: string;
  confidence: number; // 0-1
  relatedField: string;
  relatedValue?: unknown;
}

export function generateInsights(
  rows: Record<string, unknown>[],
  fields: DataField[],
  chartConfig?: ChartConfig
): Insight[];

// Statistical methods used:
// - Linear regression for trend detection
// - Z-score for outlier detection (>2 std dev)
// - Percentage change for significant shifts
// - Distribution analysis (skewness, kurtosis)
```

### 8. AI Color Palette Generator

```typescript
// src/lib/ai/color-palette-generator.ts

export interface PaletteGeneratorConfig {
  description: string;
  count: number; // 5-10 colors
  ensureAccessibility: boolean; // WCAG AA contrast
}

export function generatePalette(config: PaletteGeneratorConfig): string[];

// Algorithm:
// 1. Parse description keywords → map to base hue ranges
// 2. Generate HSL colors with varied lightness/saturation
// 3. Check WCAG AA contrast ratios between adjacent colors
// 4. Adjust until all pairs meet 3:1 minimum contrast
```

### 9. Connector Proxy API

```typescript
// proxy/src/routes.ts

// POST /api/connections/test     — Test connectivity
// POST /api/connections          — Establish connection
// DELETE /api/connections/:id    — Close connection
// GET  /api/connections/:id/schema — Fetch schema tree
// POST /api/query                — Execute query
// GET  /api/query/:id/preview    — Preview table

// POST /api/profiles             — Save connection profile
// GET  /api/profiles             — List saved profiles
// PUT  /api/profiles/:id         — Update profile
// DELETE /api/profiles/:id       — Delete profile
```

---

## Data Models

### Extended Workbook (backward-compatible additions)

```typescript
export interface Workbook {
  // ... existing fields unchanged
  parameters: Parameter[];          // NEW: Dashboard parameters
  parameterActions: ParameterAction[]; // NEW: Click-to-update actions
  groups: GroupDefinition[];        // NEW: Custom groups
  bins: BinDefinition[];            // NEW: Custom bins
}

export interface DataSource {
  // ... existing fields unchanged
  sourceInfo?: DataSourceMeta;      // NEW: Connector provenance
}

export interface ChartConfig {
  // ... existing fields unchanged
  chartType: ChartType | 'sankey';  // Extended with sankey
}
```

### Connector Store Slice

```typescript
interface ConnectorState {
  profiles: ConnectionProfile[];
  activeConnectionId: string | null;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error';
  connectionError: string | null;
  schemaInfo: SchemaInfo | null;
  selectedTables: { schema: string; table: string }[];
}
```

### Parameter Store Slice

```typescript
interface ParameterState {
  parameters: Parameter[];
  parameterActions: ParameterAction[];
  addParameter: (param: Parameter) => void;
  updateParameterValue: (id: string, value: string | number) => void;
  removeParameter: (id: string) => void;
  addParameterAction: (action: ParameterAction) => void;
  removeParameterAction: (id: string) => void;
}
```

---

## Correctness Properties

### Property 1: Registry grouping invariant
For any set of connector definitions, grouping by category produces groups where every connector's category equals the group key, and total count equals total connectors.
**Validates: Requirements 1.1**

### Property 2: Catalog view model completeness
For any connector definition, the view model has non-empty name, icon, category, and description.
**Validates: Requirements 1.2**

### Property 3: Connector search correctness
For any connectors and non-empty query, filter returns only those whose name or category contains the query (case-insensitive).
**Validates: Requirements 1.3**

### Property 4: Form schema generation
For any ConnectorDefinition with non-empty fields, the Zod schema has one field per definition entry matching id, type, and required constraint.
**Validates: Requirements 1.5, 2.1**

### Property 5: Form validation correctness
For any field definitions with required fields, input missing a required field is rejected with error referencing that field.
**Validates: Requirements 2.2, 2.3**

### Property 6: Error message safety
For any error with connection parameters, the formatted message never contains credential values.
**Validates: Requirements 3.2, 17.4**

### Property 7: Schema tree completeness
For any SchemaInfo, the tree has every schema as root, every table under its parent, every column with correct name and dataType.
**Validates: Requirements 4.1, 4.2**

### Property 8: Schema search correctness
For any schema tree and query, filter returns only nodes whose name contains the query.
**Validates: Requirements 4.4**

### Property 9: Query result row limit
For any QueryResult where totalRows > 1,000,000, rows are truncated and truncated=true.
**Validates: Requirements 5.4**

### Property 10: Large import warning
For any QueryResult where totalRows > 5,000,000, warning is triggered without auto-import.
**Validates: Requirements 10.4**

### Property 11: Parameterized query safety
For any SQL and parameters (including SQL injection attempts), values are never interpolated into the SQL string.
**Validates: Requirements 5.6, 6.6**

### Property 12: Credential encryption round-trip
For any credential string, encrypt then decrypt with same key produces original.
**Validates: Requirements 6.2**

### Property 13: Malformed request rejection
For any invalid request body, proxy returns 400 with generic message, no internal details.
**Validates: Requirements 6.4**

### Property 14: Profile save/load round-trip
For any connection parameters, save as profile then load produces equal values.
**Validates: Requirements 7.3**

### Property 15: Delimited text parse round-trip
For any tabular data and delimiter config, serialize then parse produces equal data.
**Validates: Requirements 8.3**

### Property 16: QueryResult to DataSource transformation
For any valid QueryResult, transformation produces DataSource with correct types, roles, names, rowCount, and ISO timestamp.
**Validates: Requirements 10.1, 10.2, 10.5**

### Property 17: Exponential backoff delay
For any retry config, delay for attempt n = min(base * multiplier^n, maxDelay), no retry after maxAttempts.
**Validates: Requirements 17.1**

### Property 18: Sankey data transformation
For any rows with source, target, and value fields, transformation produces nodes containing all unique source/target values and links with correct aggregated values.
**Validates: Requirements 11.2**

### Property 19: Group application correctness
For any GroupDefinition and rows, applying the group maps every value to its group name, and unmapped values to otherGroupName.
**Validates: Requirements 12.3**

### Property 20: Bin application correctness
For any BinDefinition with binSize > 0 and numeric values, applying bins assigns each value to the correct range label.
**Validates: Requirements 12.4**

### Property 21: Percent of total correctness
For any set of numeric values, percent-of-total produces values that sum to 100 (±0.01 floating point tolerance).
**Validates: Requirements 13.2**

### Property 22: Parameter action propagation
For any parameter update, all charts referencing that parameter in filters receive the new value.
**Validates: Requirements 14.3**

### Property 23: Color palette accessibility
For any generated palette with ensureAccessibility=true, all adjacent color pairs meet WCAG AA 3:1 contrast ratio.
**Validates: Requirements 16.2**

### Property 24: REST API pagination completeness
For any paginated API response with known total, the connector fetches all pages until total is reached or max rows exceeded.
**Validates: Requirements 9.3**

---

## Error Handling

| Error Type | Strategy | User Message |
|-----------|----------|--------------|
| Network unreachable | Retry 3x with backoff | "Unable to reach the server." |
| Proxy unavailable | Show banner | "Backend service unavailable." |
| Auth failure | Inline error, no retry | "Authentication failed." |
| Connection timeout (30s) | Abort | "Connection timed out." |
| Query timeout (120s) | Abort | "Query exceeded time limit." |
| Query error | Show DB message | Sanitized error from source |
| Invalid form input | Field-level validation | Per-field errors |
| File parse error | Show error | "Unable to parse file." |
| Row limit exceeded | Warning + sample | "Result exceeds 1M rows." |
| Large import (>5M) | Warning + confirm | "Large dataset may affect performance." |
| REST API error | Show status + body | "API returned error: {status}" |

### Retry Logic

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < config.maxAttempts - 1) {
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError!;
}
```

---

## Testing Strategy

### Property-Based Tests (fast-check + Vitest)
- All 24 correctness properties implemented as property tests
- Minimum 100 iterations per property
- Pure functions tested: registry, search, schema tree, transforms, aggregations

### Unit Tests
- Connector definitions schema validation (all 60+ connectors)
- Sankey data transformation edge cases
- Group/Bin application with edge values
- Percent-of-total with zero sums
- Color palette contrast checking
- Insight generation statistical methods
- REST API pagination state machine

### Integration Tests
- Proxy API with test PostgreSQL (Docker)
- Full connection flow end-to-end
- Parameter action propagation across charts
- File connector parsing (Excel, CSV, PDF)

### E2E Tests (Playwright)
- Connector dialog full flow
- REST API connector configuration
- Sankey chart creation
- Group/Bin creation from field panel
- Parameter action setup and interaction
