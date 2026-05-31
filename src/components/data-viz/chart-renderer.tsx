'use client';

import { useMemo, useCallback } from 'react';
import { ChartConfig as VizChartConfig, COLOR_PALETTES } from '@/lib/types';
import { useWorkbookStore } from '@/lib/store';
import { aggregateData, applyFilters } from '@/lib/data-engine';
import { handleChartInteraction, getParameterFilters } from '@/lib/parameter-actions';
import { transformToSankey } from '@/lib/charts/sankey';
import { SankeyChart } from '@/components/data-viz/charts/sankey-chart';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  Bar, BarChart, Line, LineChart, Area, AreaChart,
  Pie, PieChart, Cell, Scatter, ScatterChart,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface ChartRendererProps {
  chart: VizChartConfig;
}

const COLORS = COLOR_PALETTES.default;

// Custom tooltip formatter for percent-of-total
function PercentTooltipContent({
  active,
  payload,
  label,
  yField,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  label?: string;
  yField: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const pctValue = entry.value;
  const absValue = entry.payload[`${yField}_abs`] as number | undefined;

  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">
        {yField}: {pctValue.toFixed(1)}%
        {absValue != null && ` (${absValue.toLocaleString()})`}
      </p>
    </div>
  );
}

// Custom tooltip for pie/donut percent-of-total
function PiePercentTooltipContent({
  active,
  payload,
  yField,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: Record<string, unknown> }>;
  yField: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const pctValue = entry.value;
  const absValue = entry.payload[`${yField}_abs`] as number | undefined;

  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      <p className="text-xs font-medium text-foreground">{entry.name}</p>
      <p className="text-xs text-muted-foreground">
        {yField}: {pctValue.toFixed(1)}%
        {absValue != null && ` (${absValue.toLocaleString()})`}
      </p>
    </div>
  );
}

