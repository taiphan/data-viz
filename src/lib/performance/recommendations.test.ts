import { describe, it, expect } from 'vitest';
import {
  analyzeRenderMetrics,
  analyzeQueryMetrics,
  analyzeDashboardMetrics,
  generateRecommendations,
  THRESHOLDS,
  type QueryMetrics,
  type Recommendation,
} from './recommendations';
import { type RenderMetric } from './render-tracker';
import { type DashboardLoadMetrics } from './dashboard-tracker';

describe('recommendations', () => {
  describe('analyzeRenderMetrics', () => {
    it('should return no recommendations for fast charts', () => {
      const metrics: RenderMetric[] = [
        {
          chartId: 'chart-1',
          timestamp: 1000,
          timeToFirstPaint: 50,
          timeToInteractive: 100,
          totalRenderDuration: 200,
        },
      ];

      const result = analyzeRenderMetrics(metrics);
      expect(result).toHaveLength(0);
    });

    it('should recommend aggregation for charts taking >2s to render', () => {
      const metrics: RenderMetric[] = [
        {
          chartId: 'slow-chart',
          timestamp: 1000,
          timeToFirstPaint: 500,
          timeToInteractive: 1500,
          totalRenderDuration: 2500,
        },
      ];

      const result = analyzeRenderMetrics(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('render-performance');
      expect(result[0].severity).toBe('high');
      expect(result[0].chartId).toBe('slow-chart');
      expect(result[0].action).toContain('aggregation');
      expect(result[0].metric).toBe(2500);
      expect(result[0].threshold).toBe(THRESHOLDS.SLOW_RENDER_MS);
    });

    it('should flag critical severity for charts taking >5s', () => {
      const metrics: RenderMetric[] = [
        {
          chartId: 'very-slow-chart',
          timestamp: 1000,
          timeToFirstPaint: 1000,
          timeToInteractive: 3000,
          totalRenderDuration: 6000,
        },
      ];

      const result = analyzeRenderMetrics(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('critical');
      expect(result[0].chartId).toBe('very-slow-chart');
    });

    it('should use the latest metric per chart when multiple exist', () => {
      const metrics: RenderMetric[] = [
        {
          chartId: 'chart-1',
          timestamp: 1000,
          timeToFirstPaint: 500,
          timeToInteractive: 1500,
          totalRenderDuration: 3000, // slow
        },
        {
          chartId: 'chart-1',
          timestamp: 2000,
          timeToFirstPaint: 50,
          timeToInteractive: 100,
          totalRenderDuration: 150, // fast (latest)
        },
      ];

      const result = analyzeRenderMetrics(metrics);
      expect(result).toHaveLength(0);
    });

    it('should generate recommendations for multiple slow charts', () => {
      const metrics: RenderMetric[] = [
        {
          chartId: 'chart-a',
          timestamp: 1000,
          timeToFirstPaint: 500,
          timeToInteractive: 1500,
          totalRenderDuration: 2500,
        },
        {
          chartId: 'chart-b',
          timestamp: 1000,
          timeToFirstPaint: 800,
          timeToInteractive: 2000,
          totalRenderDuration: 3500,
        },
      ];

      const result = analyzeRenderMetrics(metrics);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.chartId)).toContain('chart-a');
      expect(result.map((r) => r.chartId)).toContain('chart-b');
    });

    it('should not flag charts at exactly the threshold', () => {
      const metrics: RenderMetric[] = [
        {
          chartId: 'borderline',
          timestamp: 1000,
          timeToFirstPaint: 500,
          timeToInteractive: 1000,
          totalRenderDuration: THRESHOLDS.SLOW_RENDER_MS,
        },
      ];

      const result = analyzeRenderMetrics(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('high');
    });
  });

  describe('analyzeQueryMetrics', () => {
    it('should return no recommendations for small queries', () => {
      const metrics: QueryMetrics[] = [
        { queryId: 'q1', rowsScanned: 500, executionTimeMs: 100 },
      ];

      const result = analyzeQueryMetrics(metrics);
      expect(result).toHaveLength(0);
    });

    it('should recommend filters for queries scanning >100K rows', () => {
      const metrics: QueryMetrics[] = [
        { queryId: 'heavy-query', rowsScanned: 150_000, executionTimeMs: 3000 },
      ];

      const result = analyzeQueryMetrics(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('query-performance');
      expect(result[0].severity).toBe('medium');
      expect(result[0].action).toContain('filter');
      expect(result[0].metric).toBe(150_000);
      expect(result[0].threshold).toBe(THRESHOLDS.HIGH_ROW_SCAN);
    });

    it('should flag critical severity for queries scanning >1M rows', () => {
      const metrics: QueryMetrics[] = [
        { queryId: 'massive-query', rowsScanned: 2_000_000, executionTimeMs: 10000 },
      ];

      const result = analyzeQueryMetrics(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('critical');
      expect(result[0].action).toContain('index');
    });

    it('should handle multiple queries with different severities', () => {
      const metrics: QueryMetrics[] = [
        { queryId: 'q1', rowsScanned: 50_000, executionTimeMs: 500 },
        { queryId: 'q2', rowsScanned: 200_000, executionTimeMs: 3000 },
        { queryId: 'q3', rowsScanned: 1_500_000, executionTimeMs: 15000 },
      ];

      const result = analyzeQueryMetrics(metrics);
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.id.includes('q2'))?.severity).toBe('medium');
      expect(result.find((r) => r.id.includes('q3'))?.severity).toBe('critical');
    });

    it('should not flag queries below the threshold', () => {
      const metrics: QueryMetrics[] = [
        { queryId: 'q1', rowsScanned: 99_999, executionTimeMs: 2000 },
      ];

      const result = analyzeQueryMetrics(metrics);
      expect(result).toHaveLength(0);
    });
  });

  describe('analyzeDashboardMetrics', () => {
    it('should return no recommendations for fast dashboards', () => {
      const metrics: DashboardLoadMetrics[] = [
        {
          dashboardId: 'dash-1',
          navigationStart: 0,
          allChartsRendered: 2000,
          totalLoadTime: 2000,
          chartTimings: [],
          timestamp: new Date().toISOString(),
        },
      ];

      const result = analyzeDashboardMetrics(metrics);
      expect(result).toHaveLength(0);
    });

    it('should recommend lazy loading for dashboards taking >5s', () => {
      const metrics: DashboardLoadMetrics[] = [
        {
          dashboardId: 'slow-dash',
          navigationStart: 0,
          allChartsRendered: 6000,
          totalLoadTime: 6000,
          chartTimings: [],
          timestamp: new Date().toISOString(),
        },
      ];

      const result = analyzeDashboardMetrics(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('dashboard-load');
      expect(result[0].severity).toBe('high');
      expect(result[0].dashboardId).toBe('slow-dash');
      expect(result[0].action).toContain('lazy loading');
      expect(result[0].metric).toBe(6000);
      expect(result[0].threshold).toBe(THRESHOLDS.SLOW_DASHBOARD_MS);
    });

    it('should flag critical severity for dashboards taking >10s', () => {
      const metrics: DashboardLoadMetrics[] = [
        {
          dashboardId: 'very-slow-dash',
          navigationStart: 0,
          allChartsRendered: 12000,
          totalLoadTime: 12000,
          chartTimings: [],
          timestamp: new Date().toISOString(),
        },
      ];

      const result = analyzeDashboardMetrics(metrics);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('critical');
      expect(result[0].action).toContain('lazy loading');
      expect(result[0].action).toContain('extract caching');
    });

    it('should use the latest metric per dashboard', () => {
      const metrics: DashboardLoadMetrics[] = [
        {
          dashboardId: 'dash-1',
          navigationStart: 0,
          allChartsRendered: 7000,
          totalLoadTime: 7000,
          chartTimings: [],
          timestamp: '2024-01-01T00:00:00.000Z',
        },
        {
          dashboardId: 'dash-1',
          navigationStart: 0,
          allChartsRendered: 2000,
          totalLoadTime: 2000,
          chartTimings: [],
          timestamp: '2024-01-02T00:00:00.000Z',
        },
      ];

      const result = analyzeDashboardMetrics(metrics);
      // Latest metric (2s) is below threshold
      expect(result).toHaveLength(0);
    });
  });

  describe('generateRecommendations', () => {
    it('should return empty array when no metrics provided', () => {
      const result = generateRecommendations({});
      expect(result).toHaveLength(0);
    });

    it('should return empty array when all metrics are within thresholds', () => {
      const result = generateRecommendations({
        renderMetrics: [
          {
            chartId: 'chart-1',
            timestamp: 1000,
            timeToFirstPaint: 50,
            timeToInteractive: 100,
            totalRenderDuration: 500,
          },
        ],
        queryMetrics: [
          { queryId: 'q1', rowsScanned: 1000, executionTimeMs: 50 },
        ],
        dashboardMetrics: [
          {
            dashboardId: 'dash-1',
            navigationStart: 0,
            allChartsRendered: 1000,
            totalLoadTime: 1000,
            chartTimings: [],
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result).toHaveLength(0);
    });

    it('should combine recommendations from all sources', () => {
      const result = generateRecommendations({
        renderMetrics: [
          {
            chartId: 'slow-chart',
            timestamp: 1000,
            timeToFirstPaint: 500,
            timeToInteractive: 1500,
            totalRenderDuration: 3000,
          },
        ],
        queryMetrics: [
          { queryId: 'heavy-query', rowsScanned: 200_000, executionTimeMs: 5000 },
        ],
        dashboardMetrics: [
          {
            dashboardId: 'slow-dash',
            navigationStart: 0,
            allChartsRendered: 7000,
            totalLoadTime: 7000,
            chartTimings: [],
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result).toHaveLength(3);
      const categories = result.map((r) => r.category);
      expect(categories).toContain('render-performance');
      expect(categories).toContain('query-performance');
      expect(categories).toContain('dashboard-load');
    });

    it('should sort recommendations by severity (critical first)', () => {
      const result = generateRecommendations({
        renderMetrics: [
          {
            chartId: 'slow-chart',
            timestamp: 1000,
            timeToFirstPaint: 500,
            timeToInteractive: 1500,
            totalRenderDuration: 2500, // high severity
          },
        ],
        queryMetrics: [
          { queryId: 'massive-query', rowsScanned: 2_000_000, executionTimeMs: 15000 }, // critical
        ],
        dashboardMetrics: [
          {
            dashboardId: 'slow-dash',
            navigationStart: 0,
            allChartsRendered: 6000,
            totalLoadTime: 6000, // high severity
            chartTimings: [],
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].severity).toBe('critical');
    });

    it('should handle empty metric arrays gracefully', () => {
      const result = generateRecommendations({
        renderMetrics: [],
        queryMetrics: [],
        dashboardMetrics: [],
      });

      expect(result).toHaveLength(0);
    });

    it('should produce recommendations with all required fields', () => {
      const result = generateRecommendations({
        renderMetrics: [
          {
            chartId: 'chart-1',
            timestamp: 1000,
            timeToFirstPaint: 500,
            timeToInteractive: 1500,
            totalRenderDuration: 3000,
          },
        ],
      });

      expect(result).toHaveLength(1);
      const rec: Recommendation = result[0];
      expect(rec.id).toBeDefined();
      expect(rec.category).toBeDefined();
      expect(rec.severity).toBeDefined();
      expect(rec.title).toBeDefined();
      expect(rec.description).toBeDefined();
      expect(rec.action).toBeDefined();
      expect(rec.title.length).toBeGreaterThan(0);
      expect(rec.description.length).toBeGreaterThan(0);
      expect(rec.action.length).toBeGreaterThan(0);
    });
  });
});
