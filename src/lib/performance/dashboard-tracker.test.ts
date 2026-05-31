import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DashboardTracker,
  getDashboardTracker,
  resetDashboardTracker,
} from './dashboard-tracker';
import type {
  PerformanceEvent,
  PerformanceEventListener,
} from './dashboard-tracker';

describe('DashboardTracker', () => {
  let tracker: DashboardTracker;

  beforeEach(() => {
    tracker = new DashboardTracker();
  });

  describe('startDashboardLoad', () => {
    it('emits dashboard:load:start event', () => {
      const events: PerformanceEvent[] = [];
      tracker.addEventListener((e) => events.push(e));

      tracker.startDashboardLoad('dash-1', ['chart-a', 'chart-b']);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('dashboard:load:start');
      expect(events[0].dashboardId).toBe('dash-1');
      expect(events[0].metadata?.chartCount).toBe(2);
    });
  });

  describe('startChartRender', () => {
    it('emits chart:render:start event', () => {
      const events: PerformanceEvent[] = [];
      tracker.addEventListener((e) => events.push(e));

      tracker.startDashboardLoad('dash-1', ['chart-a']);
      tracker.startChartRender('chart-a');

      const chartStartEvent = events.find((e) => e.type === 'chart:render:start');
      expect(chartStartEvent).toBeDefined();
      expect(chartStartEvent!.chartId).toBe('chart-a');
      expect(chartStartEvent!.dashboardId).toBe('dash-1');
    });

    it('does nothing when no dashboard load is active', () => {
      const events: PerformanceEvent[] = [];
      tracker.addEventListener((e) => events.push(e));

      tracker.startChartRender('chart-a');

      expect(events).toHaveLength(0);
    });
  });

  describe('completeChartRender', () => {
    it('emits chart:render:complete event', () => {
      const events: PerformanceEvent[] = [];
      tracker.addEventListener((e) => events.push(e));

      tracker.startDashboardLoad('dash-1', ['chart-a']);
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      const completeEvent = events.find((e) => e.type === 'chart:render:complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.chartId).toBe('chart-a');
      expect(completeEvent!.metadata?.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns null when no dashboard load is active', () => {
      const result = tracker.completeChartRender('chart-a');
      expect(result).toBeNull();
    });

    it('returns null when not all charts are rendered', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a', 'chart-b']);
      tracker.startChartRender('chart-a');
      const result = tracker.completeChartRender('chart-a');

      expect(result).toBeNull();
    });

    it('returns metrics when all charts are rendered', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a', 'chart-b']);

      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      tracker.startChartRender('chart-b');
      const metrics = tracker.completeChartRender('chart-b');

      expect(metrics).not.toBeNull();
      expect(metrics!.dashboardId).toBe('dash-1');
      expect(metrics!.totalLoadTime).toBeGreaterThanOrEqual(0);
      expect(metrics!.chartTimings).toHaveLength(2);
      expect(metrics!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('handles chart completion without prior start', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a']);
      const metrics = tracker.completeChartRender('chart-a');

      expect(metrics).not.toBeNull();
      expect(metrics!.chartTimings[0].duration).toBe(0);
    });
  });

  describe('dashboard load metrics', () => {
    it('tracks individual chart contribution to total load time', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a', 'chart-b']);

      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      tracker.startChartRender('chart-b');
      const metrics = tracker.completeChartRender('chart-b');

      expect(metrics!.chartTimings).toHaveLength(2);
      for (const timing of metrics!.chartTimings) {
        expect(timing.chartId).toBeDefined();
        expect(timing.startTime).toBeGreaterThan(0);
        expect(timing.endTime).toBeGreaterThanOrEqual(timing.startTime);
        expect(timing.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('sorts chart timings by duration descending', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a', 'chart-b']);

      // chart-a starts and completes quickly
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      // chart-b starts later (simulating a slower chart)
      tracker.startChartRender('chart-b');
      tracker.completeChartRender('chart-b');

      const metrics = tracker.getLatestMetrics();
      // Both charts have very small durations in tests, but order should be maintained
      expect(metrics!.chartTimings[0].duration).toBeGreaterThanOrEqual(
        metrics!.chartTimings[1].duration
      );
    });

    it('emits dashboard:load:complete with metadata', () => {
      const events: PerformanceEvent[] = [];
      tracker.addEventListener((e) => events.push(e));

      tracker.startDashboardLoad('dash-1', ['chart-a']);
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      const loadComplete = events.find((e) => e.type === 'dashboard:load:complete');
      expect(loadComplete).toBeDefined();
      expect(loadComplete!.metadata?.totalLoadTime).toBeGreaterThanOrEqual(0);
      expect(loadComplete!.metadata?.chartCount).toBe(1);
      expect(loadComplete!.metadata?.slowestChart).toBe('chart-a');
    });
  });

  describe('metrics storage', () => {
    it('stores completed metrics in history', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a']);
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      const history = tracker.getMetricsHistory();
      expect(history).toHaveLength(1);
      expect(history[0].dashboardId).toBe('dash-1');
    });

    it('limits stored metrics to maxStoredMetrics', () => {
      const smallTracker = new DashboardTracker(3);

      for (let i = 0; i < 5; i++) {
        smallTracker.startDashboardLoad(`dash-${i}`, ['chart-a']);
        smallTracker.startChartRender('chart-a');
        smallTracker.completeChartRender('chart-a');
      }

      const history = smallTracker.getMetricsHistory();
      expect(history).toHaveLength(3);
      expect(history[0].dashboardId).toBe('dash-2');
      expect(history[2].dashboardId).toBe('dash-4');
    });

    it('getLatestMetrics returns the most recent entry', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a']);
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      tracker.startDashboardLoad('dash-2', ['chart-b']);
      tracker.startChartRender('chart-b');
      tracker.completeChartRender('chart-b');

      const latest = tracker.getLatestMetrics();
      expect(latest!.dashboardId).toBe('dash-2');
    });

    it('getLatestMetrics returns null when no metrics exist', () => {
      expect(tracker.getLatestMetrics()).toBeNull();
    });

    it('clearMetrics removes all stored metrics', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a']);
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      tracker.clearMetrics();
      expect(tracker.getMetricsHistory()).toHaveLength(0);
    });
  });

  describe('event listeners', () => {
    it('supports multiple listeners', () => {
      const events1: PerformanceEvent[] = [];
      const events2: PerformanceEvent[] = [];

      tracker.addEventListener((e) => events1.push(e));
      tracker.addEventListener((e) => events2.push(e));

      tracker.startDashboardLoad('dash-1', ['chart-a']);

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('returns unsubscribe function', () => {
      const events: PerformanceEvent[] = [];
      const unsubscribe = tracker.addEventListener((e) => events.push(e));

      tracker.startDashboardLoad('dash-1', ['chart-a']);
      expect(events).toHaveLength(1);

      unsubscribe();
      tracker.startDashboardLoad('dash-2', ['chart-b']);
      expect(events).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('clears active tracking state', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a', 'chart-b']);
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      tracker.reset();

      // After reset, chart render calls should be no-ops
      const events: PerformanceEvent[] = [];
      tracker.addEventListener((e) => events.push(e));
      tracker.startChartRender('chart-b');

      expect(events).toHaveLength(0);
    });

    it('does not clear stored metrics history', () => {
      tracker.startDashboardLoad('dash-1', ['chart-a']);
      tracker.startChartRender('chart-a');
      tracker.completeChartRender('chart-a');

      tracker.reset();

      expect(tracker.getMetricsHistory()).toHaveLength(1);
    });
  });
});

describe('getDashboardTracker / resetDashboardTracker', () => {
  beforeEach(() => {
    resetDashboardTracker();
  });

  it('returns a singleton instance', () => {
    const t1 = getDashboardTracker();
    const t2 = getDashboardTracker();
    expect(t1).toBe(t2);
  });

  it('resetDashboardTracker creates a new instance', () => {
    const t1 = getDashboardTracker();
    resetDashboardTracker();
    const t2 = getDashboardTracker();
    expect(t1).not.toBe(t2);
  });
});
