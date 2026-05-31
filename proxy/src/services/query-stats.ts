import { createLogger } from '../lib/logger.js';

const logger = createLogger('query-stats');

// ============================================================
// TYPES
// ============================================================

export interface QueryExecutionStats {
  id: string;
  sql: string;
  driver: string;
  executionTimeMs: number;
  rowsScanned: number;
  rowsReturned: number;
  indexUsed: boolean;
  timestamp: string;
  connectionId?: string;
  truncated: boolean;
  status: 'success' | 'error';
  errorCode?: string;
}

export interface QueryStatsFilter {
  driver?: string;
  status?: 'success' | 'error';
  minExecutionTimeMs?: number;
  limit?: number;
  offset?: number;
}

export interface QueryStatsSummary {
  totalQueries: number;
  avgExecutionTimeMs: number;
  maxExecutionTimeMs: number;
  totalRowsReturned: number;
  queriesWithIndexUsage: number;
  queriesWithoutIndexUsage: number;
  errorCount: number;
}

// ============================================================
// QUERY STATS STORE
// ============================================================

const MAX_STATS_ENTRIES = 1000;
const DEFAULT_PAGE_LIMIT = 50;

/**
 * In-memory ring buffer for query execution statistics.
 * Stores the last MAX_STATS_ENTRIES query stats.
 */
class QueryStatsStore {
  private stats: QueryExecutionStats[] = [];

  /**
   * Record a new query execution stat entry.
   */
  record(stat: QueryExecutionStats): void {
    this.stats.push(stat);

    if (this.stats.length > MAX_STATS_ENTRIES) {
      this.stats = this.stats.slice(this.stats.length - MAX_STATS_ENTRIES);
    }

    logger.info({
      queryId: stat.id,
      driver: stat.driver,
      executionTimeMs: stat.executionTimeMs,
      rowsReturned: stat.rowsReturned,
      indexUsed: stat.indexUsed,
      status: stat.status,
    }, 'Query stats recorded');
  }

  /**
   * Retrieve stats with optional filtering and pagination.
   */
  getStats(filter?: QueryStatsFilter): {
    stats: QueryExecutionStats[];
    total: number;
    limit: number;
    offset: number;
  } {
    let filtered = [...this.stats];

    if (filter?.driver) {
      filtered = filtered.filter((s) => s.driver === filter.driver);
    }

    if (filter?.status) {
      filtered = filtered.filter((s) => s.status === filter.status);
    }

    if (filter?.minExecutionTimeMs !== undefined) {
      filtered = filtered.filter((s) => s.executionTimeMs >= filter.minExecutionTimeMs!);
    }

    // Sort by timestamp descending (most recent first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = filtered.length;
    const limit = filter?.limit ?? DEFAULT_PAGE_LIMIT;
    const offset = filter?.offset ?? 0;

    const paginated = filtered.slice(offset, offset + limit);

    return { stats: paginated, total, limit, offset };
  }

  /**
   * Get summary statistics across all recorded queries.
   */
  getSummary(): QueryStatsSummary {
    if (this.stats.length === 0) {
      return {
        totalQueries: 0,
        avgExecutionTimeMs: 0,
        maxExecutionTimeMs: 0,
        totalRowsReturned: 0,
        queriesWithIndexUsage: 0,
        queriesWithoutIndexUsage: 0,
        errorCount: 0,
      };
    }

    const totalQueries = this.stats.length;
    const totalExecutionTime = this.stats.reduce((sum, s) => sum + s.executionTimeMs, 0);
    const maxExecutionTimeMs = Math.max(...this.stats.map((s) => s.executionTimeMs));
    const totalRowsReturned = this.stats.reduce((sum, s) => sum + s.rowsReturned, 0);
    const queriesWithIndexUsage = this.stats.filter((s) => s.indexUsed).length;
    const queriesWithoutIndexUsage = this.stats.filter((s) => !s.indexUsed).length;
    const errorCount = this.stats.filter((s) => s.status === 'error').length;

    return {
      totalQueries,
      avgExecutionTimeMs: Math.round(totalExecutionTime / totalQueries),
      maxExecutionTimeMs,
      totalRowsReturned,
      queriesWithIndexUsage,
      queriesWithoutIndexUsage,
      errorCount,
    };
  }

  /**
   * Clear all stored stats. Useful for testing.
   */
  clear(): void {
    this.stats = [];
  }

  /**
   * Get the current number of stored entries.
   */
  get size(): number {
    return this.stats.length;
  }
}

// Singleton instance
export const queryStatsStore = new QueryStatsStore();
