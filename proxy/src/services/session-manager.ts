import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('session-manager');

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_QUERIES_PER_MINUTE = 100;

// ============================================================
// TYPES
// ============================================================

export interface SessionInfo {
  sessionId: string;
  userId: string;
  connectionIds: string[];
  createdAt: Date;
  lastActivityAt: Date;
  queriesInWindow: number;
  totalQueries: number;
  dataTransferredBytes: number;
  isActive: boolean;
}

export interface SessionMetrics {
  activeSessions: number;
  totalSessions: number;
  totalQueries: number;
  totalDataTransferredBytes: number;
  sessions: SessionSnapshot[];
  timestamp: string;
}

export interface SessionSnapshot {
  sessionId: string;
  userId: string;
  connectionCount: number;
  queriesPerMinute: number;
  totalQueries: number;
  dataTransferredBytes: number;
  durationMs: number;
  isActive: boolean;
  createdAt: string;
  lastActivityAt: string;
}

export interface SessionManagerConfig {
  maxQueriesPerMinute: number;
  rateLimitWindowMs: number;
}

// ============================================================
// SESSION MANAGER
// ============================================================

class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private userSessionIndex: Map<string, Set<string>> = new Map();
  private queryTimestamps: Map<string, number[]> = new Map();
  private totalSessionsCreated = 0;
  private config: SessionManagerConfig;

  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = {
      maxQueriesPerMinute: config?.maxQueriesPerMinute ?? DEFAULT_MAX_QUERIES_PER_MINUTE,
      rateLimitWindowMs: config?.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
    };
  }

  /**
   * Creates a new session for a user.
   * Returns the sessionId.
   */
  createSession(userId: string): string {
    const sessionId = uuidv4();
    const now = new Date();

    const session: SessionInfo = {
      sessionId,
      userId,
      connectionIds: [],
      createdAt: now,
      lastActivityAt: now,
      queriesInWindow: 0,
      totalQueries: 0,
      dataTransferredBytes: 0,
      isActive: true,
    };

    this.sessions.set(sessionId, session);
    this.queryTimestamps.set(sessionId, []);
    this.totalSessionsCreated++;

    // Update user index
    if (!this.userSessionIndex.has(userId)) {
      this.userSessionIndex.set(userId, new Set());
    }
    this.userSessionIndex.get(userId)!.add(sessionId);

    logger.info({ sessionId, userId }, 'Session created');
    return sessionId;
  }

  /**
   * Registers a connection with a session.
   */
  addConnection(sessionId: string, connectionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.isActive) {
      throw new Error(`Session is not active: ${sessionId}`);
    }

    if (!session.connectionIds.includes(connectionId)) {
      session.connectionIds.push(connectionId);
      session.lastActivityAt = new Date();
    }

    logger.info({ sessionId, connectionId }, 'Connection added to session');
  }

  /**
   * Removes a connection from a session.
   */
  removeConnection(sessionId: string, connectionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.connectionIds = session.connectionIds.filter((id) => id !== connectionId);
    session.lastActivityAt = new Date();
  }

  /**
   * Records a query execution for rate limiting and metrics.
   * Returns true if the query is allowed, false if rate-limited.
   */
  recordQuery(sessionId: string, dataBytes: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.isActive) {
      throw new Error(`Session is not active: ${sessionId}`);
    }

    const now = Date.now();
    const timestamps = this.queryTimestamps.get(sessionId) || [];

    // Remove timestamps outside the rate limit window
    const windowStart = now - this.config.rateLimitWindowMs;
    const recentTimestamps = timestamps.filter((ts) => ts > windowStart);

    // Check rate limit
    if (recentTimestamps.length >= this.config.maxQueriesPerMinute) {
      logger.warn(
        { sessionId, userId: session.userId, queriesInWindow: recentTimestamps.length },
        'Rate limit exceeded'
      );
      return false;
    }

    // Record the query
    recentTimestamps.push(now);
    this.queryTimestamps.set(sessionId, recentTimestamps);

    session.totalQueries++;
    session.queriesInWindow = recentTimestamps.length;
    session.dataTransferredBytes += dataBytes;
    session.lastActivityAt = new Date();

    return true;
  }

  /**
   * Force-disconnects a session, marking it inactive and clearing connections.
   * Used for runaway sessions that exceed resource limits.
   */
  forceDisconnect(sessionId: string, reason?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (!session.isActive) {
      return false;
    }

    session.isActive = false;
    const disconnectedConnections = [...session.connectionIds];
    session.connectionIds = [];

    logger.warn(
      {
        sessionId,
        userId: session.userId,
        reason: reason || 'admin-initiated',
        disconnectedConnections,
      },
      'Session force-disconnected'
    );

    return true;
  }

  /**
   * Force-disconnects all sessions for a specific user.
   * Returns the number of sessions disconnected.
   */
  forceDisconnectUser(userId: string, reason?: string): number {
    const sessionIds = this.userSessionIndex.get(userId);
    if (!sessionIds) {
      return 0;
    }

    let disconnected = 0;
    for (const sessionId of sessionIds) {
      if (this.forceDisconnect(sessionId, reason)) {
        disconnected++;
      }
    }

    return disconnected;
  }

  /**
   * Gets session info by sessionId.
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Gets all sessions for a specific user.
   */
  getUserSessions(userId: string): SessionInfo[] {
    const sessionIds = this.userSessionIndex.get(userId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map((id) => this.sessions.get(id))
      .filter((s): s is SessionInfo => s !== undefined);
  }

  /**
   * Gets all active sessions.
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  /**
   * Removes an inactive session from tracking.
   */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Remove from user index
    const userSessions = this.userSessionIndex.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessionIndex.delete(session.userId);
      }
    }

    this.sessions.delete(sessionId);
    this.queryTimestamps.delete(sessionId);

    logger.info({ sessionId, userId: session.userId }, 'Session removed');
  }

  /**
   * Returns the current queries-per-minute for a session.
   */
  getQueriesPerMinute(sessionId: string): number {
    const timestamps = this.queryTimestamps.get(sessionId);
    if (!timestamps) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindowMs;
    return timestamps.filter((ts) => ts > windowStart).length;
  }

  /**
   * Returns session metrics for the admin API.
   */
  getMetrics(): SessionMetrics {
    const allSessions = Array.from(this.sessions.values());
    const now = Date.now();

    const sessions: SessionSnapshot[] = allSessions.map((session) => ({
      sessionId: session.sessionId,
      userId: session.userId,
      connectionCount: session.connectionIds.length,
      queriesPerMinute: this.getQueriesPerMinute(session.sessionId),
      totalQueries: session.totalQueries,
      dataTransferredBytes: session.dataTransferredBytes,
      durationMs: now - session.createdAt.getTime(),
      isActive: session.isActive,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    }));

    const totalQueries = allSessions.reduce((sum, s) => sum + s.totalQueries, 0);
    const totalDataTransferred = allSessions.reduce(
      (sum, s) => sum + s.dataTransferredBytes,
      0
    );

    return {
      activeSessions: allSessions.filter((s) => s.isActive).length,
      totalSessions: this.totalSessionsCreated,
      totalQueries,
      totalDataTransferredBytes: totalDataTransferred,
      sessions,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clears all sessions. Used for testing and shutdown.
   */
  clear(): void {
    this.sessions.clear();
    this.userSessionIndex.clear();
    this.queryTimestamps.clear();
    this.totalSessionsCreated = 0;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();

// Export class for testing
export { SessionManager };
