# Implementation Plan: Data Source Connectors & Advanced Visualization

## Overview

This plan implements a plugin-based data source connector architecture and Tableau 2026-inspired visualization features, plus enterprise-grade capabilities for data extract scheduling, ETL/data prep flows, performance monitoring, SQL optimization, admin panel, and workbook lifecycle management. Tasks are ordered to build foundational types first, then layer services, UI, and advanced features incrementally.

## Tasks

- [x] 1. Core types, registry, and utilities
  - [x] 1.1 Create connector type definitions and interfaces
    - Create `src/lib/connectors/types.ts` with all interfaces: ConnectorCategory (including 'rest-api'), AuthMethod, FormFieldType, FormFieldDefinition, ConnectorDefinition, ConnectionTestResult, ConnectionSession, SchemaInfo, SchemaNode, ColumnInfo, QueryRequest, QueryResult, RetryConfig, DataSourceMeta, ConnectionProfile, CloudStorageProvider, CloudFile, FileParseOptions, ConnectorEngineInterface
    - Create `src/lib/connectors/constants.ts` with category labels, default configs, timeouts, row limits
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 1.2 Implement connector registry with 60+ definitions
    - Create `src/lib/connectors/registry.ts` with: getConnectorsByCategory(), searchConnectors(query), getConnectorById(id), getAllConnectors()
    - Create definitions in `src/lib/connectors/definitions/` organized by category: cloud-warehouses.ts, databases.ts, cloud-services.ts, files.ts, cloud-storage.ts, rest-api.ts, connectivity.ts
    - Each definition conforms to ConnectorDefinition with id, name, category, icon, description, authMethods, fields, defaultPort, supportsSchemaDiscovery, supportsCustomQuery, proxyRequired
    - Include all connectors from Req 1.4 plus Amazon S3, Google Looker, REST API
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.3 Implement dynamic Zod schema generation from field definitions
    - Create `src/lib/connectors/form-schema.ts` with generateFormSchema(fields) producing Zod validation schema
    - Handle required/optional, type validation, conditional fields (dependsOn)
    - _Requirements: 1.5, 2.1, 2.2, 2.3_

  - [x] 1.4 Implement retry utility with exponential backoff
    - Create `src/lib/connectors/retry.ts` with withRetry<T>(operation, config) and computeDelay(attempt, config)
    - _Requirements: 17.1, 17.2_

  - [x] 1.5 Implement error formatting utility
    - Create `src/lib/connectors/error-utils.ts` with formatConnectionError() that never exposes credentials
    - _Requirements: 3.2, 17.3, 17.4, 17.5_

  - [x]* 1.6 Write property tests for registry, form schema, retry, and error formatting
    - Property 1: Registry grouping invariant
    - Property 2: Catalog view model completeness
    - Property 3: Connector search correctness
    - Property 4: Form schema generation
    - Property 5: Form validation correctness
    - Property 6: Error message safety
    - Property 17: Exponential backoff delay
    - _Validates: Req 1.1-1.5, 2.1-2.3, 3.2, 17.1, 17.4_

- [x] 2. Connector Proxy backend service
  - [x] 2.1 Set up Express.js proxy project
    - Create `proxy/` with package.json, tsconfig.json, src/index.ts
    - Install: express, helmet, cors, zod, pg, mysql2, mssql, uuid, pino, dotenv
    - Set up middleware: helmet, cors, JSON, request ID, auth
    - _Requirements: 6.1, 6.3, 6.4_

  - [x] 2.2 Implement credential vault (AES-256-GCM)
    - Create `proxy/src/services/credential-vault.ts` with encrypt/decrypt using Node.js crypto
    - _Requirements: 6.2, 7.2_

  - [x] 2.3 Implement connection manager with pooling
    - Create `proxy/src/services/connection-manager.ts` with pool lifecycle, max 10 connections, 10-min idle timeout
    - Support PostgreSQL, MySQL, MSSQL drivers
    - _Requirements: 6.5, 6.7, 3.5_

  - [x] 2.4 Implement query executor with timeout and parameterization
    - Create `proxy/src/services/query-executor.ts` with parameterized queries, 120s timeout, row limits
    - _Requirements: 5.2, 5.4, 5.6, 6.5, 6.6_

  - [x] 2.5 Implement proxy API routes
    - POST /api/connections/test, POST /api/connections, DELETE /api/connections/:id
    - GET /api/connections/:id/schema
    - POST /api/query, GET /api/query/:id/preview
    - POST/GET/PUT/DELETE /api/profiles
    - All routes validate with Zod schemas
    - _Requirements: 6.1, 6.3, 6.4, 7.1-7.5_

  - [x]* 2.6 Write property tests for proxy
    - Property 11: Parameterized query safety
    - Property 12: Credential encryption round-trip
    - Property 13: Malformed request rejection
    - _Validates: Req 5.6, 6.2, 6.4, 6.6_

