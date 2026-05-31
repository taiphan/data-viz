# Changelog — Data Viz

## v1.0.0 (2026-05-31)

### Features
- Self-service analytics platform with drag-and-drop chart building
- 14 chart types: bar, line, area, pie, donut, scatter, bubble, heatmap, treemap, table, KPI, sankey, horizontal-bar, stacked-bar
- Multi-source data import (CSV, JSON, Excel, PDF, Parquet, TSV, statistical formats)
- Data blending with joins across multiple sources
- Data preparation pipeline (rename, cast, filter, sort, calculated fields, pivot/unpivot)
- Interactive filters with 13 operators
- Parameters and parameter actions for dashboard interactivity
- Groups and bins for custom field aggregation
- AI-powered palette generator
- Chart insights with statistical analysis
- Workbook version history (save, rollback, diff, max 50 versions)
- Multi-sheet dashboards with independent chart layouts
- Export workbook configuration as JSON
- Database connector proxy (PostgreSQL, MySQL, MSSQL)
- Scheduled data extracts and ETL flows

### UI/UX
- Professional SVG favicon (blue bar chart icon)
- 8 themes: light, dark, ocean, forest, sunset, midnight, high-contrast, high-contrast-light
- Pro landing page with animated drop zone and feature cards
- Editable workbook name in header
- Version history slide-out panel
- Responsive chart grid with active state indicators
- Drag-and-drop field assignment with quick-assign buttons (X/Y/C)
- Encoding shelf with chart type selector and trend line toggle
- shadcn/ui + Base UI design system

### Infrastructure
- Next.js 16 App Router with Turbopack (frontend)
- Express.js connector proxy (backend)
- Zustand with localStorage persistence
- TypeScript strict mode
- Tailwind CSS v4 with oklch color space
- Port: 3013 (frontend), 4002 (proxy)
