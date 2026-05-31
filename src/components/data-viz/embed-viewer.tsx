'use client';

import { useMemo } from 'react';
import { ChartRenderer } from './chart-renderer';
import type { Workbook, DashboardSheet } from '@/lib/types';
import type { PublishedWorkbook } from '@/lib/workbook/publishing';
import { isPublishValid } from '@/lib/workbook/publishing';

// ============================================================
// TYPES
// ============================================================

export interface EmbedViewerProps {
  workbook: Workbook;
  published: PublishedWorkbook;
}

// ============================================================
// EMBED VIEWER COMPONENT
// ============================================================

/**
 * Renders a workbook dashboard in embed mode — read-only, without
 * editor chrome (no toolbar, field panel, encoding shelf, etc.).
 * Designed for iframe embedding via shareable URLs.
 */
export function EmbedViewer({ workbook, published }: EmbedViewerProps) {
  const isValid = isPublishValid(published);

  const visibleSheets = useMemo(() => {
    if (!isValid) return [];
    return workbook.sheets.filter((sheet) =>
      published.allowedSheetIds.includes(sheet.id)
    );
  }, [workbook.sheets, published.allowedSheetIds, isValid]);

  if (!isValid) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-background"
        role="alert"
        aria-live="polite"
      >
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">
            This link has expired
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The shared dashboard is no longer available.
          </p>
        </div>
      </div>
    );
  }

  if (visibleSheets.length === 0) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-background"
        role="alert"
        aria-live="polite"
      >
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">
            No content available
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This dashboard has no visible sheets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Header — minimal branding */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-sm font-semibold text-foreground truncate">
          {published.title}
        </h1>
        <span className="text-[10px] text-muted-foreground">Read-only</span>
      </header>

      {/* Sheet content */}
      <main className="flex-1 overflow-auto">
        {visibleSheets.map((sheet) => (
          <EmbedSheet key={sheet.id} sheet={sheet} />
        ))}
      </main>
    </div>
  );
}

// ============================================================
// EMBED SHEET (internal)
// ============================================================

interface EmbedSheetProps {
  sheet: DashboardSheet;
}

function EmbedSheet({ sheet }: EmbedSheetProps) {
  const charts = sheet.charts;

  if (charts.length === 0) {
    return null;
  }

  return (
    <section className="p-4" aria-label={`Sheet: ${sheet.title}`}>
      {/* Sheet title (only show if multiple sheets might be visible) */}
      <h2 className="mb-3 text-xs font-medium text-muted-foreground">
        {sheet.title}
      </h2>

      {/* Chart grid — mirrors chart-canvas layout without edit controls */}
      <div
        className={`grid gap-3 ${
          charts.length === 1
            ? 'grid-cols-1'
            : charts.length <= 4
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {charts.map((chart) => (
          <div
            key={chart.id}
            className="flex flex-col rounded-lg border bg-card min-h-[240px]"
          >
            {/* Chart title */}
            <div className="border-b px-3 py-1.5">
              <span className="text-[11px] font-medium text-muted-foreground truncate">
                {chart.title}
              </span>
            </div>

            {/* Chart body */}
            <div className="flex-1 p-1.5 min-h-0">
              <ChartRenderer chart={chart} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
