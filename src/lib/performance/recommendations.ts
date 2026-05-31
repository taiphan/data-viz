/**
 * Performance Recommendations Engine
 *
 * Analyzes render metrics and dashboard load metrics to suggest
 * optimizations. Uses threshold-based rules to identify performance
 * bottlenecks and returns typed recommendations with severity,
 * description, and actionable suggestions.
 */

import { type RenderMetric } from './render-tracker';
import { type DashboardLoadMetrics } from './dashboard-tracker';

// ============================================================
// TYPES
// ============================================================

export type RecommendationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type RecommendationCategory =
  | 'render-performance'
  | 'query-performance'
  | 'dashboard-load';

export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  severity: RecommendationSeverity;
  title: string;
  description: string;
  action: string;
  chartId?: string;
  dashboardId?: string;
  metric?: number;
  threshold?: number;
}

export interface QueryMetrics {
  queryId: string;
  rowsScanned: number;
  executionTimeMs: number;
  connectionId?: string;
  query?: string;
}

export interface RecommendationInput {
  renderMetrics?: RenderMetric[];
  dashboardMetrics?: DashboardLoadMetrics[];
  queryMetrics?: QueryMetrics[];
}

// ============================================================
// THRESHOLDS
// ============================================================

export const THRESHOLDS = {
  /** Chart render time above which we recommend optimization (ms) */
  SLOW_RENDER_MS: 2000,
  /** Query row scan count above which we recommend filters/indexes */
  HIGH_ROW_SCAN: 100_000,
  /** Dashboard total load time above which we recommend lazy loading (ms) */
  SLOW_DASHBOARD_MS: 5000,
  /** Critical render time threshold (ms) */
  CRITICAL_RENDER_MS: 5000,
  /** Critical dashboard load threshold (ms) */
  CRITICAL_DASHBOARD_MS: 10_000,
  /** Critical row scan threshold */
  CRITICAL_ROW_SCAN: 1_000_000,
} as const;

// ============================================================
// RECOMMENDATION ENGINE
// ============================================================

/**
 * Analyze render metrics and generate recommendations for slow charts.
 */
