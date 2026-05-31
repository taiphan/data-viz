import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SessionManager({
      maxQueriesPerMinute: 5,
      rateLimitWindowMs: 60_000,
    });
  });

  afterEach(() => {
    manager.clear();
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('creates a session and returns a valid sessionId', () => {
      const sessionId = manager.createSession('user-1');
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('initializes session with correct defaults', () => {
      const sessionId = manager.createSession('user-1');
      const session = manager.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session!.userId).toBe('user-1');
      expect(session!.connectionIds).toEqual([]);
      expect(session!.queriesInWindow).toBe(0);
      expect(session!.totalQueries).toBe(0);
      expect(session!.dataTransferredBytes).toBe(0);
      expect(session!.isActive).toBe(true);
    });

    it('allows multiple sessions for the same user', () => {
      const id1 = manager.createSession('user-1');
      const id2 = manager.createSession('user-1');

      expect(id1).not.toBe(id2);
      const sessions = manager.getUserSessions('user-1');
      expect(sessions).toHaveLength(2);
    });
  });

  describe('addConnection', () => {
    it('adds a connection to the session', () => {
      const sessionId = manager.createSession('user-1');
      manager.addConnection(sessionId, 'conn-1');

      const session = manager.getSession(sessionId);
      expect(session!.connectionIds).toContain('conn-1');
    });

    it('does not add duplicate connections', () => {
      const sessionId = manager.createSession('user-1');
      manager.addConnection(sessionId, 'conn-1');
      manager.addConnection(sessionId, 'conn-1');

      const session = manager.getSession(sessionId);
      expect(session!.connectionIds).toHaveLength(1);
    });

    it('throws for non-existent session', () => {
      expect(() => manager.addConnection('nonexistent', 'conn-1')).toThrow(
        'Session not found: nonexistent'
      );
    });

    it('throws for inactive session', () => {
      const sessionId = manager.createSession('user-1');
      manager.forceDisconnect(sessionId);

      expect(() => manager.addConnection(sessionId, 'conn-1')).toThrow(
        'Session is not active'
      );
    });
  });

  describe('removeConnection', () => {
    it('removes a connection from the session', () => {
      const sessionId = manager.createSession('user-1');
      manager.addConnection(sessionId, 'conn-1');
      manager.addConnection(sessionId, 'conn-2');
      manager.removeConnection(sessionId, 'conn-1');

      const session = manager.getSession(sessionId);
      expect(session!.connectionIds).toEqual(['conn-2']);
    });

    it('handles non-existent session gracefully', () => {
      expect(() => manager.removeConnection('nonexistent', 'conn-1')).not.toThrow();
    });

    it('handles removing non-existent connection gracefully', () => {
      const sessionId = manager.createSession('user-1');
      manager.removeConnection(sessionId, 'conn-999');

      const session = manager.getSession(sessionId);
      expect(session!.connectionIds).toEqual([]);
    });
  });

  describe('recordQuery', () => {
    it('records a query and updates metrics', () => {
      const sessionId = manager.createSession('user-1');
      const allowed = manager.recordQuery(sessionId, 1024);

      expect(allowed).toBe(true);
      const session = manager.getSession(sessionId);
      expect(session!.totalQueries).toBe(1);
      expect(session!.dataTransferredBytes).toBe(1024);
    });

    it('accumulates data transferred across queries', () => {
      const sessionId = manager.createSession('user-1');
      manager.recordQuery(sessionId, 500);
      manager.recordQuery(sessionId, 300);

      const session = manager.getSession(sessionId);
      expect(session!.totalQueries).toBe(2);
      expect(session!.dataTransferredBytes).toBe(800);
    });

    it('enforces rate limit', () => {
      const sessionId = manager.createSession('user-1');

      // Execute up to the limit (5 queries/min)
      for (let i = 0; i < 5; i++) {
        expect(manager.recordQuery(sessionId, 100)).toBe(true);
      }

      // 6th query should be rate-limited
      expect(manager.recordQuery(sessionId, 100)).toBe(false);
    });

    it('resets rate limit after window expires', () => {
      const sessionId = manager.createSession('user-1');

      // Fill up the rate limit
      for (let i = 0; i < 5; i++) {
        manager.recordQuery(sessionId, 100);
      }
      expect(manager.recordQuery(sessionId, 100)).toBe(false);

      // Advance past the rate limit window
      vi.advanceTimersByTime(61_000);

      // Should be allowed again
      expect(manager.recordQuery(sessionId, 100)).toBe(true);
    });

    it('throws for non-existent session', () => {
      expect(() => manager.recordQuery('nonexistent', 100)).toThrow(
        'Session not found: nonexistent'
      );
    });

    it('throws for inactive session', () => {
      const sessionId = manager.createSession('user-1');
      manager.forceDisconnect(sessionId);

      expect(() => manager.recordQuery(sessionId, 100)).toThrow(
        'Session is not active'
      );
    });
  });

  describe('forceDisconnect', () => {
    it('marks session as inactive', () => {
      const sessionId = manager.createSession('user-1');
      const result = manager.forceDisconnect(sessionId);

      expect(result).toBe(true);
      const session = manager.getSession(sessionId);
      expect(session!.isActive).toBe(false);
    });

    it('clears connection ids', () => {
      const sessionId = manager.createSession('user-1');
      manager.addConnection(sessionId, 'conn-1');
      manager.addConnection(sessionId, 'conn-2');
      manager.forceDisconnect(sessionId);

      const session = manager.getSession(sessionId);
      expect(session!.connectionIds).toEqual([]);
    });

    it('returns false for non-existent session', () => {
      expect(manager.forceDisconnect('nonexistent')).toBe(false);
    });

    it('returns false for already inactive session', () => {
      const sessionId = manager.createSession('user-1');
      manager.forceDisconnect(sessionId);

      expect(manager.forceDisconnect(sessionId)).toBe(false);
    });
  });

  describe('forceDisconnectUser', () => {
    it('disconnects all active sessions for a user', () => {
      const id1 = manager.createSession('user-1');
      const id2 = manager.createSession('user-1');
      manager.createSession('user-2');

      const count = manager.forceDisconnectUser('user-1');

      expect(count).toBe(2);
      expect(manager.getSession(id1)!.isActive).toBe(false);
      expect(manager.getSession(id2)!.isActive).toBe(false);
    });

    it('returns 0 for unknown user', () => {
      expect(manager.forceDisconnectUser('unknown')).toBe(0);
    });

    it('does not disconnect already inactive sessions', () => {
      const id1 = manager.createSession('user-1');
      manager.createSession('user-1');
      manager.forceDisconnect(id1);

      const count = manager.forceDisconnectUser('user-1');
      expect(count).toBe(1);
    });
  });

  describe('getUserSessions', () => {
    it('returns all sessions for a user', () => {
      manager.createSession('user-1');
      manager.createSession('user-1');
      manager.createSession('user-2');

      const sessions = manager.getUserSessions('user-1');
      expect(sessions).toHaveLength(2);
      expect(sessions.every((s) => s.userId === 'user-1')).toBe(true);
    });

    it('returns empty array for unknown user', () => {
      expect(manager.getUserSessions('unknown')).toEqual([]);
    });
  });

  describe('getActiveSessions', () => {
    it('returns only active sessions', () => {
      const id1 = manager.createSession('user-1');
      manager.createSession('user-2');
      manager.forceDisconnect(id1);

      const active = manager.getActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].userId).toBe('user-2');
    });

    it('returns empty array when no sessions exist', () => {
      expect(manager.getActiveSessions()).toEqual([]);
    });
  });

  describe('removeSession', () => {
    it('removes session from tracking', () => {
      const sessionId = manager.createSession('user-1');
      manager.removeSession(sessionId);

      expect(manager.getSession(sessionId)).toBeUndefined();
      expect(manager.getUserSessions('user-1')).toEqual([]);
    });

    it('handles non-existent session gracefully', () => {
      expect(() => manager.removeSession('nonexistent')).not.toThrow();
    });

    it('cleans up user index when last session is removed', () => {
      const sessionId = manager.createSession('user-1');
      manager.removeSession(sessionId);

      expect(manager.getUserSessions('user-1')).toEqual([]);
    });
  });

  describe('getQueriesPerMinute', () => {
    it('returns current query rate within window', () => {
      const sessionId = manager.createSession('user-1');
      manager.recordQuery(sessionId, 100);
      manager.recordQuery(sessionId, 100);
      manager.recordQuery(sessionId, 100);

      expect(manager.getQueriesPerMinute(sessionId)).toBe(3);
    });

    it('returns 0 for session with no queries', () => {
      const sessionId = manager.createSession('user-1');
      expect(manager.getQueriesPerMinute(sessionId)).toBe(0);
    });

    it('returns 0 for non-existent session', () => {
      expect(manager.getQueriesPerMinute('nonexistent')).toBe(0);
    });

    it('excludes queries outside the window', () => {
      const sessionId = manager.createSession('user-1');
      manager.recordQuery(sessionId, 100);
      manager.recordQuery(sessionId, 100);

      // Advance past the window
      vi.advanceTimersByTime(61_000);

      expect(manager.getQueriesPerMinute(sessionId)).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('returns comprehensive metrics', () => {
      const id1 = manager.createSession('user-1');
      manager.createSession('user-2');
      manager.addConnection(id1, 'conn-1');
      manager.recordQuery(id1, 2048);

      const metrics = manager.getMetrics();

      expect(metrics.activeSessions).toBe(2);
      expect(metrics.totalSessions).toBe(2);
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.totalDataTransferredBytes).toBe(2048);
      expect(metrics.sessions).toHaveLength(2);
      expect(metrics.timestamp).toBeDefined();
    });

    it('includes session snapshots with correct data', () => {
      const sessionId = manager.createSession('user-1');
      manager.addConnection(sessionId, 'conn-1');
      manager.addConnection(sessionId, 'conn-2');
      manager.recordQuery(sessionId, 512);

      const metrics = manager.getMetrics();
      const snapshot = metrics.sessions[0];

      expect(snapshot.sessionId).toBe(sessionId);
      expect(snapshot.userId).toBe('user-1');
      expect(snapshot.connectionCount).toBe(2);
      expect(snapshot.totalQueries).toBe(1);
      expect(snapshot.dataTransferredBytes).toBe(512);
      expect(snapshot.isActive).toBe(true);
      expect(snapshot.createdAt).toBeDefined();
      expect(snapshot.lastActivityAt).toBeDefined();
    });

    it('returns empty metrics when no sessions exist', () => {
      const metrics = manager.getMetrics();

      expect(metrics.activeSessions).toBe(0);
      expect(metrics.totalSessions).toBe(0);
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.totalDataTransferredBytes).toBe(0);
      expect(metrics.sessions).toEqual([]);
    });

    it('tracks total sessions created even after removal', () => {
      const id1 = manager.createSession('user-1');
      manager.createSession('user-2');
      manager.removeSession(id1);

      const metrics = manager.getMetrics();
      expect(metrics.totalSessions).toBe(2);
      expect(metrics.sessions).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('removes all sessions and resets counters', () => {
      manager.createSession('user-1');
      manager.createSession('user-2');
      manager.clear();

      expect(manager.getActiveSessions()).toEqual([]);
      const metrics = manager.getMetrics();
      expect(metrics.totalSessions).toBe(0);
    });
  });
});
