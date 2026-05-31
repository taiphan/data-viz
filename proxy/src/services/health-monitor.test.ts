import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthMonitor, ErrorRateTracker } from './health-monitor.js';

// Mock dependencies
vi.mock('./connection-manager.js', () => ({
  connectionManager: {
    getActivePools: vi.fn(() => []),
  },
}));

vi.mock('./session-manager.js', () => ({
  sessionManager: {
    getMetrics: vi.fn(() => ({
      activeSessions: 2,
      totalSessions: 10,
      totalQueries: 150,
      totalDataTransferredBytes: 1024000,
      sessions: [],
      timestamp: new Date().toISOString(),
    })),
  },
}));

vi.mock('./scheduler.js', () => ({
  schedulerService: {
    getQueueMetrics: vi.fn(() => Promise.resolve({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
    })),
  },
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('ErrorRateTracker', () => {
  let tracker: ErrorRateTracker;

  beforeEach(() => {
    tracker = new ErrorRateTracker();
  });

  it('starts with zero errors', () => {
    expect(tracker.getTotal()).toBe(0);
    expect(tracker.getLastMinute()).toBe(0);
    expect(tracker.getLast5Minutes()).toBe(0);
  });

  it('records errors and increments counts', () => {
    tracker.record();
    tracker.record();
    tracker.record();

    expect(tracker.getTotal()).toBe(3);
    expect(tracker.getLastMinute()).toBe(3);
    expect(tracker.getLast5Minutes()).toBe(3);
  });

  it('resets all errors', () => {
    tracker.record();
    tracker.record();
    tracker.reset();

    expect(tracker.getTotal()).toBe(0);
    expect(tracker.getLastMinute()).toBe(0);
  });
});

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor();
  });

  describe('getUptimeMs', () => {
    it('returns positive uptime', () => {
      const uptime = monitor.getUptimeMs();
      expect(uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('recordError', () => {
    it('increments error count', () => {
      monitor.recordError();
      monitor.recordError();

      // Verify via health check
      return monitor.getHealthCheck().then((health) => {
        expect(health.metrics.errorRate.lastMinute).toBe(2);
        expect(health.metrics.errorRate.last5Minutes).toBe(2);
      });
    });
  });

  describe('getHealthCheck', () => {
    it('returns structured health check response', async () => {
      const health = await monitor.getHealthCheck();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('version');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('metrics');
      expect(health).toHaveProperty('timestamp');
    });

    it('includes uptime information', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.uptime.ms).toBeGreaterThanOrEqual(0);
      expect(health.uptime.seconds).toBeGreaterThanOrEqual(0);
      expect(typeof health.uptime.formatted).toBe('string');
    });

    it('includes component health checks', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.components.length).toBeGreaterThan(0);
      for (const component of health.components) {
        expect(component).toHaveProperty('name');
        expect(component).toHaveProperty('status');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(component.status);
      }
    });

    it('includes connection pool metrics', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.metrics.connectionPool).toHaveProperty('totalPools');
      expect(health.metrics.connectionPool).toHaveProperty('totalActiveConnections');
      expect(health.metrics.connectionPool).toHaveProperty('maxPoolSize');
    });

    it('includes session metrics', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.metrics.sessions.activeSessions).toBe(2);
      expect(health.metrics.sessions.totalSessions).toBe(10);
      expect(health.metrics.sessions.totalQueries).toBe(150);
    });

    it('includes queue metrics', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.metrics.queue).not.toBeNull();
      expect(health.metrics.queue!.waiting).toBe(5);
      expect(health.metrics.queue!.active).toBe(2);
      expect(health.metrics.queue!.completed).toBe(100);
      expect(health.metrics.queue!.failed).toBe(3);
      expect(health.metrics.queue!.delayed).toBe(1);
    });

    it('includes error rate metrics', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.metrics.errorRate).toHaveProperty('total');
      expect(health.metrics.errorRate).toHaveProperty('lastMinute');
      expect(health.metrics.errorRate).toHaveProperty('last5Minutes');
    });

    it('includes memory metrics', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.metrics.memory.rssMb).toBeGreaterThan(0);
      expect(health.metrics.memory.heapUsedMb).toBeGreaterThan(0);
      expect(health.metrics.memory.heapTotalMb).toBeGreaterThan(0);
    });

    it('includes cpu metrics', async () => {
      const health = await monitor.getHealthCheck();

      expect(health.metrics.cpu.loadAverage).toHaveLength(3);
      expect(health.metrics.cpu.cpuCount).toBeGreaterThan(0);
    });

    it('returns healthy status when all components are healthy', async () => {
      const health = await monitor.getHealthCheck();
      expect(health.status).toBe('healthy');
    });

    it('includes ISO timestamp', async () => {
      const health = await monitor.getHealthCheck();
      expect(health.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getPrometheusMetrics', () => {
    it('returns Prometheus-compatible text format', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(typeof output).toBe('string');
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('includes uptime metric', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(output).toContain('proxy_uptime_seconds');
      expect(output).toContain('# TYPE proxy_uptime_seconds gauge');
    });

    it('includes memory metrics', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(output).toContain('proxy_memory_rss_bytes');
      expect(output).toContain('proxy_memory_heap_used_bytes');
      expect(output).toContain('proxy_memory_heap_total_bytes');
    });

    it('includes connection pool metrics', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(output).toContain('proxy_connection_pools_total');
      expect(output).toContain('proxy_connection_pool_active_connections');
      expect(output).toContain('proxy_connection_pool_max_size');
    });

    it('includes session metrics', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(output).toContain('proxy_sessions_active');
      expect(output).toContain('proxy_sessions_total');
      expect(output).toContain('proxy_queries_total');
    });

    it('includes error rate metrics', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(output).toContain('proxy_errors_last_minute');
      expect(output).toContain('proxy_errors_last_5_minutes');
    });

    it('includes queue metrics when available', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(output).toContain('proxy_queue_waiting');
      expect(output).toContain('proxy_queue_active');
      expect(output).toContain('proxy_queue_completed_total');
      expect(output).toContain('proxy_queue_failed_total');
    });

    it('includes CPU metrics', async () => {
      const output = await monitor.getPrometheusMetrics();

      expect(output).toContain('proxy_cpu_count');
      expect(output).toContain('proxy_cpu_load_average_1m');
      expect(output).toContain('proxy_cpu_load_average_5m');
      expect(output).toContain('proxy_cpu_load_average_15m');
    });

    it('ends with newline', async () => {
      const output = await monitor.getPrometheusMetrics();
      expect(output.endsWith('\n')).toBe(true);
    });
  });
});