- [x] 3. Client-side Connector Engine and store
  - [x] 3.1 Implement Connector Engine client service
    - Create `src/lib/connectors/connector-engine.ts` implementing ConnectorEngineInterface
    - Use fetch to communicate with proxy, integrate retry logic
    - Handle connection status transitions
    - _Requirements: 3.1-3.4, 5.2, 5.3, 10.1, 17.1-17.3_

  - [x] 3.2 Implement QueryResult to DataSource transformation
    - Create `src/lib/connectors/transform.ts` with queryResultToDataSource()
    - Detect types, assign roles, preserve names, enforce row limits, warn at 5M
    - _Requirements: 10.1-10.5_

  - [x] 3.3 Extend Zustand store with connector and parameter state
    - Add ConnectorState slice: profiles, activeConnectionId, connectionStatus, schemaInfo
    - Add ParameterState slice: parameters[], parameterActions[], CRUD actions
    - Extend DataSource with optional sourceInfo
    - Extend Workbook with parameters, parameterActions, groups, bins
    - _Requirements: 7.1-7.5, 10.3, 14.1-14.5_

  - [x]* 3.4 Write property tests for transformation and profiles
    - Property 9: Query result row limit
    - Property 10: Large import warning
    - Property 14: Profile save/load round-trip
    - Property 16: QueryResult to DataSource transformation
    - _Validates: Req 5.4, 7.3, 10.1-10.5_

- [x] 4. File connectors (client-side)
  - [x] 4.1 Implement Excel connector (xlsx library)
    - Parse .xlsx/.xls, enumerate sheets, allow selection, convert to DataSource
    - _Requirements: 8.1, 8.2_

  - [x] 4.2 Implement delimited text connector (PapaParse)
    - Support .csv/.tsv/.txt with configurable delimiter, quote, encoding, header row
    - _Requirements: 8.1, 8.3_

  - [x] 4.3 Implement PDF connector
    - Extract tabular data from PDF tables, convert to DataSource
    - _Requirements: 8.1, 8.4_

  - [x] 4.4 Implement statistical file connector
    - Support .sav (SPSS), .dta (Stata), .sas7bdat (SAS)
    - _Requirements: 8.1, 8.5_

  - [x] 4.5 Implement Parquet file connector
    - Support .parquet columnar format for S3 and local uploads
    - _Requirements: 8.8_

  - [x] 4.6 Create unified file connector facade
    - Route to appropriate parser based on extension/MIME type
    - _Requirements: 8.1_

  - [x]* 4.7 Write property test for delimited text round-trip
    - Property 15: Delimited text parse round-trip
    - _Validates: Req 8.3_

- [x] 5. REST API Connector
  - [x] 5.1 Implement REST API connector
    - Create `src/lib/connectors/rest-api-connector.ts`
    - Support GET/POST, headers, auth (API key, Bearer, Basic, OAuth2)
    - JSONPath extraction for nested responses
    - Pagination: offset, cursor, next-link
    - Transform response to DataSource format
    - _Requirements: 9.1-9.5_

  - [x]* 5.2 Write property test for REST API pagination
    - Property 24: Pagination completeness
    - _Validates: Req 9.3_

