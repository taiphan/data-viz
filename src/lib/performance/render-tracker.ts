import { create } from 'zustand';

// ============================================================
// TYPES
// ============================================================

export interface RenderMetric {
  chartId: string;
  timestamp: number;
  timeToFirstPaint: number;
  timeToInteractive: number;
  totalRenderDuration: number;
}

export interface PerformanceMetricsState {
  metrics: RenderMetric[];
  addMetric: (metric: RenderMetric) => void;
  getMetricsByChart: (chartId: string) => RenderMetric[];
  getLatestMetric: (chartId: string) => RenderMetric | undefined;
  getAverageRenderDuration: (chartId: string) => number;
  clearMetrics: () => void;
  clearMetricsForChart: (chartId: string) => void;
}

// ============================================================
// CONSTANTS
// ============================================================

const MAX_METRICS_PER_CHART = 100;
const MARK_PREFIX = 'chart-render';

// ============================================================
// STORE
// ============================================================

export const usePerformanceMetricsStore = create<PerformanceMetricsState>()(
  (set, get) => ({
    metrics: [],

    addMetric: (metric) =>
      set((state) => {
        const chartMetrics = state.metrics.filter(
          (m) => m.chartId === metric.chartId
        );
        const otherMetrics = state.metrics.filter(
          (m) => m.chartId !== metric.chartId
        );

        // Keep only the most recent metrics per chart
        const trimmedChartMetrics = chartMetrics.length >= MAX_METRICS_PER_CHART
          ? chartMetrics.slice(-(MAX_METRICS_PER_CHART - 1))
          : chartMetrics;

        return {
          metrics: [...otherMetrics, ...trimmedChartMetrics, metric],
        };
      }),

    getMetricsByChart: (chartId) => {
      return get().metrics.filter((m) => m.chartId === chartId);
    },

    getLatestMetric: (chartId) => {
      const chartMetrics = get().metrics.filter((m) => m.chartId === chartId);
      return chartMetrics[chartMetrics.length - 1];
    },

    getAverageRenderDuration: (chartId) => {
      const chartMetrics = get().metrics.filter((m) => m.chartId === chartId);
      if (chartMetrics.length === 0) return 0;
      const total = chartMetrics.reduce(
        (sum, m) => sum + m.totalRenderDuration,
        0
      );
      return total / chartMetrics.length;
    },

    clearMetrics: () => set({ metrics: [] }),

    clearMetricsForChart: (chartId) =>
      set((state) => ({
        metrics: state.metrics.filter((m) => m.chartId !== chartId),
      })),
  })
);

// ============================================================
// RENDER TRACKER — Performance.mark/measure instrumentation
// ============================================================

export interface RenderTracker {
  markRenderStart: () => void;
  markFirstPaint: () => void;
  markInteractive: () => void;
  markRenderEnd: () => void;
  getMetric: () => RenderMetric | null;
}

/**
 * Creates a render tracker for a specific chart render lifecycle.
 * Uses the Performance API (performance.mark/measure) to instrument
 * time-to-first-paint, time-to-interactive, and total render duration.
 */
export function createRenderTracker(chartId: string): RenderTracker {
  const renderSessionId = `${MARK_PREFIX}-${chartId}-${Date.now()}`;

  const marks = {
    start: `${renderSessionId}-start`,
    firstPaint: `${renderSessionId}-first-paint`,
    interactive: `${renderSessionId}-interactive`,
    end: `${renderSessionId}-end`,
  };

  const measures = {
    timeToFirstPaint: `${renderSessionId}-ttfp`,
    timeToInteractive: `${renderSessionId}-tti`,
    totalDuration: `${renderSessionId}-total`,
  };

  let startTime: number | null = null;
  let firstPaintTime: number | null = null;
  let interactiveTime: number | null = null;
  let endTime: number | null = null;

  function markRenderStart(): void {
    startTime = performance.now();
    try {
      performance.mark(marks.start);
    } catch {
      // Silently handle if Performance API is unavailable
    }
  }

  function markFirstPaint(): void {
    firstPaintTime = performance.now();
    try {
      performance.mark(marks.firstPaint);
      performance.measure(measures.timeToFirstPaint, marks.start, marks.firstPaint);
    } catch {
      // Silently handle if Performance API is unavailable
    }
  }

  function markInteractive(): void {
    interactiveTime = performance.now();
    try {
      performance.mark(marks.interactive);
      performance.measure(measures.timeToInteractive, marks.start, marks.interactive);
    } catch {
      // Silently handle if Performance API is unavailable
    }
  }

  function markRenderEnd(): void {
    endTime = performance.now();
    try {
      performance.mark(marks.end);
      performance.measure(measures.totalDuration, marks.start, marks.end);
    } catch {
      // Silently handle if Performance API is unavailable
    }

    const metric = getMetric();
    if (metric) {
      usePerformanceMetricsStore.getState().addMetric(metric);
    }

    // Clean up performance entries
    cleanupMarks();
  }

  function getMetric(): RenderMetric | null {
    if (startTime === null || endTime === null) return null;

    return {
      chartId,
      timestamp: Date.now(),
      timeToFirstPaint: firstPaintTime !== null ? firstPaintTime - startTime : 0,
      timeToInteractive: interactiveTime !== null ? interactiveTime - startTime : 0,
      totalRenderDuration: endTime - startTime,
    };
  }

  function cleanupMarks(): void {
    try {
      performance.clearMarks(marks.start);
      performance.clearMarks(marks.firstPaint);
      performance.clearMarks(marks.interactive);
      performance.clearMarks(marks.end);
      performance.clearMeasures(measures.timeToFirstPaint);
      performance.clearMeasures(measures.timeToInteractive);
      performance.clearMeasures(measures.totalDuration);
    } catch {
      // Silently handle cleanup failures
    }
  }

  return {
    markRenderStart,
    markFirstPaint,
    markInteractive,
    markRenderEnd,
    getMetric,
  };
}

/**
 * Higher-order function that wraps a chart render function with
 * performance instrumentation. Automatically tracks the full
 * render lifecycle.
 */
export function withRenderTracking<T>(
  chartId: string,
  renderFn: (tracker: RenderTracker) => T
): T {
  const tracker = createRenderTracker(chartId);
  tracker.markRenderStart();
  const result = renderFn(tracker);
  return result;
}