export function ChartRenderer({ chart }: ChartRendererProps) {
  const { workbook, updateParameterValue } = useWorkbookStore();
  const activeDs = workbook.dataSources.find((d) => d.id === workbook.activeDataSourceId);

  // Get parameter filters for this chart (filters from parameter actions
  // where this chart is a consumer, not the source)
  const paramFilters = useMemo(
    () => getParameterFilters(
      workbook.parameters,
      workbook.parameterActions,
      chart.id,
    ),
    [workbook.parameters, workbook.parameterActions, chart.id],
  );

  const chartData = useMemo(() => {
    if (!activeDs) return [];

    // Apply chart-level filters first
    let filtered = applyFilters(activeDs.rows, chart.filters);

    // Apply parameter-based filters (from parameter actions)
    if (paramFilters.length > 0) {
      filtered = filtered.filter((row) =>
        paramFilters.every((pf) => {
          const rowValue = row[pf.field];
          if (rowValue == null) return false;
          // Compare as string for flexibility (dimension values)
          return String(rowValue) === String(pf.value);
        }),
      );
    }

    return aggregateData(filtered, chart);
  }, [activeDs, chart, paramFilters]);

  // Handle chart mark click — triggers parameter actions
  const handleMarkClick = useCallback(
    (dimensionValue: string | number) => {
      handleChartInteraction(chart.id, 'click', dimensionValue, {
        parameters: workbook.parameters,
        parameterActions: workbook.parameterActions,
        updateParameterValue,
      });
    },
    [chart.id, workbook.parameters, workbook.parameterActions, updateParameterValue],
  );

  const isPercentOfTotal = chart.yAxis.aggregation === 'PERCENT_OF_TOTAL';

  if (!activeDs) {
    return <EmptyMessage text="Import data to get started" />;
  }

  if (chart.chartType === 'kpi') {
    return <KPIRenderer chart={chart} data={chartData} />;
  }

  // Sankey requires source (xAxis), value (yAxis), and target (color)
  if (chart.chartType === 'sankey') {
    if (!chart.xAxis.field || !chart.yAxis.field || !chart.color.field) {
      return <EmptyMessage text="Drag source to X, value to Y, and target to Color" />;
    }

    let filtered = applyFilters(activeDs.rows, chart.filters);
    // Apply parameter-based filters for Sankey too
    if (paramFilters.length > 0) {
      filtered = filtered.filter((row) =>
        paramFilters.every((pf) => {
          const rowValue = row[pf.field];
          if (rowValue == null) return false;
          return String(rowValue) === String(pf.value);
        }),
      );
    }
    const sankeyData = transformToSankey(
      filtered,
      chart.xAxis.field,
      chart.color.field,
      chart.yAxis.field,
    );

    if (!sankeyData.nodes.length || !sankeyData.links.length) {
      return <EmptyMessage text="No flow data available for Sankey chart" />;
    }

    const palette = chart.colorPalette.length > 0 ? chart.colorPalette : COLORS;

    return <SankeyChart data={sankeyData} colorPalette={palette} />;
  }

  if (!chart.xAxis.field || !chart.yAxis.field) {
    return <EmptyMessage text="Drag fields to X and Y to build a chart" />;
  }

  if (chartData.length === 0) {
    return <EmptyMessage text="No data matches current filters" />;
  }

  const xField = chart.xAxis.field;
  const yField = chart.yAxis.field;
  const palette = chart.colorPalette.length > 0 ? chart.colorPalette : COLORS;

  const yAxisLabel = isPercentOfTotal ? `${yField} (%)` : yField;
  const chartConfig: ChartConfig = {
    [yField]: { label: yAxisLabel, color: palette[0] },
  };

  switch (chart.chartType) {
    case 'bar':
    case 'stacked-bar':
      return (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <BarChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey={xField} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              unit={isPercentOfTotal ? '%' : undefined}
              domain={isPercentOfTotal ? [0, 100] : undefined}
            />
            {isPercentOfTotal ? (
              <ChartTooltip
                content={<PercentTooltipContent yField={yField} />}
              />
            ) : (
              <ChartTooltip content={<ChartTooltipContent />} />
            )}
            {chart.showLegend && <ChartLegend content={<ChartLegendContent />} />}
            <Bar
              dataKey={yField}
              fill={palette[0]}
              radius={[3, 3, 0, 0]}
              onClick={(data) => {
                const d = data as unknown as Record<string, unknown>;
                if (d && d[xField] != null) handleMarkClick(d[xField] as string | number);
              }}
              className="cursor-pointer"
            />
            {chart.showTrendLine && <ReferenceLine y={avg(chartData, yField)} stroke="#F59E0B" strokeDasharray="5 5" />}
          </BarChart>
        </ChartContainer>
      );

    case 'horizontal-bar':
      return (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <BarChart data={chartData} layout="vertical" accessibilityLayer>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              unit={isPercentOfTotal ? '%' : undefined}
              domain={isPercentOfTotal ? [0, 100] : undefined}
            />
            <YAxis dataKey={xField} type="category" tickLine={false} axisLine={false} fontSize={11} width={80} />
            {isPercentOfTotal ? (
              <ChartTooltip
                content={<PercentTooltipContent yField={yField} />}
              />
            ) : (
              <ChartTooltip content={<ChartTooltipContent />} />
            )}
            <Bar
              dataKey={yField}
              fill={palette[0]}
              radius={[0, 3, 3, 0]}
              onClick={(data) => {
                const d = data as unknown as Record<string, unknown>;
                if (d && d[xField] != null) handleMarkClick(d[xField] as string | number);
              }}
              className="cursor-pointer"
            />
          </BarChart>
        </ChartContainer>
      );

    case 'line':
      return (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <LineChart data={chartData} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xField} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              unit={isPercentOfTotal ? '%' : undefined}
              domain={isPercentOfTotal ? [0, 100] : undefined}
            />
            {isPercentOfTotal ? (
              <ChartTooltip
                content={<PercentTooltipContent yField={yField} />}
              />
            ) : (
              <ChartTooltip content={<ChartTooltipContent />} />
            )}
            {chart.showLegend && <ChartLegend content={<ChartLegendContent />} />}
            <Line
              type="monotone"
              dataKey={yField}
              stroke={palette[0]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{
                r: 5,
                className: 'cursor-pointer',
                onClick: (_: unknown, payload: unknown) => {
                  const p = payload as { payload?: Record<string, unknown> };
                  if (p?.payload && p.payload[xField] != null) {
                    handleMarkClick(p.payload[xField] as string | number);
                  }
                },
              }}
            />
            {chart.showTrendLine && <ReferenceLine y={avg(chartData, yField)} stroke="#F59E0B" strokeDasharray="5 5" />}
          </LineChart>
        </ChartContainer>
      );

    case 'area':
      return (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <AreaChart data={chartData} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xField} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              unit={isPercentOfTotal ? '%' : undefined}
              domain={isPercentOfTotal ? [0, 100] : undefined}
            />
            {isPercentOfTotal ? (
              <ChartTooltip
                content={<PercentTooltipContent yField={yField} />}
              />
            ) : (
              <ChartTooltip content={<ChartTooltipContent />} />
            )}
            <Area type="monotone" dataKey={yField} stroke={palette[0]} fill={palette[0]} fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      );

    case 'pie':
    case 'donut':
      return (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <PieChart accessibilityLayer>
            {isPercentOfTotal ? (
              <ChartTooltip
                content={<PiePercentTooltipContent yField={yField} />}
              />
            ) : (
              <ChartTooltip content={<ChartTooltipContent />} />
            )}
            <Pie
              data={chartData}
              dataKey={yField}
              nameKey={xField}
              cx="50%"
              cy="50%"
              innerRadius={chart.chartType === 'donut' ? 45 : 0}
              outerRadius={85}
              paddingAngle={2}
              label={chart.showDataLabels ? (isPercentOfTotal
                ? ({ value }: { value: number }) => `${value.toFixed(1)}%`
                : true
              ) : false}
              onClick={(_, index) => {
                const d = chartData[index] as Record<string, unknown> | undefined;
                if (d && d[xField] != null) handleMarkClick(d[xField] as string | number);
              }}
              className="cursor-pointer"
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            {chart.showLegend && <ChartLegend content={<ChartLegendContent />} />}
          </PieChart>
        </ChartContainer>
      );

    case 'scatter':
    case 'bubble':
      return (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ScatterChart accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xField} tickLine={false} axisLine={false} name={xField} fontSize={11} />
            <YAxis dataKey={yField} tickLine={false} axisLine={false} name={yField} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Scatter
              data={chartData}
              fill={palette[0]}
              onClick={(data) => {
                const d = data as unknown as Record<string, unknown>;
                if (d && d[xField] != null) handleMarkClick(d[xField] as string | number);
              }}
              className="cursor-pointer"
            />
          </ScatterChart>
        </ChartContainer>
      );

    case 'heatmap':
      return <HeatmapRenderer data={chartData} xField={xField} yField={yField} palette={palette} onCellClick={handleMarkClick} />;

    case 'table':
      return (
        <TableRenderer
          data={chartData}
          fields={activeDs.fields.map((f) => f.name)}
          isPercentOfTotal={isPercentOfTotal}
          yField={yField}
          xField={xField}
          onRowClick={handleMarkClick}
        />
      );

    default:
      return <EmptyMessage text="Select a chart type" />;
  }
}

