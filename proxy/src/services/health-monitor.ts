import os from 'node:os';
import { createLogger } from '../lib/logger.js';
import { connectionManager } from './connection-manager.js';
import { sessionManager } from './session-manager.js';
import { schedulerService } from './scheduler.js';

const logger = createLogger('health-monitor');

// ============================================================
// TYPES
// ============================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface HealthCheckResponse {
  status: HealthStatus;
  version: string;
  uptime: {
    ms: number;
    seconds: number;
    formatted: string;
  };
  components: ComponentHealth[];
  metrics: {
    connectionPool: {
      totalPools: number;
      totalActiveConnections: number;
      maxPoolSize: number;
    };
    sessions: {
      activeSessions: number;
      totalSessions: number;
      totalQueries: number;
    };
    queue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    } | null;
    errorRate: {
      total: number;
      lastMinute: number;
      last5Minutes: number;
    };
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
    cpu: {
      loadAverage: number[];
      cpuCount: number;
    };
  };
  timestamp: string;
}

export interface PrometheusMetric {
  name: string;
  help: string;
  type: 'gauge' | 'counter' | 'histogram';
  value: number;
  labels?: Record<string, string>;
}

// ============================================================
// ERROR RATE TRACKER
// ============================================================

class ErrorRateTracker {
  private errors: number[] = [];
  private readonly maxAge = 5 * 60 * 1000; // 5 minutes

  record(): void {
    this.errors.push(Date.now());
    this.prune();
  }

  getTotal(): number {
    this.prune();
    return this.errors.length;
  }

  getLastMinute(): number {
    const cutoff = Date.now() - 60 * 1000;
    this.prune();
    return this.errors.filter((ts) => ts > cutoff).length;
  }

  getLast5Minutes(): number {
    this.prune();
    return this.errors.length;
  }

  reset(): void {
    this.errors = [];
  }

  private prune(): void {
    const cutoff = Date.now() - this.maxAge;
    this.errors = this.errors.filter((ts) => ts > cutoff);
  }
}

// ============================================================
// HEALTH MONITOR SERVICE
// ============================================================

const APP_VERSION = process.env.APP_VERSION || '0.1.0';
const MAX_POOL_SIZE = 10;

class HealthMonitor {
  private startTime: number;
  private errorTracker: ErrorRateTracker;

  constructor() {
    this.startTime = Date.now();
    this.errorTracker = new ErrorRateTracker();
  }

  /**
   * Records an error occurrence for rate tracking.
   */
  recordError(): void {
    this.errorTracker.record();
  }

  /**
   * Resets the error tracker. Used for testing.
   */
  resetErrors(): void {
    this.errorTracker.reset();
  }

  /**
   * Resets the start time. Used for testing.
   */
  resetStartTime(): void {
    this.startTime = Date.now();
  }

