# Data Viz — Project Architecture

## What This Is

A self-service analytics platform (open-source Tableau alternative) built as a Next.js 16 app with a separate Express.js proxy backend for database connectivity.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | shadcn/ui (base-nova style) + Radix/Base UI primitives |
| Styling | Tailwind CSS v4 (postcss plugin, no config file) |
| State | Zustand (single store with slices, persisted) |
| Charts | Recharts + D3-sankey |
| Validation | Zod |
| Testing | Vitest + fast-check (property-based) |
| Backend | Express.js proxy (separate project in `proxy/`) |
| Language | TypeScript 5 (strict mode) |

## Directory Structure

```
src/
├── app/                    # Next.js App Router (single page at /)
│   ├── layout.tsx          # Root layout with ThemeProvider
│   ├── page.tsx            # Main workspace page
│   └── globals.css         # Theme tokens (oklch), Tailwind imports
├── components/
│   ├── ui/                 # shadcn/ui primitives (button, card, dialog, etc.)
│   ├── data-viz/           # Application components
│   │   ├── charts/         # Chart-specific components (sankey)
│   │   ├── connectors/     # Connector UI (catalog, form, schema browser, query builder)
│   │   ├── flow-editor/    # ETL visual flow editor
│   │   ├── chart-canvas.tsx
│   │   ├── chart-renderer.tsx  # Renders all chart types via Recharts
│   │   ├── data-import.tsx     # File upload + landing page
│   │   ├── encoding-shelf.tsx  # X/Y/Color/Size encoding controls
│   │   ├── field-panel.tsx     # Left sidebar: dimensions/measures
│   │   ├── filter-panel.tsx    # Right sidebar: filters
│   │   ├── parameter-panel.tsx # Parameter controls
│   │   ├── sheet-tabs.tsx      # Bottom tab bar for sheets
│   │   └── workbook-manager.tsx
│   ├── admin/              # Admin panel views (performance, scheduler, explain)
│   ├── theme-provider.tsx  # next-themes wrapper
│   └── theme-switcher.tsx  # Theme dropdown (light/dark/high-contrast)
├── lib/
│   ├── store.ts            # Zustand store (WorkbookState + ConnectorState + ParameterState + VersioningState)
│   ├── types.ts            # Core types (DataSource, ChartConfig, Workbook, etc.)
│   ├── data-engine.ts      # CSV/JSON parsing, aggregation, filtering, joins, transforms
│   ├── parameter-actions.ts
│   ├── connectors/         # Connector architecture
│   │   ├── types.ts        # ConnectorDefinition, AuthMethod, FormField interfaces
│   │   ├── registry.ts     # 60+ connector definitions, search, grouping
│   │   ├── definitions/    # Connector defs by category
│   │   ├── form-schema.ts  # Dynamic Zod schema from field definitions
│   │   ├── connector-engine.ts  # Client-side engine (fetch to proxy)
│   │   ├── transform.ts    # QueryResult → DataSource conversion
│   │   ├── retry.ts        # Exponential backoff utility
│   │   ├── error-utils.ts  # Safe error formatting
│   │   ├── rest-api-connector.ts
│   │   ├── cloud-storage/  # OAuth flows for Drive/OneDrive/Dropbox
│   │   └── file-connectors/ # Excel, CSV, PDF, Parquet, statistical parsers
│   ├── charts/             # Chart data transformations (sankey)
│   ├── transforms/         # Groups, bins, percent-of-total
│   ├── flows/              # ETL flow engine (types, execution, persistence)
│   ├── ai/                 # Insights engine, color palette generator
│   ├── performance/        # Render tracking, dashboard timing, recommendations
│   └── workbook/           # Versioning, publishing, export (PDF/PNG/SVG), templates
proxy/
├── src/
│   ├── index.ts            # Express app setup (helmet, cors, routes)
│   ├── middleware/auth.ts  # JWT/token auth
│   ├── routes/             # API routes (connections, query, profiles, admin, extracts, flows, webhooks, deployments)
│   ├── services/           # Business logic (connection-manager, credential-vault, query-executor, scheduler, etc.)
│   ├── cli/                # Extract CLI tool
│   └── types/              # Express type extensions
```

## Application Flow

1. **Data Import**: User uploads file (CSV/JSON/Excel/PDF/Parquet) or connects via database connector
2. **Data Engine**: Parses file → creates `DataSource` with typed fields (dimensions/measures)
3. **Store**: Zustand persists workbook state (data sources, charts, sheets, filters)
4. **Visualization**: User assigns fields to encodings (X, Y, Color, Size) → `aggregateData()` processes → Recharts renders
5. **Dashboard**: Multiple charts per sheet, global filters, parameter actions for interactivity

## Key Patterns

- **Single Zustand store** with combined interfaces (WorkbookState + ConnectorState + ParameterState + VersioningState)
- **Path alias**: `@/` maps to `src/`
- **Component pattern**: shadcn/ui primitives composed into data-viz components
- **Connector architecture**: Plugin-based with `ConnectorDefinition` interface, registry pattern, proxy for DB access
- **File connectors**: Run entirely client-side (no proxy needed)
- **Database connectors**: Route through Express proxy (port 4000) for security
- **Theming**: CSS custom properties (oklch) with next-themes (system/light/dark/high-contrast)
- **Testing**: Vitest with fast-check for property-based tests, co-located test files (`*.test.ts`)

## Commands

```bash
# Frontend
npm run dev          # Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint

# Proxy
cd proxy && npm run build   # TypeScript compile
cd proxy && npm run dev     # Dev server (port 4000)

# Tests
npx vitest --run     # Run all tests once
```

## Important Notes

- shadcn/ui uses Base UI (not Radix) — `DropdownMenuTrigger` requires native `<button>` elements
- Tailwind v4 uses `@theme inline` blocks in CSS, no tailwind.config file
- The proxy requires Redis for BullMQ scheduler (optional for dev)
- All secrets via env vars, never hardcoded
- Charts support 14 types: bar, horizontal-bar, stacked-bar, line, area, pie, donut, scatter, bubble, heatmap, treemap, table, kpi, sankey
