<p align="center">
  <img src="logo.svg" alt="Data Viz" width="120" height="120" />
</p>

<h1 align="center">Data Viz</h1>

<p align="center">
  <strong>Self-service analytics platform. Upload data, build interactive charts, create stunning dashboards.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-green" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind-4-06b6d4" alt="Tailwind" />
</p>

---

## Overview

Data Viz is an open-source, Tableau-inspired analytics platform that runs entirely in the browser. Import data from files or databases, build charts with drag-and-drop, and create multi-sheet interactive dashboards — no server required for the core experience.

## Features

- **14 Chart Types** — Bar, line, area, pie, donut, scatter, bubble, heatmap, treemap, table, KPI, sankey, horizontal-bar, stacked-bar
- **Multi-Format Import** — CSV, JSON, Excel, PDF, Parquet, TSV, statistical formats (SPSS, Stata, SAS)
- **Drag-and-Drop** — Assign fields to axes, color, and size channels
- **Data Preparation** — Rename, cast, filter, sort, calculated fields, pivot/unpivot, groups, bins
- **Data Blending** — Join multiple data sources (inner, left, right, full)
- **Interactive Filters** — 13 filter operators with enable/disable toggle
- **Parameters** — Dynamic values that drive dashboard interactivity
- **Version History** — Save, rollback, and diff workbook versions (max 50)
- **8 Themes** — Light, dark, ocean, forest, sunset, midnight, high-contrast, HC-light
- **AI Palette Generator** — Generate color palettes for charts
- **Chart Insights** — Statistical analysis with trend detection
- **Database Connectors** — PostgreSQL, MySQL, MSSQL via secure proxy
- **Scheduled Extracts** — Automated data refresh with ETL flows
- **Export** — Workbook configuration as JSON

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Turbopack) |
| Proxy | Express.js (database connections) |
| Language | TypeScript 5 (strict mode) |
| UI | shadcn/ui + Base UI + Radix |
| Styling | Tailwind CSS v4 (oklch colors) |
| State | Zustand with localStorage persistence |
| Charts | Recharts + D3 |
| Data | PapaParse, SheetJS, hyparquet, pdfjs-dist |
| Validation | Zod |
| Themes | next-themes (8 themes) |

## Getting Started

### Prerequisites

- Node.js 20+
- (Optional) PostgreSQL, MySQL, or MSSQL for database connectors

### Installation

```bash
# Frontend
cd data-viz
npm install

# Proxy (optional — only needed for database connectors)
cd proxy
npm install
cp .env.example .env  # Configure database credentials
```

### Development

```bash
# Frontend (port 3013)
npm run dev -- -p 3013

# Proxy (port 4002, optional)
cd proxy
npm run dev
```

Open [http://localhost:3013](http://localhost:3013) in your browser.

### Build

```bash
npm run build
npm start
```

## Project Structure

```
data-viz/
├── src/
│   ├── app/                  # Next.js App Router
│   ├── components/
│   │   ├── ui/               # shadcn/ui primitives
│   │   ├── data-viz/         # Feature components
│   │   │   ├── charts/       # Chart type renderers
│   │   │   ├── connectors/   # Database connector UI
│   │   │   └── flow-editor/  # ETL flow builder
│   │   ├── theme-provider.tsx
│   │   └── theme-switcher.tsx
│   └── lib/
│       ├── store.ts          # Zustand workbook store
│       ├── data-engine.ts    # Parsing, aggregation, filtering
│       ├── types.ts          # Core type definitions
│       ├── connectors/       # File & DB connector logic
│       ├── workbook/         # Versioning system
│       └── charts/           # Chart computation helpers
├── proxy/                    # Database connector proxy
│   └── src/
│       ├── routes/           # API endpoints
│       ├── services/         # DB query execution
│       └── middleware/       # Auth, rate limiting
├── public/                   # Sample datasets
└── README.md
```

## Sample Data

The `public/` directory includes sample datasets for testing:
- `sample-sales-dashboard.csv` — 100 rows of sales data (orders, regions, categories)
- `sample-superstore.csv` — Classic superstore dataset
- `sample-financial.csv` — Financial metrics
- `sample-hr-analytics.csv` — HR data

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## Themes

| Theme | Type | Description |
|-------|------|-------------|
| Light | Standard | Clean white background |
| Dark | Standard | Dark neutral |
| Ocean | Color | Cool blue professional |
| Forest | Color | Green nature |
| Sunset | Color | Warm amber/orange |
| Midnight | Color | Deep indigo/purple |
| High Contrast | Accessibility | Maximum contrast dark |
| HC Light | Accessibility | Maximum contrast light |

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
