'use client';

import { useCallback } from 'react';
import { ChartConfig, ChartType, CHART_TYPE_LABELS, AggregationType, AGGREGATION_LABELS, ChartEncoding } from '@/lib/types';
import { useWorkbookStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { Coachmark } from '@/components/coachmark';
import { PaletteGenerator, type CustomPalette } from './palette-generator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  BarChart3, LineChart, AreaChart, PieChart, ScatterChart,
  Grid3X3, Table, Gauge, CircleDot, Layers, BarChart, X, TrendingUp,
  GitBranch, Palette,
} from 'lucide-react';

const CHART_ICONS: Record<ChartType, React.ElementType> = {
  bar: BarChart3,
  'horizontal-bar': BarChart,
  'stacked-bar': Layers,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  donut: CircleDot,
  scatter: ScatterChart,
  bubble: CircleDot,
  heatmap: Grid3X3,
  treemap: Grid3X3,
  table: Table,
  kpi: Gauge,
  sankey: GitBranch,
};

interface EncodingShelfProps {
  chart: ChartConfig;
}

export function EncodingShelf({ chart }: EncodingShelfProps) {
  const { setChartType, setEncoding, updateChart, workbook } = useWorkbookStore();
  const t = useT();
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);

  const handleDrop = (e: React.DragEvent, target: 'xAxis' | 'yAxis' | 'color' | 'size') => {
    e.preventDefault();
    const fieldName = e.dataTransfer.getData('field');
    const role = e.dataTransfer.getData('role');
    if (!fieldName) return;
    const defaultAgg: AggregationType = role === 'measure' ? 'SUM' : 'NONE';
    setEncoding(chart.id, target, {
      field: fieldName,
      aggregation: target === 'yAxis' || target === 'size' ? defaultAgg : 'NONE',
    });
  };

  const cycleAgg = (current: AggregationType): AggregationType => {
    const order: AggregationType[] = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT_DISTINCT', 'PERCENT_OF_TOTAL', 'NONE'];
    return order[(order.indexOf(current) + 1) % order.length];
  };

  return (
    <div className="relative border-b bg-muted/10 px-3 py-2">
      <Coachmark
        id="encoding-shelf"
        title={t('coachmark.encodingTitle')}
        description={t('coachmark.encodingDesc')}
        position="bottom"
        delay={2000}
      />
      <div className="flex flex-wrap items-center gap-2">
        {/* Chart type selector */}
        <div className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5">
          {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((type) => {
            const Icon = CHART_ICONS[type];
            const isActive = chart.chartType === type;
            return (
              <button
                key={type}
                onClick={() => setChartType(chart.id, type)}
                className={`rounded p-1 cursor-pointer transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                }`}
                title={CHART_TYPE_LABELS[type]}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Encoding drop zones */}
        <DropZone label="X" encoding={chart.xAxis} onDrop={(e) => handleDrop(e, 'xAxis')}
          onClear={() => setEncoding(chart.id, 'xAxis', { field: null, aggregation: 'NONE' })}
          onCycleAgg={() => setEncoding(chart.id, 'xAxis', { ...chart.xAxis, aggregation: cycleAgg(chart.xAxis.aggregation) })}
        />
        <DropZone label="Y" encoding={chart.yAxis} onDrop={(e) => handleDrop(e, 'yAxis')}
          onClear={() => setEncoding(chart.id, 'yAxis', { field: null, aggregation: 'SUM' })}
          onCycleAgg={() => setEncoding(chart.id, 'yAxis', { ...chart.yAxis, aggregation: cycleAgg(chart.yAxis.aggregation) })}
        />
        <DropZone label="Color" encoding={chart.color} onDrop={(e) => handleDrop(e, 'color')}
          onClear={() => setEncoding(chart.id, 'color', { field: null, aggregation: 'NONE' })}
          onCycleAgg={() => setEncoding(chart.id, 'color', { ...chart.color, aggregation: cycleAgg(chart.color.aggregation) })}
        />
        <DropZone label="Size" encoding={chart.size} onDrop={(e) => handleDrop(e, 'size')}
          onClear={() => setEncoding(chart.id, 'size', { field: null, aggregation: 'NONE' })}
          onCycleAgg={() => setEncoding(chart.id, 'size', { ...chart.size, aggregation: cycleAgg(chart.size.aggregation) })}
        />

        <div className="h-4 w-px bg-border" />

        {/* Trend line toggle */}
        <button
          onClick={() => sheet && updateChart(sheet.id, chart.id, { showTrendLine: !chart.showTrendLine })}
          className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors ${
            chart.showTrendLine ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'text-muted-foreground hover:bg-accent'
          }`}
          title="Toggle trend line"
        >
          <TrendingUp className="h-3 w-3" />
          Trend
        </button>

        <div className="h-4 w-px bg-border" />

        {/* AI Palette Generator */}
        <PalettePopover chart={chart} />
      </div>
    </div>
  );
}

function PalettePopover({ chart }: { chart: ChartConfig }) {
  const { updateChart, workbook } = useWorkbookStore();
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);

  const handleSavePalette = useCallback(
    (palette: CustomPalette) => {
      if (!sheet) return;
      updateChart(sheet.id, chart.id, { colorPalette: palette.colors });
    },
    [sheet, chart.id, updateChart]
  );

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium
          cursor-pointer transition-colors text-muted-foreground hover:bg-accent"
        title="AI Palette Generator"
        aria-label="Open AI palette generator"
      >
        <Palette className="h-3 w-3" />
        Palette
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <PaletteGenerator
          onSavePalette={handleSavePalette}
          className="border-0 shadow-none"
        />
      </PopoverContent>
    </Popover>
  );
}

function DropZone({
  label,
  encoding,
  onDrop,
  onClear,
  onCycleAgg,
}: {
  label: string;
  encoding: ChartEncoding;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
  onCycleAgg: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 min-w-[80px] transition-colors ${
        encoding.field ? 'border-solid bg-background' : 'border-dashed border-muted-foreground/30'
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <span className="text-[9px] font-bold uppercase text-muted-foreground">{label}</span>
      {encoding.field ? (
        <div className="flex items-center gap-0.5">
          {encoding.aggregation !== 'NONE' && (
            <button
              onClick={onCycleAgg}
              className="cursor-pointer text-[9px] font-mono text-amber-600 dark:text-amber-400 hover:underline"
              title="Click to change aggregation"
            >
              {encoding.aggregation}
            </button>
          )}
          <Badge variant="secondary" className="text-[10px] gap-0.5 py-0 h-4 px-1">
            {encoding.field}
            <button onClick={onClear} className="cursor-pointer hover:text-destructive" aria-label="Clear">
              <X className="h-2 w-2" />
            </button>
          </Badge>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground italic">drop</span>
      )}
    </div>
  );
}