- [x] 6. Cloud Storage OAuth connectors
  - [x] 6.1 Implement OAuth popup flow
    - Create `src/lib/connectors/cloud-storage/oauth.ts`
    - Support Google Drive, OneDrive, Dropbox, Box, Amazon S3
    - _Requirements: 2.5, 8.6_

  - [x] 6.2 Implement cloud storage file browser and download
    - Authenticate, list files, download, route to file connector parser
    - _Requirements: 8.6, 8.7_

- [x] 7. Sankey Chart
  - [x] 7.1 Implement Sankey data transformation
    - Create `src/lib/charts/sankey.ts` with transformToSankey()
    - Aggregate values by source-target pairs, produce nodes[] and links[]
    - _Requirements: 11.1, 11.2_

  - [x] 7.2 Implement Sankey chart React component
    - Create `src/components/data-viz/charts/sankey-chart.tsx` using D3-sankey + SVG
    - Support hover tooltips, color palette, up to 20 nodes / 50 links
    - _Requirements: 11.1-11.5_

  - [x]* 7.3 Write property test for Sankey transformation
    - Property 18: Sankey data transformation correctness
    - _Validates: Req 11.2_

- [x] 8. Groups and Bins
  - [x] 8.1 Implement Groups transform
    - Create `src/lib/transforms/groups-bins.ts` with applyGroup()
    - Map values to group names, ungrouped to otherGroupName
    - _Requirements: 12.1, 12.3_

  - [x] 8.2 Implement Bins transform
    - Add applyBin() — segment continuous values into equal-sized ranges
    - Configurable bin size, generate labels like "0-10", "10-20"
    - _Requirements: 12.2, 12.4_

  - [x] 8.3 Integrate Groups/Bins into field panel and chart encoding
    - Add right-click context menu on fields for "Create Group" / "Create Bin"
    - Virtual fields usable in all encodings
    - _Requirements: 12.5_

  - [x]* 8.4 Write property tests for Groups and Bins
    - Property 19: Group application correctness
    - Property 20: Bin application correctness
    - _Validates: Req 12.3, 12.4_

- [x] 9. Percent of Total
  - [x] 9.1 Implement percent-of-total calculation
    - Create `src/lib/transforms/percent-of-total.ts` with computePercentOfTotal()
    - Add "% of Total" to aggregation options
    - _Requirements: 13.1, 13.2_

  - [x] 9.2 Integrate into chart renderer
    - Support in bar, pie, donut, stacked bar, table
    - Tooltip shows both percentage and absolute value
    - _Requirements: 13.3, 13.4_

  - [x]* 9.3 Write property test for percent of total
    - Property 21: Values sum to 100 (±0.01)
    - _Validates: Req 13.2_

- [x] 10. Parameter Actions
  - [x] 10.1 Implement parameter store and actions
    - Add Parameter and ParameterAction types to store
    - CRUD operations, value updates, input widgets (text, dropdown, slider)
    - _Requirements: 14.1, 14.5_

  - [x] 10.2 Implement parameter action on chart click
    - When mark is clicked, update parameter value to clicked dimension value
    - Other charts with parameter-based filters auto-update
    - _Requirements: 14.2, 14.3_

  - [x] 10.3 Create parameter panel UI
    - Display active parameters with current values, allow manual editing
    - _Requirements: 14.4, 14.5_

  - [x]* 10.4 Write property test for parameter propagation
    - Property 22: Parameter action propagation
    - _Validates: Req 14.3_

