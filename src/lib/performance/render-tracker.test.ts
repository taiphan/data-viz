import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createRenderTracker,
  usePerformanceMetricsStore,
  withRenderTracking,
} from './render-tracker';

describe('render-tracker', () => {
  beforeEach(() => {
    usePerformanceMetricsStore.getState().clearMetrics();
  });

  describe('createRenderTracker', () => {
    it('should create a tracker with all lifecycle methods', () => {
      const tracker = createRenderTracker('chart-1');

      expect(tracker.markRenderStart).toBeDefined();
      expect(tracker.markFirstPaint).toBeDefined();
      expect(tracker.markInteractive).toBeDefined();
      expect(tracker.markRenderEnd).toBeDefined();
      expect(tracker.getMetric).toBeDefined();
    });

    it('should return null metric before render completes', () => {
      const tracker = createRenderTracker('chart-1');
      tracker.markRenderStart();

      expect(tracker.getMetric()).toBeNull();
    });

    it('should track full render lifecycle and produce a metric', () => {
      const tracker = createRenderTracker('chart-1');

      tracker.markRenderStart();
      tracker.markFirstPaint();
      tracker.markInteractive();
      tracker.markRenderEnd();

      const metric = tracker.getMetric();
      expect(metric).not.toBeNull();
      expect(metric!.chartId).toBe('chart-1');
      expect(metric!.timeToFirstPaint).toBeGreaterThanOrEqual(0);
      expect(metric!.timeToInteractive).toBeGreaterThanOrEqual(0);
      expect(metric!.totalRenderDuration).toBeGreaterThanOrEqual(0);
      expect(metric!.timestamp).toBeGreaterThan(0);
    });

    it('should record zero for skipped lifecycle marks', () => {
      const tracker = createRenderTracker('chart-2');

      tracker.markRenderStart();
      // Skip firstPaint and interactive
      tracker.markRenderEnd();

      const metric = tracker.getMetric();
      expect(metric).not.toBeNull();
      expect(metric!.timeToFirstPaint).toBe(0);
      expect(metric!.timeToInteractive).toBe(0);
      expect(metric!.totalRenderDuration).toBeGreaterThanOrEqual(0);
    });

    it('should store metric in the performance store on markRenderEnd', () => {
      const tracker = createRenderTracker('chart-3');

      tracker.markRenderStart();
      tracker.markFirstPaint();
      tracker.markInteractive();
      tracker.markRenderEnd();

      const metrics = usePerformanceMetricsStore.getState().metrics;
      expect(metrics).toHaveLength(1);
      expect(metrics[0].chartId).toBe('chart-3');
    });

    it('should maintain timing order: firstPaint <= interactive <= total', () => {
      const tracker = createRenderTracker('chart-4');

      tracker.markRenderStart();
      tracker.markFirstPaint();
      tracker.markInteractive();
      tracker.markRenderEnd();

      const metric = tracker.getMetric()!;
      expect(metric.timeToFirstPaint).toBeLessThanOrEqual(metric.timeToInteractive);
      expect(metric.timeToInteractive).toBeLessThanOrEqual(metric.totalRenderDuration);
    });
  });

  describe('usePerformanceMetricsStore', () => {
    it('should start with empty metrics', () => {
      const state = usePerformanceMetricsStore.getState();
      expect(state.metrics).toHaveLength(0);
    });

    it('should add metrics', () => {
      const store = usePerformanceMetricsStore.getState();
      store.addMetric({
        chartId: 'chart-a',
        timestamp: Date.now(),
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 30,
      });

      expect(usePerformanceMetricsStore.getState().metrics).toHaveLength(1);
    });

    it('should get metrics by chart id', () => {
      const store = usePerformanceMetricsStore.getState();
      store.addMetric({
        chartId: 'chart-a',
        timestamp: Date.now(),
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 30,
      });
      store.addMetric({
        chartId: 'chart-b',
        timestamp: Date.now(),
        timeToFirstPaint: 15,
        timeToInteractive: 25,
        totalRenderDuration: 35,
      });

      const chartAMetrics = usePerformanceMetricsStore.getState().getMetricsByChart('chart-a');
      expect(chartAMetrics).toHaveLength(1);
      expect(chartAMetrics[0].chartId).toBe('chart-a');
    });

    it('should get latest metric for a chart', () => {
      const store = usePerformanceMetricsStore.getState();
      store.addMetric({
        chartId: 'chart-a',
        timestamp: 1000,
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 30,
      });
      store.addMetric({
        chartId: 'chart-a',
        timestamp: 2000,
        timeToFirstPaint: 12,
        timeToInteractive: 22,
        totalRenderDuration: 32,
      });

      const latest = usePerformanceMetricsStore.getState().getLatestMetric('chart-a');
      expect(latest).toBeDefined();
      expect(latest!.timestamp).toBe(2000);
    });

    it('should return undefined for latest metric of unknown chart', () => {
      const latest = usePerformanceMetricsStore.getState().getLatestMetric('unknown');
      expect(latest).toBeUndefined();
    });

    it('should compute average render duration', () => {
      const store = usePerformanceMetricsStore.getState();
      store.addMetric({
        chartId: 'chart-a',
        timestamp: 1000,
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 30,
      });
      store.addMetric({
        chartId: 'chart-a',
        timestamp: 2000,
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 50,
      });

      const avg = usePerformanceMetricsStore.getState().getAverageRenderDuration('chart-a');
      expect(avg).toBe(40);
    });

    it('should return 0 average for unknown chart', () => {
      const avg = usePerformanceMetricsStore.getState().getAverageRenderDuration('unknown');
      expect(avg).toBe(0);
    });

    it('should clear all metrics', () => {
      const store = usePerformanceMetricsStore.getState();
      store.addMetric({
        chartId: 'chart-a',
        timestamp: 1000,
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 30,
      });
      store.clearMetrics();

      expect(usePerformanceMetricsStore.getState().metrics).toHaveLength(0);
    });

    it('should clear metrics for a specific chart', () => {
      const store = usePerformanceMetricsStore.getState();
      store.addMetric({
        chartId: 'chart-a',
        timestamp: 1000,
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 30,
      });
      store.addMetric({
        chartId: 'chart-b',
        timestamp: 1000,
        timeToFirstPaint: 10,
        timeToInteractive: 20,
        totalRenderDuration: 30,
      });
      store.clearMetricsForChart('chart-a');

      const metrics = usePerformanceMetricsStore.getState().metrics;
      expect(metrics).toHaveLength(1);
      expect(metrics[0].chartId).toBe('chart-b');
    });

    it('should cap metrics per chart at 100', () => {
      const store = usePerformanceMetricsStore.getState();
      for (let i = 0; i < 110; i++) {
        store.addMetric({
          chartId: 'chart-a',
          timestamp: i,
          timeToFirstPaint: i,
          timeToInteractive: i,
          totalRenderDuration: i,
        });
      }

      const chartMetrics = usePerformanceMetricsStore.getState().getMetricsByChart('chart-a');
      expect(chartMetrics.length).toBeLessThanOrEqual(100);
    });
  });

  describe('withRenderTracking', () => {
    it('should wrap a function with render tracking', () => {
      const result = withRenderTracking('chart-wrap', (tracker) => {
        tracker.markFirstPaint();
        tracker.markInteractive();
        tracker.markRenderEnd();
        return 'done';
      });

      expect(result).toBe('done');
      const metrics = usePerformanceMetricsStore.getState().metrics;
      expect(metrics.some((m) => m.chartId === 'chart-wrap')).toBe(true);
    });

    it('should pass the tracker to the render function', () => {
      let receivedTracker: unknown = null;
      withRenderTracking('chart-pass', (tracker) => {
        receivedTracker = tracker;
        tracker.markRenderEnd();
      });

      expect(receivedTracker).not.toBeNull();
      expect(receivedTracker).toHaveProperty('markRenderStart');
      expect(receivedTracker).toHaveProperty('markFirstPaint');
      expect(receivedTracker).toHaveProperty('markInteractive');
      expect(receivedTracker).toHaveProperty('markRenderEnd');
    });
  });
});
