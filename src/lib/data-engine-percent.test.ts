import { describe, it, expect } from 'vitest';
import { aggregateData } from './data-engine';
import { ChartConfig } from './types';

function makeChartConfig(overrides: Partial<ChartConfig> = {}): ChartConfig {
  return {
    id: 'test-chart',
    title: 'Test',
    chartType: 'bar',
    xAxis: { field: 'category', aggregation: 'NONE' },
    yAxis: { field: 'sales', aggregation: 'PERCENT_OF_TOTAL' },
    color: { field: null, aggregation: 'NONE' },
    size: { field: null, aggregation: 'NONE' },
    label: { field: null, aggregation: 'NONE' },
    filters: [],
    sortBy: null,
    sortOrder: 'none',
    showTrendLine: false,
    showDataLabels: false,
    showLegend: true,
    colorPalette: [],
    width: 4,
    height: 3,
    ...overrides,
  };
}

describe('aggregateData with PERCENT_OF_TOTAL', () => {
  const sampleRows = [
    { category: 'A', sales: 25 },
    { category: 'B', sales: 25 },
    { category: 'C', sales: 50 },
  ];

  it('converts values to percentages for bar chart', () => {
    const config = makeChartConfig({ chartType: 'bar' });
    const result = aggregateData(sampleRows, config);

    expect(result).toHaveLength(3);
    expect(result[0].sales).toBeCloseTo(25, 1);
    expect(result[1].sales).toBeCloseTo(25, 1);
    expect(result[2].sales).toBeCloseTo(50, 1);
  });

  it('preserves absolute values in _abs field', () => {
    const config = makeChartConfig({ chartType: 'bar' });
    const result = aggregateData(sampleRows, config);

    expect(result[0].sales_abs).toBe(25);
    expect(result[1].sales_abs).toBe(25);
    expect(result[2].sales_abs).toBe(50);
  });

  it('percentages sum to 100', () => {
    const config = makeChartConfig({ chartType: 'bar' });
    const result = aggregateData(sampleRows, config);

    const sum = result.reduce((s, r) => s + (r.sales as number), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('works with pie chart type', () => {
    const config = makeChartConfig({ chartType: 'pie' });
    const result = aggregateData(sampleRows, config);

    expect(result).toHaveLength(3);
    const sum = result.reduce((s, r) => s + (r.sales as number), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('works with donut chart type', () => {
    const config = makeChartConfig({ chartType: 'donut' });
    const result = aggregateData(sampleRows, config);

    expect(result).toHaveLength(3);
    const sum = result.reduce((s, r) => s + (r.sales as number), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('works with stacked-bar chart type', () => {
    const config = makeChartConfig({ chartType: 'stacked-bar' });
    const result = aggregateData(sampleRows, config);

    expect(result).toHaveLength(3);
    const sum = result.reduce((s, r) => s + (r.sales as number), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('works with table chart type', () => {
    const config = makeChartConfig({ chartType: 'table' });
    const result = aggregateData(sampleRows, config);

    expect(result).toHaveLength(3);
    // Table adds _pct and _abs fields
    expect(result[0]).toHaveProperty('sales_pct');
    expect(result[0]).toHaveProperty('sales_abs');
    expect(result[0].sales_pct).toBeCloseTo(25, 1);
    expect(result[0].sales_abs).toBe(25);
  });

  it('aggregates duplicate categories before computing percent', () => {
    const rows = [
      { category: 'A', sales: 10 },
      { category: 'A', sales: 15 },
      { category: 'B', sales: 25 },
    ];
    const config = makeChartConfig({ chartType: 'bar' });
    const result = aggregateData(rows, config);

    // A sums to 25, B is 25 → total 50 → each is 50%
    expect(result).toHaveLength(2);
    expect(result[0].sales).toBeCloseTo(50, 1);
    expect(result[1].sales).toBeCloseTo(50, 1);
  });

  it('handles all-zero values gracefully', () => {
    const rows = [
      { category: 'A', sales: 0 },
      { category: 'B', sales: 0 },
    ];
    const config = makeChartConfig({ chartType: 'bar' });
    const result = aggregateData(rows, config);

    expect(result[0].sales).toBe(0);
    expect(result[1].sales).toBe(0);
  });

  it('does not apply percent transform when aggregation is SUM', () => {
    const config = makeChartConfig({
      chartType: 'bar',
      yAxis: { field: 'sales', aggregation: 'SUM' },
    });
    const result = aggregateData(sampleRows, config);

    // Should be raw sums, not percentages
    expect(result[0].sales).toBe(25);
    expect(result[1].sales).toBe(25);
    expect(result[2].sales).toBe(50);
    expect(result[0]).not.toHaveProperty('sales_abs');
  });
});