- [x] 11. AI-Assisted Features
  - [x] 11.1 Implement statistical insights engine
    - Create `src/lib/ai/insights-engine.ts`
    - Detect: top/bottom values, outliers (>2 std dev), trend direction, significant changes
    - Generate natural language descriptions
    - _Requirements: 15.1, 15.2, 15.4_

  - [x] 11.2 Implement AI color palette generator
    - Create `src/lib/ai/color-palette-generator.ts`
    - Parse description keywords → HSL base hues → generate colors → check WCAG AA contrast
    - _Requirements: 16.1, 16.2, 16.4_

  - [x] 11.3 Create insights card UI component
    - Displayable text card on dashboard, regenerable on data change
    - _Requirements: 15.3, 15.5_

  - [x] 11.4 Create palette generator UI
    - Text input, preview swatches, save as custom palette
    - _Requirements: 16.1, 16.3_

  - [x]* 11.5 Write property test for color palette accessibility
    - Property 23: Adjacent colors meet WCAG AA 3:1 contrast
    - _Validates: Req 16.2_

- [x] 12. UI Components — Connectors
  - [x] 12.1 Create Connector Catalog dialog
    - Grid of connectors grouped by category, search input, icons
    - _Requirements: 1.1-1.5_

  - [x] 12.2 Create Dynamic Connection Form
    - Render fields from ConnectorDefinition, Zod validation, password masking, OAuth button
    - Test Connection + Connect buttons with loading states
    - _Requirements: 2.1-2.6, 3.1, 3.4_

  - [x] 12.3 Create Schema Browser
    - Tree view of schemas/tables/columns, search, data preview, Import/Custom Query actions
    - _Requirements: 4.1-4.5_

  - [x] 12.4 Create Query Builder
    - SQL editor with syntax highlighting, execute button, result preview, error display
    - _Requirements: 5.1-5.6_

  - [x] 12.5 Create REST API Connector form
    - URL, method, headers, auth config, JSONPath, pagination settings, preview
    - _Requirements: 9.1-9.5_

  - [x] 12.6 Create Connection Profile Manager
    - List saved profiles, rename/duplicate/delete, pre-populate form on select
    - _Requirements: 7.1-7.5_

  - [x]* 12.7 Write property tests for schema tree and search
    - Property 7: Schema tree completeness
    - Property 8: Schema search correctness
    - _Validates: Req 4.1, 4.2, 4.4_

- [x] 13. Integration and wiring
  - [x] 13.1 Wire connector dialog into toolbar
    - Add "Connect to Data" button, open catalog, wire full flow through to DataSource import
    - _Requirements: 1.5, 3.3, 10.3_

  - [x] 13.2 Wire file connectors into data import
    - Extend data-import.tsx with file type selection and parsing options
    - _Requirements: 8.1-8.8_

  - [x] 13.3 Wire Sankey chart into chart type selector
    - Add Sankey to chart type icons, integrate renderer
    - _Requirements: 11.1_

  - [x] 13.4 Wire Groups/Bins into field panel context menu
    - Right-click actions, dialog for configuration, virtual field creation
    - _Requirements: 12.1, 12.2, 12.5_

  - [x] 13.5 Wire Parameter panel into dashboard
    - Parameter sidebar/panel, action configuration on charts
    - _Requirements: 14.1-14.5_

  - [x] 13.6 Wire AI features into toolbar
    - "Generate Insights" button on charts, palette generator in color picker
    - _Requirements: 15.1, 15.5, 16.1, 16.3_

- [x] 14. Final verification (core features)
  - [x] 14.1 Run full build and fix any TypeScript errors
  - [x] 14.2 Verify all chart types render correctly with sample data
  - [x] 14.3 Verify connector catalog displays all 60+ connectors
  - [x] 14.4 Verify file import works for CSV, JSON, Excel

