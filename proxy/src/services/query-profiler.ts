import { createLogger } from '../lib/logger.js';

const logger = createLogger('query-profiler');

// ============================================================
// CONSTANTS
// ============================================================

const MAX_HISTORY_SIZE = 1000;

// ============================================================
// TYPES
// ============================================================

export interface QueryMetrics {
  id: string;
  sql: string;
  driver: string;
  connectionId: string;
  executionTimeMs: number;
  rowsReturned: number;
  bytesTransferred: number;
  status: 'success' | 'error';
  errorCode?: string;
  timestamp: string;
}

export interface QueryHistoryFilters {
  driver?: string;
  connectionId?: string;
  status?: 'success' | 'error';
  minExecutionTimeMs?: number;
  maxExecutionTimeMs?: number;
  since?: string;
  until?: string;
}

export interface QueryHistoryPage {
  entries: QueryMetrics[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================
// RING BUFFER
// ============================================================

/**
 * Fixed-size ring buffer for storing query history entries.
 * Overwrites oldest entries when capacity is reached.
 */
class RingBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity).fill(undefined);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getAll(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];
    const start = this.count < this.capacity
      ? 0
      : this.head;

    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }

    return result;
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}

// ============================================================
// QUERY PROFILER
// ============================================================

export class QueryProfiler {
  private readonly history: RingBuffer<QueryMetrics>;

  constructor(maxSize: number = MAX_HISTORY_SIZE) {
    this.history = new RingBuffer<QueryMetrics>(maxSize);
  }

  /**
   * Record a completed query with its metrics.
   */
  record(metrics: QueryMetrics): void {
    this.history.push(metrics);

    logger.info({
      queryId: metrics.id,
      driver: metrics.driver,
      executionTimeMs: metrics.executionTimeMs,
      rowsReturned: metrics.rowsReturned,
      status: metrics.status,
    }, 'Query profiled');
  }

  /**
   * Retrieve query history with pagination and optional filters.
   */
  getHistory(
    page: number = 1,
    pageSize: number = 50,
    filters?: QueryHistoryFilters
  ): QueryHistoryPage {
    const validPage = Math.max(1, Math.floor(page));
    const validPageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));

    let entries = this.history.getAll();

    // Apply filters
    if (filters) {
      entries = this.applyFilters(entries, filters);
    }

    // Sort by timestamp descending (most recent first)
    entries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const total = entries.length;
    const totalPages = Math.ceil(total / validPageSize);
    const offset = (validPage - 1) * validPageSize;
    const paginatedEntries = entries.slice(offset, offset + validPageSize);

    return {
      entries: paginatedEntries,
      total,
      page: validPage,
      pageSize: validPageSize,
      totalPages,
    };
  }

  /**
   * Get summary statistics for the profiled queries.
   */
  getStats(): {
    totalQueries: number;
    successCount: number;
    errorCount: number;
    avgExecutionTimeMs: number;
    p95ExecutionTimeMs: number;
    totalBytesTransferred: number;
  } {
    const entries = this.history.getAll();

    if (entries.length === 0) {
      return {
        totalQueries: 0,
        successCount: 0,
        errorCount: 0,
        avgExecutionTimeMs: 0,
        p95ExecutionTimeMs: 0,
        totalBytesTransferred: 0,
      };
    }

    const successCount = entries.filter((e) => e.status === 'success').length;
    const errorCount = entries.filter((e) => e.status === 'error').length;
    const totalBytes = entries.reduce((sum, e) => sum + e.bytesTransferred, 0);

    const executionTimes = entries
      .map((e) => e.executionTimeMs)
      .sort((a, b) => a - b);

    const avgExecutionTimeMs = Math.round(
      executionTimes.reduce((sum, t) => sum + t, 0) / executionTimes.length
    );

    const p95Index = Math.floor(executionTimes.length * 0.95);
    const p95ExecutionTimeMs = executionTimes[p95Index] ?? 0;

    return {
      totalQueries: entries.length,
      successCount,
      errorCount,
      avgExecutionTimeMs,
      p95ExecutionTimeMs,
      totalBytesTransferred: totalBytes,
    };
  }

  /**
   * Clear all query history.
   */
  clear(): void {
    this.history.clear();
  }

  /**
   * Get the current number of entries in the history.
   */
  size(): number {
    return this.history.size();
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private applyFilters(
    entries: QueryMetrics[],
    filters: QueryHistoryFilters
  ): QueryMetrics[] {
    return entries.filter((entry) => {
      if (filters.driver && entry.driver !== filters.driver) {
        return false;
      }

      if (filters.connectionId && entry.connectionId !== filters.connectionId) {
        return false;
      }

      if (filters.status && entry.status !== filters.status) {
        return false;
      }

      if (
        filters.minExecutionTimeMs !== undefined &&
        entry.executionTimeMs < filters.minExecutionTimeMs
      ) {
        return false;
      }

      if (
        filters.maxExecutionTimeMs !== undefined &&
        entry.executionTimeMs > filters.maxExecutionTimeMs
      ) {
        return false;
      }

      if (filters.since) {
        const sinceDate = new Date(filters.since).getTime();
        if (!isNaN(sinceDate) && new Date(entry.timestamp).getTime() < sinceDate) {
          return false;
        }
      }

      if (filters.until) {
        const untilDate = new Date(filters.until).getTime();
        if (!isNaN(untilDate) && new Date(entry.timestamp).getTime() > untilDate) {
          return false;
        }
      }

      return true;
    });
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

export const queryProfiler = new QueryProfiler();
