// ============================================================
// Statistical Insights Engine
// Client-side statistical analysis for AI-assisted insights
// Requirements: 15.1, 15.2, 15.4
// ============================================================

export type InsightType = 'top' | 'bottom' | 'outlier' | 'trend' | 'change';

export interface Insight {
  type: InsightType;
  description: string;
  value?: number;
  label?: string;
}

export interface InsightInput {
  values: number[];
  labels?: string[];
}

// ============================================================
// Statistical Helpers
// ============================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Simple linear regression: y = slope * x + intercept
 * x values are indices [0, 1, 2, ...]
 */
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  const xMean = (n - 1) / 2;
  const yMean = mean(values);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  return { slope, intercept };
}

type TrendDirection = 'increasing' | 'decreasing' | 'flat';

function detectTrendDirection(values: number[]): TrendDirection {
  if (values.length < 2) return 'flat';

  const { slope } = linearRegression(values);
  const avg = mean(values);
  const range = Math.max(...values) - Math.min(...values);

  if (range === 0) return 'flat';

  // Total predicted change over the series
  const totalChange = Math.abs(slope) * (values.length - 1);

  // Trend is significant if the total change accounts for a substantial
  // portion of the data range (>50%) — this filters out noise
  const rangeRatio = totalChange / range;

  // Also check against the mean to handle cases where range is large
  // but the trend is still meaningful
  const meanRatio = avg !== 0 ? totalChange / Math.abs(avg) : totalChange;

  if (rangeRatio > 0.5 || meanRatio > 0.1) {
    return slope > 0 ? 'increasing' : 'decreasing';
  }

  return 'flat';
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

// ============================================================
// Insight Detectors
// ============================================================

function detectTopValues(
  values: number[],
  labels?: string[],
  count: number = 3
): Insight[] {
  if (values.length === 0) return [];

  const indexed = values.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => b.value - a.value);

  const topN = indexed.slice(0, Math.min(count, values.length));

  return topN.map((item) => {
    const label = labels?.[item.index];
    const description = label
      ? `${label} has the highest value at ${formatValue(item.value)}`
      : `Value peaked at ${formatValue(item.value)} at position ${item.index + 1}`;

    return {
      type: 'top' as const,
      description,
      value: item.value,
      label,
    };
  });
}

function detectBottomValues(
  values: number[],
  labels?: string[],
  count: number = 3
): Insight[] {
  if (values.length === 0) return [];

  const indexed = values.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const bottomN = indexed.slice(0, Math.min(count, values.length));

  return bottomN.map((item) => {
    const label = labels?.[item.index];
    const description = label
      ? `${label} has the lowest value at ${formatValue(item.value)}`
      : `Value is lowest at ${formatValue(item.value)} at position ${item.index + 1}`;

    return {
      type: 'bottom' as const,
      description,
      value: item.value,
      label,
    };
  });
}

function detectOutliers(values: number[], labels?: string[]): Insight[] {
  if (values.length < 3) return [];

  const avg = mean(values);
  const stdDev = standardDeviation(values);

  if (stdDev === 0) return [];

  const insights: Insight[] = [];

  for (let i = 0; i < values.length; i++) {
    const zScore = Math.abs(values[i] - avg) / stdDev;
    if (zScore > 2) {
      const label = labels?.[i];
      const direction = values[i] > avg ? 'above' : 'below';
      const description = label
        ? `${label} is an outlier at ${formatValue(values[i])} (${zScore.toFixed(1)} std dev ${direction} mean)`
        : `Value ${formatValue(values[i])} at position ${i + 1} is an outlier (${zScore.toFixed(1)} std dev ${direction} mean)`;

      insights.push({
        type: 'outlier',
        description,
        value: values[i],
        label,
      });
    }
  }

  return insights;
}

function detectTrend(values: number[], labels?: string[]): Insight[] {
  if (values.length < 2) return [];

  const direction = detectTrendDirection(values);

  if (direction === 'flat') return [];

  const trendWord = direction === 'increasing' ? 'upward' : 'downward';
  const firstLabel = labels?.[0];
  const lastLabel = labels?.[labels.length - 1];

  let description: string;
  if (firstLabel && lastLabel) {
    description = `Data shows an ${trendWord} trend from ${firstLabel} to ${lastLabel}`;
  } else {
    description = `Data shows an ${trendWord} trend`;
  }

  return [{
    type: 'trend',
    description,
  }];
}

function detectSignificantChanges(
  values: number[],
  labels?: string[]
): Insight[] {
  if (values.length < 2) return [];

  const insights: Insight[] = [];
  const CHANGE_THRESHOLD = 0.2; // 20% change

  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];

    // Skip if previous value is zero (can't compute percentage change)
    if (prev === 0) continue;

    const percentChange = (curr - prev) / Math.abs(prev);

    if (Math.abs(percentChange) > CHANGE_THRESHOLD) {
      const direction = percentChange > 0 ? 'increased' : 'decreased';
      const pctStr = `${Math.abs(percentChange * 100).toFixed(1)}%`;
      const currLabel = labels?.[i];
      const prevLabel = labels?.[i - 1];

      let description: string;
      if (currLabel && prevLabel) {
        description = `${direction === 'increased' ? 'Significant increase' : 'Significant decrease'} of ${pctStr} from ${prevLabel} to ${currLabel}`;
      } else {
        description = `Value ${direction} by ${pctStr} at position ${i + 1}`;
      }

      insights.push({
        type: 'change',
        description,
        value: curr,
        label: currLabel,
      });
    }
  }

  return insights;
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Generate statistical insights from a numeric data series.
 *
 * Detects:
 * - Top N values (highest)
 * - Bottom N values (lowest)
 * - Outliers (values > 2 standard deviations from mean)
 * - Trend direction (increasing, decreasing, flat) via linear regression
 * - Significant changes (>20% change between consecutive values)
 *
 * @param data - Object with numeric values array and optional labels
 * @returns Array of Insight objects with natural language descriptions
 */
export function generateInsights(data: InsightInput): Insight[] {
  const { values, labels } = data;

  if (values.length === 0) return [];

  const insights: Insight[] = [];

  // Detect top values (limit to top 3)
  insights.push(...detectTopValues(values, labels, 3));

  // Detect bottom values (limit to bottom 3)
  insights.push(...detectBottomValues(values, labels, 3));

  // Detect outliers (>2 std dev from mean)
  insights.push(...detectOutliers(values, labels));

  // Detect trend direction
  insights.push(...detectTrend(values, labels));

  // Detect significant changes (>20% between consecutive values)
  insights.push(...detectSignificantChanges(values, labels));

  return insights;
}

// Export helpers for testing
export { mean, standardDeviation, linearRegression, detectTrendDirection, formatValue };