- [x] 15. Data Extract Scheduling & Automation
  - [x] 15.1 Implement BullMQ-based scheduler service in the proxy
    - Create `proxy/src/services/scheduler.ts` with BullMQ queue and worker setup
    - Install bullmq and ioredis dependencies in proxy
    - Define job types: extract-refresh, scheduled-query, webhook-trigger
    - Implement job lifecycle: add, pause, resume, remove, retry
    - Configure Redis connection with environment variables (no hardcoded secrets)
    - _Requirements: Optimize data extracts, schedule refresh_

  - [x] 15.2 Implement extract management API
    - Create `proxy/src/routes/extracts.ts` with CRUD endpoints
    - POST /api/extracts — create extract definition (connection, query, destination)
    - PUT /api/extracts/:id/schedule — set cron schedule (validate cron expression with Zod)
    - POST /api/extracts/:id/test — run extract immediately and return preview
    - GET /api/extracts/:id/status — get last run status, next scheduled run, history
    - GET /api/extracts — list all extracts with pagination
    - DELETE /api/extracts/:id — remove extract and cancel scheduled jobs
    - _Requirements: Optimize data extracts, schedule refresh_

  - [x] 15.3 Implement trigger-based automation (webhook triggers)
    - Create `proxy/src/routes/webhooks.ts` with POST /api/webhooks/trigger/:extractId
    - Validate webhook secret token (HMAC-SHA256 signature verification)
    - Queue extract refresh job on valid trigger
    - Support configurable payload filters (only trigger on matching conditions)
    - _Requirements: Trigger-based automation_

  - [x] 15.4 Create extract CLI scripts
    - Create `proxy/src/cli/extract-cli.ts` with commands: list, run, schedule, status, cancel
    - Use commander.js for CLI argument parsing
    - Connect to proxy API for execution (reuse API routes)
    - _Requirements: Automate extract refresh_

  - [x] 15.5 Create Admin UI for scheduled jobs
    - Create `src/components/admin/extract-scheduler.tsx`
    - Display job queue: pending, active, completed, failed jobs with timestamps
    - Allow creating/editing cron schedules via UI (cron expression builder)
    - Show extract run history with duration, row count, success/failure
    - Provide pause/resume/retry controls per job
    - _Requirements: Schedule refresh, trigger-based automation_

  - [x]* 15.6 Write unit tests for scheduler service
    - Test cron schedule validation
    - Test job lifecycle state transitions
    - Test webhook HMAC signature verification
    - _Validates: Schedule refresh, trigger-based automation_

- [x] 16. ETL / Data Prep Flows (Tableau Prep-like)
  - [x] 16.1 Implement flow step types and interfaces
    - Create `src/lib/flows/types.ts` with FlowDefinition, FlowStep, StepType
    - Define step types: input, clean (filter/rename/cast), join, aggregate, pivot, union, output
    - Each step has typed config: InputStepConfig, CleanStepConfig, JoinStepConfig, AggregateStepConfig, PivotStepConfig, UnionStepConfig, OutputStepConfig
    - _Requirements: Data cleansing, blending, aggregation_

  - [x] 16.2 Implement flow execution engine
    - Create `src/lib/flows/flow-engine.ts` with executeFlow(definition, dataSources)
    - Process steps sequentially, passing output of each step as input to next
    - Input step: load data from connector/file/existing DataSource
    - Clean step: apply filter predicates, rename columns, cast types
    - Join step: merge two datasets on key fields (inner, left, right, full)
    - Aggregate step: group by dimensions, apply aggregations (SUM, AVG, COUNT, MIN, MAX)
    - Pivot step: reshape rows to columns or columns to rows
    - Union step: stack multiple datasets vertically (matching columns)
    - Output step: write result to DataSource in workbook store
    - _Requirements: Data cleansing, blending, aggregation, Tableau Prep Flows_

  - [x] 16.3 Implement visual flow editor component
    - Create `src/components/data-viz/flow-editor/flow-canvas.tsx`
    - Render steps as connected nodes on a canvas (React Flow or custom SVG)
    - Support drag-and-drop to add steps, connect steps with edges
    - Each step node shows step type icon, name, and row count preview
    - Double-click step to open configuration panel
    - _Requirements: Tableau Prep Flows_

  - [x] 16.4 Implement flow save/load/schedule
    - Create `src/lib/flows/flow-persistence.ts` with saveFlow(), loadFlow(), listFlows()
    - Store flow definitions as JSON in workbook or proxy (POST /api/flows)
    - Integrate with scheduler (task 15) to allow scheduling flow execution
    - _Requirements: Tableau Prep Flows_

  - [x]* 16.5 Write unit tests for flow execution engine
    - Test each step type in isolation (clean, join, aggregate, pivot, union)
    - Test sequential multi-step flow execution
    - Test error handling for invalid step configurations
    - _Validates: Data cleansing, blending, aggregation_

