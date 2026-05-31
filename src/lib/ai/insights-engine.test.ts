import { describe, it, expect } from 'vitest';
import {
  generateInsights,
  mean,
  standardDeviation,
  linearRegression,
  detectTrendDirection,
  formatValue,
  type Insight,
} from './insights-engine';

// ============================================================
// Statistical Helper Tests
// ============================================================

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the value for single element', () => {
    expect(mean([5])).toBe(5);
  });

  it('computes correct mean for multiple values', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('handles negative values', () => {
    expect(mean([-2, -1, 0, 1, 2])).toBe(0);
  });
});

describe('standardDeviation', () => {
  it('returns 0 for empty array', () => {
    expect(standardDeviation([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(standardDeviation([5])).toBe(0);
  });

  it('returns 0 for identical values', () => {
    expect(standardDeviation([3, 3, 3, 3])).toBe(0);
  });

  it('computes correct standard deviation', () => {
    // Population std dev of [2, 4, 4, 4, 5, 5, 7, 9] = 2
    const result = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeCloseTo(2, 1);
  });
});

describe('linearRegression', () => {
  it('returns zero slope for single value', () => {
    const result = linearRegression([5]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(5);
  });

  it('detects positive slope for increasing values', () => {
    const result = linearRegression([1, 2, 3, 4, 5]);
    expect(result.slope).toBeCloseTo(1, 5);
    expect(result.intercept).toBeCloseTo(1, 5);
  });

  it('detects negative slope for decreasing values', () => {
    const result = linearRegression([5, 4, 3, 2, 1]);
    expect(result.slope).toBeCloseTo(-1, 5);
  });

  it('returns zero slope for constant values', () => {
    const result = linearRegression([3, 3, 3, 3]);
    expect(result.slope).toBe(0);
  });
});

describe('detectTrendDirection', () => {
  it('returns flat for single value', () => {
    expect(detectTrendDirection([5])).toBe('flat');
  });

  it('returns increasing for upward data', () => {
    expect(detectTrendDirection([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('increasing');
  });

  it('returns decreasing for downward data', () => {
    expect(detectTrendDirection([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe('decreasing');
  });

  it('returns flat for constant values', () => {
    expect(detectTrendDirection([5, 5, 5, 5, 5])).toBe('flat');
  });

  it('returns flat for noisy data with no clear trend', () => {
    expect(detectTrendDirection([100, 101, 99, 100, 101, 99, 100])).toBe('flat');
  });
});

describe('formatValue', () => {
  it('formats millions', () => {
    expect(formatValue(1200000)).toBe('1.2M');
  });

  it('formats thousands', () => {
    expect(formatValue(5400)).toBe('5.4K');
  });

  it('formats integers as-is', () => {
    expect(formatValue(42)).toBe('42');
  });

  it('formats decimals to 2 places', () => {
    expect(formatValue(3.14159)).toBe('3.14');
  });

  it('formats negative millions', () => {
    expect(formatValue(-2500000)).toBe('-2.5M');
  });
});

// ============================================================
// generateInsights Tests
// ============================================================

describe('generateInsights', () => {
  it('returns empty array for empty values', () => {
    const result = generateInsights({ values: [] });
    expect(result).toEqual([]);
  });

  it('returns insights for single value', () => {
    const result = generateInsights({ values: [100] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((i) => i.type === 'top')).toBe(true);
  });

  describe('top/bottom detection', () => {
    it('identifies top values', () => {
      const result = generateInsights({
        values: [10, 50, 30, 80, 20],
        labels: ['A', 'B', 'C', 'D', 'E'],
      });

      const topInsights = result.filter((i) => i.type === 'top');
      expect(topInsights.length).toBe(3);
      expect(topInsights[0].value).toBe(80);
      expect(topInsights[0].label).toBe('D');
    });

    it('identifies bottom values', () => {
      const result = generateInsights({
        values: [10, 50, 30, 80, 20],
        labels: ['A', 'B', 'C', 'D', 'E'],
      });

      const bottomInsights = result.filter((i) => i.type === 'bottom');
      expect(bottomInsights.length).toBe(3);
      expect(bottomInsights[0].value).toBe(10);
      expect(bottomInsights[0].label).toBe('A');
    });

    it('limits top/bottom to available values when fewer than 3', () => {
      const result = generateInsights({ values: [10, 20] });
      const topInsights = result.filter((i) => i.type === 'top');
      const bottomInsights = result.filter((i) => i.type === 'bottom');
      expect(topInsights.length).toBe(2);
      expect(bottomInsights.length).toBe(2);
    });
  });

  describe('outlier detection', () => {
    it('detects outliers beyond 2 standard deviations', () => {
      // Values: mostly around 10, with one extreme outlier at 100
      const values = [10, 11, 9, 10, 12, 10, 11, 9, 10, 100];
      const result = generateInsights({ values });

      const outliers = result.filter((i) => i.type === 'outlier');
      expect(outliers.length).toBeGreaterThan(0);
      expect(outliers.some((o) => o.value === 100)).toBe(true);
    });

    it('does not flag outliers when all values are similar', () => {
      const values = [10, 11, 10, 11, 10, 11, 10, 11];
      const result = generateInsights({ values });

      const outliers = result.filter((i) => i.type === 'outlier');
      expect(outliers.length).toBe(0);
    });

    it('does not detect outliers with fewer than 3 values', () => {
      const result = generateInsights({ values: [1, 100] });
      const outliers = result.filter((i) => i.type === 'outlier');
      expect(outliers.length).toBe(0);
    });

    it('includes label in outlier description when provided', () => {
      const values = [10, 11, 9, 10, 12, 10, 11, 9, 10, 100];
      const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
      const result = generateInsights({ values, labels });

      const outliers = result.filter((i) => i.type === 'outlier');
      expect(outliers.some((o) => o.description.includes('Oct'))).toBe(true);
    });
  });

  describe('trend detection', () => {
    it('detects increasing trend', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const result = generateInsights({ values });

      const trends = result.filter((i) => i.type === 'trend');
      expect(trends.length).toBe(1);
      expect(trends[0].description).toContain('upward');
    });

    it('detects decreasing trend', () => {
      const values = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
      const result = generateInsights({ values });

      const trends = result.filter((i) => i.type === 'trend');
      expect(trends.length).toBe(1);
      expect(trends[0].description).toContain('downward');
    });

    it('does not report trend for flat data', () => {
      const values = [50, 50, 50, 50, 50];
      const result = generateInsights({ values });

      const trends = result.filter((i) => i.type === 'trend');
      expect(trends.length).toBe(0);
    });

    it('includes labels in trend description', () => {
      const values = [10, 20, 30, 40, 50];
      const labels = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
      const result = generateInsights({ values, labels });

      const trends = result.filter((i) => i.type === 'trend');
      expect(trends[0].description).toContain('Q1');
      expect(trends[0].description).toContain('Q5');
    });
  });

  describe('significant change detection', () => {
    it('detects >20% increase between consecutive values', () => {
      const values = [100, 100, 100, 150, 100];
      const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
      const result = generateInsights({ values, labels });

      const changes = result.filter((i) => i.type === 'change');
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.description.includes('increase'))).toBe(true);
    });

    it('detects >20% decrease between consecutive values', () => {
      const values = [100, 100, 100, 70, 100];
      const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
      const result = generateInsights({ values, labels });

      const changes = result.filter((i) => i.type === 'change');
      expect(changes.some((c) => c.description.includes('decrease'))).toBe(true);
    });

    it('does not flag changes <= 20%', () => {
      const values = [100, 110, 105, 108, 112];
      const result = generateInsights({ values });

      const changes = result.filter((i) => i.type === 'change');
      expect(changes.length).toBe(0);
    });

    it('skips change detection when previous value is zero', () => {
      const values = [0, 100, 200];
      const result = generateInsights({ values });

      const changes = result.filter((i) => i.type === 'change');
      // First change (0 -> 100) should be skipped, second (100 -> 200) is 100% increase
      expect(changes.every((c) => c.value !== 100 || c.description.includes('position 3'))).toBe(true);
    });
  });

  describe('natural language descriptions', () => {
    it('generates human-readable descriptions for top values with labels', () => {
      const result = generateInsights({
        values: [500000, 1200000, 800000, 300000],
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      });

      const topInsights = result.filter((i) => i.type === 'top');
      expect(topInsights[0].description).toContain('Q2');
      expect(topInsights[0].description).toContain('1.2M');
    });

    it('generates position-based descriptions without labels', () => {
      const result = generateInsights({
        values: [10, 50, 30],
      });

      const topInsights = result.filter((i) => i.type === 'top');
      expect(topInsights[0].description).toContain('position');
    });

    it('includes percentage in change descriptions', () => {
      const values = [100, 200];
      const labels = ['Before', 'After'];
      const result = generateInsights({ values, labels });

      const changes = result.filter((i) => i.type === 'change');
      expect(changes.length).toBe(1);
      expect(changes[0].description).toContain('100.0%');
    });
  });

  describe('edge cases', () => {
    it('handles all identical values', () => {
      const result = generateInsights({ values: [5, 5, 5, 5, 5] });
      // Should not crash, no outliers, no trend
      const outliers = result.filter((i) => i.type === 'outlier');
      const trends = result.filter((i) => i.type === 'trend');
      expect(outliers.length).toBe(0);
      expect(trends.length).toBe(0);
    });

    it('handles negative values', () => {
      const result = generateInsights({
        values: [-100, -50, -10, 0, 10, 50, 100],
      });
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles very large datasets', () => {
      const values = Array.from({ length: 1000 }, (_, i) => i);
      const result = generateInsights({ values });
      expect(result.length).toBeGreaterThan(0);
      const trends = result.filter((i) => i.type === 'trend');
      expect(trends.length).toBe(1);
      expect(trends[0].description).toContain('upward');
    });

    it('handles two values', () => {
      const result = generateInsights({ values: [10, 20] });
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
