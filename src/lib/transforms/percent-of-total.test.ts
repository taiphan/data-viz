import { describe, it, expect } from 'vitest';
import {
  computePercentOfTotal,
  computePercentOfTotalByGroup,
} from './percent-of-total';

describe('computePercentOfTotal', () => {
  it('returns empty array for empty input', () => {
    expect(computePercentOfTotal([])).toEqual([]);
  });

  it('returns [100] for a single value', () => {
    expect(computePercentOfTotal([50])).toEqual([100]);
  });

  it('computes correct percentages for positive values', () => {
    const result = computePercentOfTotal([25, 25, 50]);
    expect(result[0]).toBeCloseTo(25, 2);
    expect(result[1]).toBeCloseTo(25, 2);
    expect(result[2]).toBeCloseTo(50, 2);
  });

  it('percentages sum to 100 (±0.01)', () => {
    const values = [10, 20, 30, 40];
    const result = computePercentOfTotal(values);
    const sum = result.reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('handles zero total gracefully (returns 0% for all)', () => {
    const result = computePercentOfTotal([0, 0, 0]);
    expect(result).toEqual([0, 0, 0]);
  });

  it('handles negative values using absolute values for total', () => {
    const result = computePercentOfTotal([-10, 20, -30]);
    // Total = |−10| + |20| + |−30| = 60
    expect(result[0]).toBeCloseTo((10 / 60) * 100, 2);
    expect(result[1]).toBeCloseTo((20 / 60) * 100, 2);
    expect(result[2]).toBeCloseTo((30 / 60) * 100, 2);
  });

  it('percentages sum to 100 with negative values', () => {
    const values = [-5, 15, -10, 20];
    const result = computePercentOfTotal(values);
    const sum = result.reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('handles very small values without precision loss', () => {
    const values = [0.001, 0.002, 0.003];
    const result = computePercentOfTotal(values);
    const sum = result.reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('handles large values', () => {
    const values = [1000000, 2000000, 3000000];
    const result = computePercentOfTotal(values);
    const sum = result.reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('handles mixed zero and non-zero values', () => {
    const result = computePercentOfTotal([0, 50, 0, 50]);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(50, 2);
    expect(result[2]).toBe(0);
    expect(result[3]).toBeCloseTo(50, 2);
  });
});

describe('computePercentOfTotalByGroup', () => {
  it('returns empty array for empty input', () => {
    expect(computePercentOfTotalByGroup([], 'sales')).toEqual([]);
  });

  it('computes percent across all rows when no groupField', () => {
    const rows = [
      { category: 'A', sales: 25 },
      { category: 'B', sales: 25 },
      { category: 'C', sales: 50 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales');

    expect(result[0]).toHaveProperty('sales_pct');
    expect(result[0].sales_pct).toBeCloseTo(25, 2);
    expect(result[1].sales_pct).toBeCloseTo(25, 2);
    expect(result[2].sales_pct).toBeCloseTo(50, 2);
  });

  it('preserves original row data', () => {
    const rows = [
      { category: 'A', sales: 100 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales');

    expect(result[0].category).toBe('A');
    expect(result[0].sales).toBe(100);
    expect(result[0].sales_pct).toBe(100);
  });

  it('computes percent within each group when groupField is provided', () => {
    const rows = [
      { region: 'East', category: 'A', sales: 30 },
      { region: 'East', category: 'B', sales: 70 },
      { region: 'West', category: 'A', sales: 40 },
      { region: 'West', category: 'B', sales: 60 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales', 'region');

    // East group: 30 + 70 = 100
    expect(result[0].sales_pct).toBeCloseTo(30, 2);
    expect(result[1].sales_pct).toBeCloseTo(70, 2);

    // West group: 40 + 60 = 100
    expect(result[2].sales_pct).toBeCloseTo(40, 2);
    expect(result[3].sales_pct).toBeCloseTo(60, 2);
  });

  it('each group sums to 100 (±0.01)', () => {
    const rows = [
      { region: 'East', sales: 10 },
      { region: 'East', sales: 20 },
      { region: 'East', sales: 30 },
      { region: 'West', sales: 15 },
      { region: 'West', sales: 25 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales', 'region');

    const eastSum = result
      .filter((r) => r.region === 'East')
      .reduce((s, r) => s + (r.sales_pct as number), 0);
    expect(Math.abs(eastSum - 100)).toBeLessThanOrEqual(0.01);

    const westSum = result
      .filter((r) => r.region === 'West')
      .reduce((s, r) => s + (r.sales_pct as number), 0);
    expect(Math.abs(westSum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('handles zero values in rows gracefully', () => {
    const rows = [
      { category: 'A', sales: 0 },
      { category: 'B', sales: 0 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales');

    expect(result[0].sales_pct).toBe(0);
    expect(result[1].sales_pct).toBe(0);
  });

  it('handles non-numeric values by treating them as 0', () => {
    const rows = [
      { category: 'A', sales: 'invalid' },
      { category: 'B', sales: 100 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales');

    expect(result[0].sales_pct).toBe(0);
    expect(result[1].sales_pct).toBe(100);
  });

  it('handles null/undefined values by treating them as 0', () => {
    const rows = [
      { category: 'A', sales: null },
      { category: 'B', sales: undefined },
      { category: 'C', sales: 100 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales');

    expect(result[0].sales_pct).toBe(0);
    expect(result[1].sales_pct).toBe(0);
    expect(result[2].sales_pct).toBe(100);
  });

  it('does not mutate original rows', () => {
    const rows = [
      { category: 'A', sales: 50 },
      { category: 'B', sales: 50 },
    ];
    const originalRows = JSON.parse(JSON.stringify(rows));

    computePercentOfTotalByGroup(rows, 'sales');

    expect(rows).toEqual(originalRows);
  });

  it('overall sum is 100 when no groupField', () => {
    const rows = [
      { sales: 7 },
      { sales: 13 },
      { sales: 23 },
      { sales: 37 },
      { sales: 41 },
    ];

    const result = computePercentOfTotalByGroup(rows, 'sales');
    const sum = result.reduce((s, r) => s + (r.sales_pct as number), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });
});