- [x] 17. Dashboard Performance Monitoring
  - [x] 17.1 Implement render timing instrumentation
    - Create `src/lib/performance/render-tracker.ts`
    - Wrap chart render lifecycle with performance.mark/measure
    - Track: time-to-first-paint, time-to-interactive, total render duration per chart
    - Store metrics in a PerformanceMetricsStore (Zustand slice)
    - _Requirements: Monitor and enhance performance_

  - [x] 17.2 Implement query execution profiling
    - Create `proxy/src/services/query-profiler.ts`
    - Capture per-query metrics: execution time, rows returned, bytes transferred
    - Store query history with metrics in proxy (in-memory ring buffer, max 1000 entries)
    - Expose GET /api/admin/query-history with pagination and filters
    - _Requirements: Monitor and enhance performance_

  - [x] 17.3 Implement dashboard load time tracking
    - Create `src/lib/performance/dashboard-tracker.ts`
    - Track full dashboard load: time from navigation to all charts rendered
    - Track individual chart contribution to total load time
    - Emit performance events for monitoring
    - _Requirements: Rapid load times_

  - [x] 17.4 Implement performance recommendations engine
    - Create `src/lib/performance/recommendations.ts`
    - Analyze metrics and suggest optimizations:
      - Charts taking >2s to render → suggest data aggregation or sampling
      - Queries scanning >100K rows → suggest adding filters or indexes
      - Dashboard load >5s → suggest lazy loading or extract caching
    - Return typed Recommendation[] with severity, description, and action
    - _Requirements: Monitor and enhance performance_

  - [x] 17.5 Create admin performance dashboard view
    - Create `src/components/admin/performance-dashboard.tsx`
    - Display: slow queries table (sortable by duration), heavy dashboards list
    - Show render time distribution chart, query time histogram
    - Display active recommendations with actionable suggestions
    - _Requirements: Monitor and enhance performance, rapid load times_

  - [x]* 17.6 Write unit tests for performance tracking
    - Test render timing calculation accuracy
    - Test recommendation engine threshold logic
    - Test query profiler metric aggregation
    - _Validates: Monitor and enhance performance_

- [x] 18. SQL Query Optimization & Profiling
  - [x] 18.1 Implement EXPLAIN plan viewer
    - Create `proxy/src/services/explain-service.ts`
    - Execute EXPLAIN (ANALYZE) for PostgreSQL, EXPLAIN for MySQL/MSSQL
    - Parse plan output into structured ExplainPlan interface (nodes, costs, rows)
    - Expose POST /api/query/explain endpoint
    - _Requirements: Fine tune SQL queries_

  - [x] 18.2 Implement query execution statistics
    - Extend query executor to capture: execution time, rows scanned, rows returned, index usage
    - Create `proxy/src/services/query-stats.ts` with QueryExecutionStats interface
    - Store stats per query execution, expose via GET /api/admin/query-stats
    - _Requirements: Maximum efficiency_

  - [x] 18.3 Implement query optimization suggestions
    - Create `proxy/src/services/query-optimizer.ts`
    - Analyze EXPLAIN plans and suggest: missing indexes, full table scans, inefficient joins
    - Detect common anti-patterns: SELECT *, unnecessary subqueries, missing WHERE clauses
    - Return typed QueryOptimization[] with severity, description, suggested fix
    - _Requirements: Fine tune SQL queries, maximum efficiency_

  - [x] 18.4 Implement query history with performance metrics
    - Create `proxy/src/services/query-history.ts`
    - Store last 500 queries per user with: SQL, execution time, rows, timestamp, connection
    - Expose GET /api/admin/query-history with search, sort, and filter
    - Highlight slow queries (>5s) and failed queries
    - _Requirements: Fine tune SQL queries_

  - [x] 18.5 Create EXPLAIN plan viewer UI
    - Create `src/components/admin/explain-viewer.tsx`
    - Render EXPLAIN plan as tree/table with cost, rows, and time per node
    - Highlight expensive operations (sequential scans, nested loops)
    - Show optimization suggestions inline
    - Integrate into Query Builder (task 12.4) as "Explain" button
    - _Requirements: Fine tune SQL queries, maximum efficiency_

  - [x]* 18.6 Write unit tests for query optimization
    - Test EXPLAIN plan parsing for PostgreSQL and MySQL formats
    - Test optimization suggestion detection (missing index, full scan)
    - Test query history storage and retrieval
    - _Validates: Fine tune SQL queries_