// ---- Sub-renderers ----

function KPIRenderer({ chart, data }: { chart: VizChartConfig; data: Record<string, unknown>[] }) {
  const value = data[0]?.value as number || 0;
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{chart.yAxis.field || 'Value'}</p>
      <p className="text-4xl font-bold tabular-nums">{value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
      {chart.yAxis.aggregation !== 'NONE' && (
        <p className="text-xs text-muted-foreground">{chart.yAxis.aggregation}</p>
      )}
    </div>
  );
}

function HeatmapRenderer({ data, xField, yField, palette, onCellClick }: {
  data: Record<string, unknown>[];
  xField: string;
  yField: string;
  palette: string[];
  onCellClick?: (value: string | number) => void;
}) {
  const max = Math.max(...data.map((d) => Math.abs(Number(d[yField]) || 0)), 1);
  return (
    <div className="h-full overflow-auto p-2">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(64px, 1fr))` }}>
        {data.slice(0, 100).map((row, i) => {
          const value = Number(row[yField]) || 0;
          const intensity = Math.abs(value) / max;
          return (
            <div
              key={i}
              className="flex flex-col items-center justify-center rounded p-2 text-[10px] cursor-pointer"
              style={{ backgroundColor: `rgba(59, 130, 246, ${intensity * 0.8 + 0.05})`, color: intensity > 0.5 ? 'white' : 'inherit' }}
              title={`${row[xField]}: ${value.toLocaleString()}`}
              onClick={() => {
                if (onCellClick && row[xField] != null) {
                  onCellClick(row[xField] as string | number);
                }
              }}
            >
              <span className="font-medium truncate w-full text-center">{String(row[xField])}</span>
              <span className="font-mono">{value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TableRenderer({
  data,
  fields,
  isPercentOfTotal,
  yField,
  xField,
  onRowClick,
}: {
  data: Record<string, unknown>[];
  fields: string[];
  isPercentOfTotal?: boolean;
  yField?: string;
  xField?: string;
  onRowClick?: (value: string | number) => void;
}) {
  const visibleFields = fields.slice(0, 10);

  // When percent-of-total is active, add a percentage column after the yField
  const displayFields = isPercentOfTotal && yField
    ? visibleFields.flatMap((f) =>
        f === yField ? [f, `${f} (%)`] : [f]
      )
    : visibleFields;

  return (
    <div className="h-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {displayFields.map((f) => (
              <TableHead key={f} className="text-xs whitespace-nowrap">{f}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.slice(0, 200).map((row, i) => (
            <TableRow
              key={i}
              className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
              onClick={() => {
                if (onRowClick && xField && row[xField] != null) {
                  onRowClick(row[xField] as string | number);
                }
              }}
            >
              {displayFields.map((f) => {
                // Handle the synthetic percentage column
                if (isPercentOfTotal && yField && f === `${yField} (%)`) {
                  const pctValue = row[`${yField}_pct`] as number | undefined;
                  const absValue = row[`${yField}_abs`] as number | undefined;
                  return (
                    <TableCell key={f} className="text-xs font-mono py-1">
                      {pctValue != null ? `${pctValue.toFixed(1)}%` : ''}
                      {absValue != null && (
                        <span className="text-muted-foreground ml-1">
                          ({absValue.toLocaleString()})
                        </span>
                      )}
                    </TableCell>
                  );
                }
                return (
                  <TableCell key={f} className="text-xs font-mono py-1">
                    {typeof row[f] === 'number' ? (row[f] as number).toLocaleString() : String(row[f] ?? '')}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function avg(data: Record<string, unknown>[], field: string): number {
  const nums = data.map((d) => Number(d[field]) || 0);
  return nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}
