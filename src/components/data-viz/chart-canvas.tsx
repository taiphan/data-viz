'use client';

import { useState, useMemo } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { aggregateData, applyFilters } from '@/lib/data-engine';
import { ChartRenderer } from './chart-renderer';
import { EncodingShelf } from './encoding-shelf';
import { InsightsCard } from './insights-card';
import { Card } from '@/components/ui/card';
import { Plus, X, Copy, Lightbulb } from 'lucide-react';

export function ChartCanvas() {
  const {
    workbook,
    getActiveSheet,
    addChart,
    removeChart,
    setActiveChart,
    duplicateChart,
  } = useWorkbookStore();

  const [insightsChartId, setInsightsChartId] = useState<string | null>(null);

  const activeSheet = getActiveSheet();
  if (!activeSheet) return null;

  const charts = activeSheet.charts;
  const activeChart = charts.find((c) => c.id === workbook.activeChartId);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Encoding shelf for active chart */}
      {activeChart && <EncodingShelf chart={activeChart} />}

      {/* Chart grid */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className={`grid gap-4 ${
            charts.length === 1
              ? 'grid-cols-1 h-full'
              : charts.length <= 4
                ? 'grid-cols-1 lg:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          }`}
        >
          {charts.map((chart) => {
            const isActive = chart.id === workbook.activeChartId;
            const showInsights = insightsChartId === chart.id;
            return (
              <Card
                key={chart.id}
                className={`
                  group relative flex flex-col min-h-[300px] cursor-pointer
                  transition-all duration-200 rounded-xl
                  ${isActive
                    ? 'ring-2 ring-primary/60 shadow-lg shadow-primary/5'
                    : 'hover:shadow-md hover:ring-1 hover:ring-border/60'
                  }
                `}
                onClick={() => setActiveChart(chart.id)}
              >
                {/* Chart header */}
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {chart.title}
                    {chart.xAxis.field && chart.yAxis.field && (
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {chart.yAxis.aggregation !== 'NONE' ? `${chart.yAxis.aggregation}(${chart.yAxis.field})` : chart.yAxis.field}
                        {' by '}
                        {chart.xAxis.field}
                      </span>
                    )}
                  </span>
                  <div className="hidden items-center gap-1 group-hover:flex">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInsightsChartId(showInsights ? null : chart.id);
                      }}
                      className={`cursor-pointer rounded-md p-1 transition-colors ${
                        showInsights
                          ? 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      title="Generate Insights"
                      aria-label="Generate Insights"
                      aria-pressed={showInsights}
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateChart(activeSheet.id, chart.id); }}
                      className="cursor-pointer rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {charts.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeChart(activeSheet.id, chart.id); }}
                        className="cursor-pointer rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Chart body */}
                <div className="flex-1 p-2 min-h-0">
                  <ChartRenderer chart={chart} />
                </div>

                {/* Insights panel (shown below chart when toggled) */}
                {showInsights && (
                  <ChartInsightsPanel chartId={chart.id} />
                )}
              </Card>
            );
          })}

          {/* Add chart card */}
          <Card
            className="flex min-h-[200px] cursor-pointer items-center justify-center border-2 border-dashed rounded-xl transition-all duration-200 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm"
            onClick={() => addChart(activeSheet.id)}
          >
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="rounded-full bg-muted p-3">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="text-sm font-medium">Add Chart</span>
              <span className="text-[11px] text-muted-foreground/70">Click to create a new visualization</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Extracts y-axis numeric values from the active chart's aggregated data
 * and renders the InsightsCard with those values.
 */
function ChartInsightsPanel({ chartId }: { chartId: string }) {
  const { workbook } = useWorkbookStore();
  const activeDs = workbook.dataSources.find(
    (d) => d.id === workbook.activeDataSourceId
  );
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);
  const chart = sheet?.charts.find((c) => c.id === chartId);

  const { values, labels } = useMemo(() => {
    if (!activeDs || !chart || !chart.yAxis.field) {
      return { values: [], labels: [] };
    }

    const filtered = applyFilters(activeDs.rows, chart.filters);
    const aggregated = aggregateData(filtered, chart);

    const yField = chart.yAxis.field;
    const xField = chart.xAxis.field;

    const extractedValues = aggregated
      .map((row) => Number(row[yField]))
      .filter((v) => !isNaN(v));

    const extractedLabels = xField
      ? aggregated.map((row) => String(row[xField] ?? ''))
      : undefined;

    return { values: extractedValues, labels: extractedLabels };
  }, [activeDs, chart]);

  if (values.length === 0) {
    return (
      <div className="border-t px-3 py-2">
        <p className="text-[10px] text-muted-foreground text-center">
          Assign fields to X and Y axes to generate insights.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t" onClick={(e) => e.stopPropagation()}>
      <InsightsCard
        values={values}
        labels={labels}
        title="Chart Insights"
        className="border-0 shadow-none rounded-none"
      />
    </div>
  );
}