  /**
   * Returns the current uptime in milliseconds.
   */
  getUptimeMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Performs a full health check across all components.
   */
  async getHealthCheck(): Promise<HealthCheckResponse> {
    const components = await this.checkComponents();
    const overallStatus = this.deriveOverallStatus(components);
    const uptimeMs = this.getUptimeMs();
    const queueMetrics = await this.getQueueMetrics();
    const memUsage = process.memoryUsage();
    const pools = connectionManager.getActivePools();
    const sessionMetrics = sessionManager.getMetrics();

    const totalActiveConnections = pools.reduce(
      (sum, pool) => sum + pool.activeConnections,
      0,
    );

    return {
      status: overallStatus,
      version: APP_VERSION,
      uptime: {
        ms: uptimeMs,
        seconds: Math.floor(uptimeMs / 1000),
        formatted: this.formatUptime(uptimeMs),
      },
      components,
      metrics: {
        connectionPool: {
          totalPools: pools.length,
          totalActiveConnections,
          maxPoolSize: MAX_POOL_SIZE,
        },
        sessions: {
          activeSessions: sessionMetrics.activeSessions,
          totalSessions: sessionMetrics.totalSessions,
          totalQueries: sessionMetrics.totalQueries,
        },
        queue: queueMetrics,
        errorRate: {
          total: this.errorTracker.getTotal(),
          lastMinute: this.errorTracker.getLastMinute(),
          last5Minutes: this.errorTracker.getLast5Minutes(),
        },
        memory: {
          rssMb: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
          heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
          heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        },
        cpu: {
          loadAverage: os.loadavg(),
          cpuCount: os.cpus().length,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generates Prometheus-compatible metrics text output.
   */
  async getPrometheusMetrics(): Promise<string> {
    const metrics = await this.collectPrometheusMetrics();
    return this.formatPrometheusOutput(metrics);
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private async checkComponents(): Promise<ComponentHealth[]> {
    const components: ComponentHealth[] = [];

    // Check proxy process
    components.push(this.checkProcess());

    // Check connection pool
    components.push(this.checkConnectionPool());

    // Check session manager
    components.push(this.checkSessionManager());

    // Check queue (async)
    components.push(await this.checkQueue());

    return components;
  }

  private checkProcess(): ComponentHealth {
    const memUsage = process.memoryUsage();
    const heapUsedPct = memUsage.heapUsed / memUsage.heapTotal;

    let status: HealthStatus = 'healthy';
    let message: string | undefined;

    if (heapUsedPct > 0.9) {
      status = 'unhealthy';
      message = 'Heap usage exceeds 90%';
    } else if (heapUsedPct > 0.75) {
      status = 'degraded';
      message = 'Heap usage exceeds 75%';
    }

    return {
      name: 'process',
      status,
      message,
      details: {
        heapUsedPct: Math.round(heapUsedPct * 100),
        rssMb: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
      },
    };
  }

  private checkConnectionPool(): ComponentHealth {
    const pools = connectionManager.getActivePools();
    const totalActive = pools.reduce((sum, p) => sum + p.activeConnections, 0);
    const totalCapacity = pools.length * MAX_POOL_SIZE;
    const utilization = totalCapacity > 0 ? totalActive / totalCapacity : 0;

    let status: HealthStatus = 'healthy';
    let message: string | undefined;

    if (utilization > 0.9) {
      status = 'unhealthy';
      message = 'Connection pool utilization exceeds 90%';
    } else if (utilization > 0.7) {
      status = 'degraded';
      message = 'Connection pool utilization exceeds 70%';
    }

    return {
      name: 'connection-pool',
      status,
      message,
      details: {
        totalPools: pools.length,
        totalActiveConnections: totalActive,
        totalCapacity,
        utilizationPct: Math.round(utilization * 100),
      },
    };
  }

  private checkSessionManager(): ComponentHealth {
    const metrics = sessionManager.getMetrics();
    const errorRate = this.errorTracker.getLastMinute();

    let status: HealthStatus = 'healthy';
    let message: string | undefined;

    if (errorRate > 50) {
      status = 'unhealthy';
      message = 'High error rate detected (>50/min)';
    } else if (errorRate > 20) {
      status = 'degraded';
      message = 'Elevated error rate detected (>20/min)';
    }

    return {
      name: 'session-manager',
      status,
      message,
      details: {
        activeSessions: metrics.activeSessions,
        totalSessions: metrics.totalSessions,
        errorsLastMinute: errorRate,
      },
    };
  }

  private async checkQueue(): Promise<ComponentHealth> {
    try {
      const metrics = await schedulerService.getQueueMetrics();

      let status: HealthStatus = 'healthy';
      let message: string | undefined;

      if (metrics.failed > 100) {
        status = 'unhealthy';
        message = 'High number of failed jobs (>100)';
      } else if (metrics.waiting > 1000) {
        status = 'degraded';
        message = 'Queue depth exceeds 1000 waiting jobs';
      } else if (metrics.failed > 20) {
        status = 'degraded';
        message = 'Elevated failed job count (>20)';
      }

      return {
        name: 'queue',
        status,
        message,
        details: {
          waiting: metrics.waiting,
          active: metrics.active,
          completed: metrics.completed,
          failed: metrics.failed,
          delayed: metrics.delayed,
        },
      };
    } catch {
      return {
        name: 'queue',
        status: 'degraded',
        message: 'Queue unavailable (Redis not connected)',
        details: { available: false },
      };
    }
  }

  private deriveOverallStatus(components: ComponentHealth[]): HealthStatus {
    if (components.some((c) => c.status === 'unhealthy')) {
      return 'unhealthy';
    }
    if (components.some((c) => c.status === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  private async getQueueMetrics() {
    try {
      const metrics = await schedulerService.getQueueMetrics();
      return metrics;
    } catch {
      logger.debug('Queue metrics unavailable');
      return null;
    }
  }

  private async collectPrometheusMetrics(): Promise<PrometheusMetric[]> {
    const metrics: PrometheusMetric[] = [];
    const memUsage = process.memoryUsage();
    const pools = connectionManager.getActivePools();
    const sessionMetrics = sessionManager.getMetrics();
    const uptimeMs = this.getUptimeMs();

    // Uptime
    metrics.push({
      name: 'proxy_uptime_seconds',
      help: 'Proxy uptime in seconds',
      type: 'gauge',
      value: Math.floor(uptimeMs / 1000),
    });

    // Memory
    metrics.push({
      name: 'proxy_memory_rss_bytes',
      help: 'Resident set size in bytes',
      type: 'gauge',
      value: memUsage.rss,
    });
    metrics.push({
      name: 'proxy_memory_heap_used_bytes',
      help: 'Heap used in bytes',
      type: 'gauge',
      value: memUsage.heapUsed,
    });
    metrics.push({
      name: 'proxy_memory_heap_total_bytes',
      help: 'Total heap size in bytes',
      type: 'gauge',
      value: memUsage.heapTotal,
    });

    // Connection pool
    const totalActive = pools.reduce((sum, p) => sum + p.activeConnections, 0);
    metrics.push({
      name: 'proxy_connection_pools_total',
      help: 'Total number of connection pools',
      type: 'gauge',
      value: pools.length,
    });
    metrics.push({
      name: 'proxy_connection_pool_active_connections',
      help: 'Total active connections across all pools',
      type: 'gauge',
      value: totalActive,
    });
    metrics.push({
      name: 'proxy_connection_pool_max_size',
      help: 'Maximum pool size per connection',
      type: 'gauge',
      value: MAX_POOL_SIZE,
    });

    // Sessions
    metrics.push({
      name: 'proxy_sessions_active',
      help: 'Number of active sessions',
      type: 'gauge',
      value: sessionMetrics.activeSessions,
    });
    metrics.push({
      name: 'proxy_sessions_total',
      help: 'Total sessions created',
      type: 'counter',
      value: sessionMetrics.totalSessions,
    });
    metrics.push({
      name: 'proxy_queries_total',
      help: 'Total queries executed',
      type: 'counter',
      value: sessionMetrics.totalQueries,
    });
    metrics.push({
      name: 'proxy_data_transferred_bytes',
      help: 'Total data transferred in bytes',
      type: 'counter',
      value: sessionMetrics.totalDataTransferredBytes,
    });

    // Error rates
    metrics.push({
      name: 'proxy_errors_last_minute',
      help: 'Errors in the last minute',
      type: 'gauge',
      value: this.errorTracker.getLastMinute(),
    });
    metrics.push({
      name: 'proxy_errors_last_5_minutes',
      help: 'Errors in the last 5 minutes',
      type: 'gauge',
      value: this.errorTracker.getLast5Minutes(),
    });

    // Queue metrics (if available)
    try {
      const queueMetrics = await schedulerService.getQueueMetrics();
      metrics.push({
        name: 'proxy_queue_waiting',
        help: 'Jobs waiting in queue',
        type: 'gauge',
        value: queueMetrics.waiting,
      });
      metrics.push({
        name: 'proxy_queue_active',
        help: 'Jobs currently being processed',
        type: 'gauge',
        value: queueMetrics.active,
      });
      metrics.push({
        name: 'proxy_queue_completed_total',
        help: 'Total completed jobs',
        type: 'counter',
        value: queueMetrics.completed,
      });
      metrics.push({
        name: 'proxy_queue_failed_total',
        help: 'Total failed jobs',
        type: 'counter',
        value: queueMetrics.failed,
      });
      metrics.push({
        name: 'proxy_queue_delayed',
        help: 'Jobs in delayed state',
        type: 'gauge',
        value: queueMetrics.delayed,
      });
    } catch {
      // Queue unavailable — skip queue metrics
    }

    // CPU
    metrics.push({
      name: 'proxy_cpu_count',
      help: 'Number of CPU cores',
      type: 'gauge',
      value: os.cpus().length,
    });

    const loadAvg = os.loadavg();
    metrics.push({
      name: 'proxy_cpu_load_average_1m',
      help: '1-minute load average',
      type: 'gauge',
      value: loadAvg[0],
    });
    metrics.push({
      name: 'proxy_cpu_load_average_5m',
      help: '5-minute load average',
      type: 'gauge',
      value: loadAvg[1],
    });
    metrics.push({
      name: 'proxy_cpu_load_average_15m',
      help: '15-minute load average',
      type: 'gauge',
      value: loadAvg[2],
    });

    return metrics;
  }

  private formatPrometheusOutput(metrics: PrometheusMetric[]): string {
    const lines: string[] = [];

    for (const metric of metrics) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.labels && Object.keys(metric.labels).length > 0) {
        const labelStr = Object.entries(metric.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        lines.push(`${metric.name}{${labelStr}} ${metric.value}`);
      } else {
        lines.push(`${metric.name} ${metric.value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

// Singleton instance
export const healthMonitor = new HealthMonitor();

// Export class for testing
export { HealthMonitor, ErrorRateTracker };
