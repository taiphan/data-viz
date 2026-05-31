/**
 * Dashboard Load Time Tracker
 *
 * Tracks full dashboard load time from navigation to all charts rendered,
 * individual chart contribution to total load time, and emits performance
 * events for monitoring.
 */

// ============================================================
// TYPES
// ============================================================

export interface ChartRenderTiming {
  chartId: string;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface DashboardLoadMetrics {
  dashboardId: string;
  navigationStart: number;
  allChartsRendered: number;
  totalLoadTime: number;
  chartTimings: ChartRenderTiming[];
  timestamp: string;
}

export type PerformanceEventType =
  | 'dashboard:load:start'
  | 'dashboard:load:complete'
  | 'chart:render:start'
  | 'chart:render:complete';

export interface PerformanceEvent {
  type: PerformanceEventType;
  dashboardId: string;
  chartId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type PerformanceEventListener = (event: PerformanceEvent) => void;

// ============================================================
// DASHBOARD TRACKER
// ============================================================

export class DashboardTracker {
  private dashboardId: string | null = null;
  private navigationStart: number | null = null;
  private expectedChartIds: Set<string> = new Set();
  private chartTimings: Map<string, { startTime: number; endTime?: number }> = new Map();
  private listeners: PerformanceEventListener[] = [];
  private completedMetrics: DashboardLoadMetrics[] = [];
  private maxStoredMetrics: number;

  constructor(maxStoredMetrics: number = 50) {
    this.maxStoredMetrics = maxStoredMetrics;
  }

  /**
   * Begin tracking a dashboard load. Call when navigation to a dashboard starts.
   */
  startDashboardLoad(dashboardId: string, chartIds: string[]): void {
    this.dashboardId = dashboardId;
    this.navigationStart = performance.now();
    this.expectedChartIds = new Set(chartIds);
    this.chartTimings = new Map();

    this.emit({
      type: 'dashboard:load:start',
      dashboardId,
      timestamp: this.navigationStart,
      metadata: { chartCount: chartIds.length },
    });
  }

  /**
   * Mark the start of an individual chart render.
   */
  startChartRender(chartId: string): void {
    if (!this.dashboardId) return;

    const startTime = performance.now();
    this.chartTimings.set(chartId, { startTime });

    this.emit({
      type: 'chart:render:start',
      dashboardId: this.dashboardId,
      chartId,
      timestamp: startTime,
    });
  }

  /**
   * Mark the completion of an individual chart render.
   * If all expected charts are rendered, finalizes the dashboard load metrics.
   */
  completeChartRender(chartId: string): DashboardLoadMetrics | null {
    if (!this.dashboardId || !this.navigationStart) return null;

    const endTime = performance.now();
    const timing = this.chartTimings.get(chartId);

    if (timing) {
      timing.endTime = endTime;
    } else {
      this.chartTimings.set(chartId, { startTime: endTime, endTime });
    }

    this.emit({
      type: 'chart:render:complete',
      dashboardId: this.dashboardId,
      chartId,
      timestamp: endTime,
      metadata: {
        duration: timing ? endTime - timing.startTime : 0,
      },
    });

    if (this.allChartsRendered()) {
      return this.finalizeDashboardLoad();
    }

    return null;
  }

  /**
   * Subscribe to performance events.
   */
  addEventListener(listener: PerformanceEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get stored metrics history.
   */
  getMetricsHistory(): DashboardLoadMetrics[] {
    return [...this.completedMetrics];
  }

  /**
   * Get the latest completed metrics.
   */
  getLatestMetrics(): DashboardLoadMetrics | null {
    return this.completedMetrics[this.completedMetrics.length - 1] ?? null;
  }

  /**
   * Clear stored metrics.
   */
  clearMetrics(): void {
    this.completedMetrics = [];
  }

  /**
   * Reset the tracker state for a new dashboard load.
   */
  reset(): void {
    this.dashboardId = null;
    this.navigationStart = null;
    this.expectedChartIds = new Set();
    this.chartTimings = new Map();
  }

  // ---- Private helpers ----

  private allChartsRendered(): boolean {
    for (const chartId of this.expectedChartIds) {
      const timing = this.chartTimings.get(chartId);
      if (!timing || timing.endTime === undefined) {
        return false;
      }
    }
    return true;
  }

  private finalizeDashboardLoad(): DashboardLoadMetrics {
    const allChartsRenderedTime = performance.now();

    const chartTimings: ChartRenderTiming[] = [];
    for (const [chartId, timing] of this.chartTimings) {
      chartTimings.push({
        chartId,
        startTime: timing.startTime,
        endTime: timing.endTime ?? allChartsRenderedTime,
        duration: (timing.endTime ?? allChartsRenderedTime) - timing.startTime,
      });
    }

    // Sort by duration descending to show heaviest charts first
    chartTimings.sort((a, b) => b.duration - a.duration);

    const metrics: DashboardLoadMetrics = {
      dashboardId: this.dashboardId!,
      navigationStart: this.navigationStart!,
      allChartsRendered: allChartsRenderedTime,
      totalLoadTime: allChartsRenderedTime - this.navigationStart!,
      chartTimings,
      timestamp: new Date().toISOString(),
    };

    this.storeMetrics(metrics);

    this.emit({
      type: 'dashboard:load:complete',
      dashboardId: this.dashboardId!,
      timestamp: allChartsRenderedTime,
      metadata: {
        totalLoadTime: metrics.totalLoadTime,
        chartCount: chartTimings.length,
        slowestChart: chartTimings[0]?.chartId ?? null,
        slowestChartDuration: chartTimings[0]?.duration ?? 0,
      },
    });

    return metrics;
  }

  private storeMetrics(metrics: DashboardLoadMetrics): void {
    this.completedMetrics.push(metrics);
    if (this.completedMetrics.length > this.maxStoredMetrics) {
      this.completedMetrics = this.completedMetrics.slice(-this.maxStoredMetrics);
    }
  }

  private emit(event: PerformanceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let trackerInstance: DashboardTracker | null = null;

/**
 * Get the global DashboardTracker instance.
 */
export function getDashboardTracker(): DashboardTracker {
  if (!trackerInstance) {
    trackerInstance = new DashboardTracker();
  }
  return trackerInstance;
}

/**
 * Reset the global tracker instance (useful for testing).
 */
export function resetDashboardTracker(): void {
  trackerInstance = null;
}
