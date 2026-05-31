import { createLogger } from '../lib/logger.js';

const logger = createLogger('query-history');

// ============================================================
// CONSTANTS
// ============================================================

const MAX_QUERIES_PER_USER = 500;
const SLOW_QUERY_THRESHOLD_MS = 5000;

// ============================================================
// TYPES
// ============================================================

export interface QueryHistoryEntry {
  id: string;
  userId: string;
  sql: string;
  executionTimeMs: number;
  rowsReturned: number;
  timestamp: string;
  connectionId: string;
  driver: string;
  status: 'success' | 'error';
  errorMessage?: string;
  isSlow: boolean;
}

export interface QueryHistoryFilters {
  userId?: string;
  search?: string;
  connectionId?: string;
  driver?: string;
  status?: 'success' | 'error';
  slowOnly?: boolean;
  since?: string;
  until?: string;
}

export type QueryHistorySortField =
  | 'timestamp'
  | 'executionTimeMs'
  | 'rowsReturned';

export type QueryHistorySortOrder = 'asc' | 'desc';

export interface QueryHistorySort {
  field: QueryHistorySortField;
  order: QueryHistorySortOrder;
}

export interface QueryHistoryPage {
  entries: QueryHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  slowCount: number;
  failedCount: number;
}

// ============================================================
// RING BUFFER (per-user)
// ============================================================

/**
 * Fixed-size ring buffer for storing query history entries per user.
 * Overwrites oldest entries when capacity is reached.
 */
class UserRingBuffer {
  private readonly buffer: (QueryHistoryEntry | undefined)[];
  private head = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity).fill(undefined);
  }

  push(item: QueryHistoryEntry): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getAll(): QueryHistoryEntry[] {
    if (this.count === 0) return [];

    const result: QueryHistoryEntry[] = [];
    const start = this.count < this.capacity ? 0 : this.head;

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
// QUERY HISTORY SERVICE
// ============================================================

export class QueryHistoryService {
  private readonly userBuffers: Map<string, UserRingBuffer> = new Map();
  private readonly maxPerUser: number;
  private readonly slowThresholdMs: number;

  constructor(options?: {
    maxPerUser?: number;
    slowThresholdMs?: number;
  }) {
    this.maxPerUser = options?.maxPerUser ?? MAX_QUERIES_PER_USER;
    this.slowThresholdMs = options?.slowThresholdMs ?? SLOW_QUERY_THRESHOLD_MS;
  }

  /**
   * Record a query execution for a specific user.
   */
  record(entry: Omit<QueryHistoryEntry, 'isSlow'>): void {
    const userId = entry.userId;

    if (!this.userBuffers.has(userId)) {
      this.userBuffers.set(userId, new UserRingBuffer(this.maxPerUser));
    }

    const fullEntry: QueryHistoryEntry = {
      ...entry,
      isSlow: entry.executionTimeMs >= this.slowThresholdMs,
    };

    this.userBuffers.get(userId)!.push(fullEntry);

    logger.info({
      queryId: entry.id,
      userId,
      executionTimeMs: entry.executionTimeMs,
      isSlow: fullEntry.isSlow,
      status: entry.status,
    }, 'Query history recorded');
  }

  /**
   * Retrieve query history with pagination, filtering, search, and sort.
   */
  getHistory(
    page: number = 1,
    pageSize: number = 50,
    filters?: QueryHistoryFilters,
    sort?: QueryHistorySort
  ): QueryHistoryPage {
    const validPage = Math.max(1, Math.floor(page));
    const validPageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));

    // Collect entries from all users or a specific user
    let entries: QueryHistoryEntry[];

    if (filters?.userId) {
      const buffer = this.userBuffers.get(filters.userId);
      entries = buffer ? buffer.getAll() : [];
    } else {
      entries = this.getAllEntries();
    }

    // Apply filters
    if (filters) {
      entries = this.applyFilters(entries, filters);
    }

    // Count slow and failed before pagination
    const slowCount = entries.filter((e) => e.isSlow).length;
    const failedCount = entries.filter((e) => e.status === 'error').length;

    // Apply sort
    entries = this.applySort(entries, sort);

    // Paginate
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
      slowCount,
      failedCount,
    };
  }

  /**
   * Get the number of tracked users.
   */
  getUserCount(): number {
    return this.userBuffers.size;
  }

  /**
   * Get the total number of entries across all users.
   */
  getTotalEntries(): number {
    let total = 0;
    for (const buffer of this.userBuffers.values()) {
      total += buffer.size();
    }
    return total;
  }

  /**
   * Get entries for a specific user.
   */
  getUserEntries(userId: string): QueryHistoryEntry[] {
    const buffer = this.userBuffers.get(userId);
    return buffer ? buffer.getAll() : [];
  }

  /**
   * Clear all history for all users.
   */
  clear(): void {
    this.userBuffers.clear();
  }

  /**
   * Clear history for a specific user.
   */
  clearUser(userId: string): void {
    this.userBuffers.delete(userId);
  }

  /**
   * Get the slow query threshold in milliseconds.
   */
  getSlowThresholdMs(): number {
    return this.slowThresholdMs;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private getAllEntries(): QueryHistoryEntry[] {
    const all: QueryHistoryEntry[] = [];
    for (const buffer of this.userBuffers.values()) {
      all.push(...buffer.getAll());
    }
    return all;
  }

  private applyFilters(
    entries: QueryHistoryEntry[],
    filters: QueryHistoryFilters
  ): QueryHistoryEntry[] {
    return entries.filter((entry) => {
      // userId filter already handled in getHistory

      if (filters.connectionId && entry.connectionId !== filters.connectionId) {
        return false;
      }

      if (filters.driver && entry.driver !== filters.driver) {
        return false;
      }

      if (filters.status && entry.status !== filters.status) {
        return false;
      }

      if (filters.slowOnly && !entry.isSlow) {
        return false;
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!entry.sql.toLowerCase().includes(searchLower)) {
          return false;
        }
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

  private applySort(
    entries: QueryHistoryEntry[],
    sort?: QueryHistorySort
  ): QueryHistoryEntry[] {
    const field = sort?.field ?? 'timestamp';
    const order = sort?.order ?? 'desc';
    const multiplier = order === 'asc' ? 1 : -1;

    return [...entries].sort((a, b) => {
      switch (field) {
        case 'timestamp':
          return multiplier * (
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        case 'executionTimeMs':
          return multiplier * (a.executionTimeMs - b.executionTimeMs);
        case 'rowsReturned':
          return multiplier * (a.rowsReturned - b.rowsReturned);
        default:
          return 0;
      }
    });
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

export const queryHistoryService = new QueryHistoryService();