- [x] 19. Admin Panel & Server Management
  - [x] 19.1 Implement admin dashboard API routes
    - Create `proxy/src/routes/admin.ts`
    - GET /api/admin/status — proxy health (uptime, memory, CPU, version)
    - GET /api/admin/connections — active connection pool status per user
    - GET /api/admin/sessions — active user sessions with resource usage
    - GET /api/admin/queues — BullMQ queue depth, active/waiting/failed counts
    - All admin routes require admin role authentication
    - _Requirements: Server administration_

  - [x] 19.2 Implement user session management
    - Create `proxy/src/services/session-manager.ts`
    - Track active connections per user, resource usage (queries/min, data transferred)
    - Support force-disconnect for runaway sessions
    - Expose session metrics via admin API
    - _Requirements: Server administration_

  - [x] 19.3 Implement content deployment API
    - Create `proxy/src/routes/deployments.ts`
    - POST /api/deployments/export — export workbook as JSON bundle (charts, data sources, flows)
    - POST /api/deployments/import — import workbook JSON bundle into workspace
    - Support versioned exports with metadata (author, timestamp, description)
    - Validate import schema with Zod before applying
    - _Requirements: Content deployments_

  - [x] 19.4 Implement health monitoring service
    - Create `proxy/src/services/health-monitor.ts`
    - Track: proxy uptime, connection pool utilization, queue depth, error rates
    - Expose GET /api/admin/health with structured health check response
    - Support Prometheus-compatible metrics endpoint (GET /metrics)
    - _Requirements: Server administration_

  - [x] 19.5 Create admin panel UI
    - Create `src/components/admin/admin-panel.tsx`
    - Dashboard view: proxy health card, connection pool gauge, queue status
    - Sessions tab: active users, connections, resource usage, force-disconnect button
    - Deployments tab: export/import workbooks, deployment history
    - Use shadcn/ui components (Card, Table, Badge, Button)
    - _Requirements: Server administration, content deployments_

  - [x]* 19.6 Write unit tests for admin services
    - Test session tracking and resource accounting
    - Test health check response structure
    - Test deployment export/import round-trip (JSON schema validation)
    - _Validates: Server administration, content deployments_