export function analyzeRenderMetrics(
  metrics: RenderMetric[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Group metrics by chartId and use the latest metric per chart
  const latestByChart = getLatestMetricsByChart(metrics);

  for (const [chartId, metric] of latestByChart) {
    if (metric.totalRenderDuration >= THRESHOLDS.CRITICAL_RENDER_MS) {
      recommendations.push({
        id: `render-critical-${chartId}`,
        category: 'render-performance',
        severity: 'critical',
        title: `Chart "${chartId}" is critically slow`,
        description:
          `Chart "${chartId}" took ${formatDuration(metric.totalRenderDuration)} to render, ` +
          `far exceeding the ${formatDuration(THRESHOLDS.SLOW_RENDER_MS)} threshold.`,
        action:
          'Consider reducing data points through aggressive sampling, ' +
          'switching to a simpler chart type, or pre-aggregating data server-side.',
        chartId,
        metric: metric.totalRenderDuration,
        threshold: THRESHOLDS.CRITICAL_RENDER_MS,
      });
    } else if (metric.totalRenderDuration >= THRESHOLDS.SLOW_RENDER_MS) {
      recommendations.push({
        id: `render-slow-${chartId}`,
        category: 'render-performance',
        severity: 'high',
        title: `Chart "${chartId}" renders slowly`,
        description:
          `Chart "${chartId}" took ${formatDuration(metric.totalRenderDuration)} to render, ` +
          `exceeding the ${formatDuration(THRESHOLDS.SLOW_RENDER_MS)} threshold.`,
        action:
          'Consider applying data aggregation or sampling to reduce the number of data points rendered.',
        chartId,
        metric: metric.totalRenderDuration,
        threshold: THRESHOLDS.SLOW_RENDER_MS,
      });
    }
  }

  return recommendations;
}

/**
 * Analyze query metrics and generate recommendations for heavy queries.
 */
export function analyzeQueryMetrics(
  metrics: QueryMetrics[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const metric of metrics) {
    if (metric.rowsScanned >= THRESHOLDS.CRITICAL_ROW_SCAN) {
      recommendations.push({
        id: `query-critical-${metric.queryId}`,
        category: 'query-performance',
        severity: 'critical',
        title: `Query "${metric.queryId}" scans too many rows`,
        description:
          `Query scanned ${formatNumber(metric.rowsScanned)} rows, ` +
          `far exceeding the ${formatNumber(THRESHOLDS.HIGH_ROW_SCAN)} row threshold.`,
        action:
          'Add WHERE clause filters to narrow the result set, ' +
          'create database indexes on frequently filtered columns, ' +
          'or use a pre-computed extract.',
        metric: metric.rowsScanned,
        threshold: THRESHOLDS.CRITICAL_ROW_SCAN,
      });
    } else if (metric.rowsScanned >= THRESHOLDS.HIGH_ROW_SCAN) {
      recommendations.push({
        id: `query-heavy-${metric.queryId}`,
        category: 'query-performance',
        severity: 'medium',
        title: `Query "${metric.queryId}" scans many rows`,
        description:
          `Query scanned ${formatNumber(metric.rowsScanned)} rows, ` +
          `exceeding the ${formatNumber(THRESHOLDS.HIGH_ROW_SCAN)} row threshold.`,
        action:
          'Consider adding filters to reduce rows scanned or adding indexes on key columns.',
        metric: metric.rowsScanned,
        threshold: THRESHOLDS.HIGH_ROW_SCAN,
      });
    }
  }

  return recommendations;
}

/**
 * Analyze dashboard load metrics and generate recommendations for slow dashboards.
 */
export function analyzeDashboardMetrics(
  metrics: DashboardLoadMetrics[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Use the latest metric per dashboard
  const latestByDashboard = getLatestDashboardMetrics(metrics);

  for (const [dashboardId, metric] of latestByDashboard) {
    if (metric.totalLoadTime >= THRESHOLDS.CRITICAL_DASHBOARD_MS) {
      recommendations.push({
        id: `dashboard-critical-${dashboardId}`,
        category: 'dashboard-load',
        severity: 'critical',
        title: `Dashboard "${dashboardId}" loads critically slowly`,
        description:
          `Dashboard took ${formatDuration(metric.totalLoadTime)} to load, ` +
          `far exceeding the ${formatDuration(THRESHOLDS.SLOW_DASHBOARD_MS)} threshold.`,
        action:
          'Enable lazy loading for below-the-fold charts, ' +
          'use extract caching for frequently accessed data, ' +
          'and consider splitting into multiple dashboards.',
        dashboardId,
        metric: metric.totalLoadTime,
        threshold: THRESHOLDS.CRITICAL_DASHBOARD_MS,
      });
    } else if (metric.totalLoadTime >= THRESHOLDS.SLOW_DASHBOARD_MS) {
      recommendations.push({
        id: `dashboard-slow-${dashboardId}`,
        category: 'dashboard-load',
        severity: 'high',
        title: `Dashboard "${dashboardId}" loads slowly`,
        description:
          `Dashboard took ${formatDuration(metric.totalLoadTime)} to load, ` +
          `exceeding the ${formatDuration(THRESHOLDS.SLOW_DASHBOARD_MS)} threshold.`,
        action:
          'Consider enabling lazy loading for charts not immediately visible, ' +
          'or use extract caching to speed up data retrieval.',
        dashboardId,
        metric: metric.totalLoadTime,
        threshold: THRESHOLDS.SLOW_DASHBOARD_MS,
      });
    }
  }

  return recommendations;
}

/**
 * Main entry point: analyze all available metrics and produce a combined
 * list of recommendations sorted by severity (critical first).
 */
export function generateRecommendations(
  input: RecommendationInput
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (input.renderMetrics && input.renderMetrics.length > 0) {
    recommendations.push(...analyzeRenderMetrics(input.renderMetrics));
  }

  if (input.queryMetrics && input.queryMetrics.length > 0) {
    recommendations.push(...analyzeQueryMetrics(input.queryMetrics));
  }

  if (input.dashboardMetrics && input.dashboardMetrics.length > 0) {
    recommendations.push(...analyzeDashboardMetrics(input.dashboardMetrics));
  }

  return sortBySeverity(recommendations);
}

// ============================================================
// HELPERS
// ============================================================

const SEVERITY_ORDER: Record<RecommendationSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortBySeverity(recommendations: Recommendation[]): Recommendation[] {
  return [...recommendations].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

function getLatestMetricsByChart(
  metrics: RenderMetric[]
): Map<string, RenderMetric> {
  const map = new Map<string, RenderMetric>();
  for (const metric of metrics) {
    const existing = map.get(metric.chartId);
    if (!existing || metric.timestamp > existing.timestamp) {
      map.set(metric.chartId, metric);
    }
  }
  return map;
}

function getLatestDashboardMetrics(
  metrics: DashboardLoadMetrics[]
): Map<string, DashboardLoadMetrics> {
  const map = new Map<string, DashboardLoadMetrics>();
  for (const metric of metrics) {
    const existing = map.get(metric.dashboardId);
    if (!existing || metric.timestamp > existing.timestamp) {
      map.set(metric.dashboardId, metric);
    }
  }
  return map;
}

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(0)}K`;
  }
  return n.toString();
}