- [x] 20. Workbook Lifecycle Management
  - [x] 20.1 Implement workbook versioning
    - Create `src/lib/workbook/versioning.ts`
    - Save workbook snapshots with version number, timestamp, description
    - Store version history (max 50 versions per workbook) in Zustand store
    - Support rollback to any previous version
    - Diff utility: compare two versions and highlight changes
    - _Requirements: Manage lifecycle, prototyping, development_

  - [x] 20.2 Implement workbook publishing
    - Create `src/lib/workbook/publishing.ts`
    - Generate shareable URL with unique token (read-only embed)
    - Support embed mode: render dashboard without editor chrome
    - Create `src/components/data-viz/embed-viewer.tsx` for embedded view
    - _Requirements: Roll-out_

  - [x] 20.3 Implement export to PDF/PNG/SVG
    - Create `src/lib/workbook/export.ts`
    - PDF export: use html2canvas + jsPDF for full dashboard capture
    - PNG export: use html2canvas for individual charts or full dashboard
    - SVG export: serialize chart SVG elements directly
    - Support configurable resolution and page size for PDF
    - _Requirements: Manage lifecycle_

  - [x] 20.4 Implement workbook templates
    - Create `src/lib/workbook/templates.ts`
    - Save current workbook as template (strip data, keep structure and config)
    - Load template: create new workbook from template with placeholder data
    - Provide built-in templates: Sales Dashboard, Marketing Funnel, Financial Report
    - Store templates in `src/lib/workbook/built-in-templates/` as JSON
    - _Requirements: Prototyping, development_

  - [x] 20.5 Create workbook lifecycle UI
    - Create `src/components/data-viz/workbook-manager.tsx`
    - Version history panel: list versions, preview, rollback button
    - Publish dialog: generate URL, copy embed code, manage published links
    - Export menu: PDF/PNG/SVG options with settings
    - Template gallery: browse, preview, create from template
    - _Requirements: Manage lifecycle, prototyping, development, roll-out_

  - [x]* 20.6 Write unit tests for workbook lifecycle
    - Test version save/rollback correctness
    - Test template creation (data stripped, config preserved)
    - Test export configuration validation
    - _Validates: Manage lifecycle, prototyping_

- [x] 21. Checkpoint — Enterprise features verification
  - [x] 21.1 Ensure all tests pass, ask the user if questions arise.
  - [x] 21.2 Verify scheduler creates and executes jobs correctly
  - [x] 21.3 Verify flow editor renders and executes multi-step flows
  - [x] 21.4 Verify admin panel displays health metrics and sessions
  - [x] 21.5 Verify workbook versioning and export produce valid output

## Notes

- Tasks marked with `*` are property-based test tasks (optional for faster MVP)
- Each task references specific requirements for traceability
- The proxy service (`proxy/`) is a separate Express.js project within data-viz/
- File connectors run entirely in-browser; only database connectors use the proxy
- Sankey chart requires `d3-sankey` package (npm install d3-sankey @types/d3-sankey)
- AI features are client-side statistical analysis, no external API needed for v1
- All 24 correctness properties from the design are covered in test tasks
- Enterprise tasks (15-20) extend the proxy with BullMQ (Redis-backed job queue)
- Flow editor (task 16.3) may use React Flow library for node-based canvas
- Performance monitoring uses browser Performance API and proxy-side instrumentation
- Workbook export uses html2canvas + jsPDF (install as dependencies)
- Admin routes are protected by admin role — never expose to unauthenticated users

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5"] },
    { "id": 2, "tasks": ["1.6", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.3"] },
    { "id": 4, "tasks": ["2.5", "2.6", "3.1", "3.2"] },
    { "id": 5, "tasks": ["3.4", "4.1", "4.2", "4.3", "4.4", "4.5", "5.1"] },
    { "id": 6, "tasks": ["4.6", "4.7", "5.2", "6.1", "7.1", "8.1", "8.2", "9.1", "10.1", "11.1", "11.2"] },
    { "id": 7, "tasks": ["6.2", "7.2", "7.3", "8.3", "8.4", "9.2", "9.3", "10.2", "10.3", "10.4", "11.3", "11.4", "11.5"] },
    { "id": 8, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7"] },
    { "id": 9, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 10, "tasks": ["14.1", "14.2", "14.3", "14.4"] },
    { "id": 11, "tasks": ["15.1", "16.1", "17.1", "17.3", "18.1", "19.1", "20.1"] },
    { "id": 12, "tasks": ["15.2", "15.3", "16.2", "17.2", "17.4", "18.2", "18.3", "19.2", "19.3", "20.2", "20.3", "20.4"] },
    { "id": 13, "tasks": ["15.4", "15.5", "15.6", "16.3", "16.4", "17.5", "17.6", "18.4", "18.5", "18.6", "19.4", "19.5", "19.6", "20.5", "20.6"] },
    { "id": 14, "tasks": ["16.5", "21.1", "21.2", "21.3", "21.4", "21.5"] }
  ]
}
```
