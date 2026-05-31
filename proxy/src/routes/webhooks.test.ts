import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifySignature,
  evaluateFilters,
  webhookStore,
} from './webhooks.js';
import type { PayloadFilter, WebhookConfig } from './webhooks.js';
import * as crypto from 'node:crypto';

// ============================================================
// HMAC-SHA256 SIGNATURE VERIFICATION
// ============================================================

describe('verifySignature', () => {
  const secret = 'test-secret-key-that-is-at-least-32-chars';

  function createSignature(payload: string, key: string): string {
    const digest = crypto
      .createHmac('sha256', key)
      .update(payload, 'utf8')
      .digest('hex');
    return `sha256=${digest}`;
  }

  it('returns true for valid signature', () => {
    const payload = JSON.stringify({ action: 'push', ref: 'main' });
    const signature = createSignature(payload, secret);

    expect(verifySignature(payload, signature, secret)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    const payload = JSON.stringify({ action: 'push' });
    const wrongSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

    expect(verifySignature(payload, wrongSignature, secret)).toBe(false);
  });

  it('returns false for tampered payload', () => {
    const originalPayload = JSON.stringify({ action: 'push' });
    const signature = createSignature(originalPayload, secret);
    const tamperedPayload = JSON.stringify({ action: 'delete' });

    expect(verifySignature(tamperedPayload, signature, secret)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const payload = JSON.stringify({ action: 'push' });
    const signature = createSignature(payload, secret);

    expect(verifySignature(payload, signature, 'wrong-secret-key-that-is-32-chars-long')).toBe(false);
  });

  it('returns false when signature is missing sha256= prefix', () => {
    const payload = JSON.stringify({ action: 'push' });
    const digest = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    expect(verifySignature(payload, digest, secret)).toBe(false);
  });

  it('returns false for empty payload', () => {
    expect(verifySignature('', 'sha256=abc', secret)).toBe(false);
  });

  it('returns false for empty signature', () => {
    expect(verifySignature('{"a":1}', '', secret)).toBe(false);
  });

  it('returns false for empty secret', () => {
    expect(verifySignature('{"a":1}', 'sha256=abc', '')).toBe(false);
  });

  it('returns false for mismatched length signatures', () => {
    const payload = JSON.stringify({ action: 'push' });
    const shortSignature = 'sha256=abcdef';

    expect(verifySignature(payload, shortSignature, secret)).toBe(false);
  });
});

// ============================================================
// PAYLOAD FILTER EVALUATION
// ============================================================

describe('evaluateFilters', () => {
  it('returns true when no filters are provided', () => {
    const payload = { action: 'push', branch: 'main' };
    expect(evaluateFilters(payload, [])).toBe(true);
  });

  it('returns true when filters is undefined-like empty array', () => {
    const payload = { action: 'push' };
    expect(evaluateFilters(payload, [])).toBe(true);
  });

  describe('eq operator', () => {
    it('matches when field equals value', () => {
      const filters: PayloadFilter[] = [
        { field: 'action', operator: 'eq', value: 'push' },
      ];
      expect(evaluateFilters({ action: 'push' }, filters)).toBe(true);
    });

    it('does not match when field differs', () => {
      const filters: PayloadFilter[] = [
        { field: 'action', operator: 'eq', value: 'push' },
      ];
      expect(evaluateFilters({ action: 'pull' }, filters)).toBe(false);
    });

    it('matches numeric values', () => {
      const filters: PayloadFilter[] = [
        { field: 'count', operator: 'eq', value: 42 },
      ];
      expect(evaluateFilters({ count: 42 }, filters)).toBe(true);
    });

    it('matches boolean values', () => {
      const filters: PayloadFilter[] = [
        { field: 'active', operator: 'eq', value: true },
      ];
      expect(evaluateFilters({ active: true }, filters)).toBe(true);
    });
  });

  describe('neq operator', () => {
    it('matches when field does not equal value', () => {
      const filters: PayloadFilter[] = [
        { field: 'action', operator: 'neq', value: 'delete' },
      ];
      expect(evaluateFilters({ action: 'push' }, filters)).toBe(true);
    });

    it('does not match when field equals value', () => {
      const filters: PayloadFilter[] = [
        { field: 'action', operator: 'neq', value: 'push' },
      ];
      expect(evaluateFilters({ action: 'push' }, filters)).toBe(false);
    });
  });

  describe('contains operator', () => {
    it('matches when string field contains value', () => {
      const filters: PayloadFilter[] = [
        { field: 'message', operator: 'contains', value: 'deploy' },
      ];
      expect(evaluateFilters({ message: 'auto-deploy triggered' }, filters)).toBe(true);
    });

    it('does not match when string field does not contain value', () => {
      const filters: PayloadFilter[] = [
        { field: 'message', operator: 'contains', value: 'deploy' },
      ];
      expect(evaluateFilters({ message: 'test commit' }, filters)).toBe(false);
    });

    it('returns false for non-string fields', () => {
      const filters: PayloadFilter[] = [
        { field: 'count', operator: 'contains', value: '5' },
      ];
      expect(evaluateFilters({ count: 5 }, filters)).toBe(false);
    });
  });

  describe('exists operator', () => {
    it('matches when field exists', () => {
      const filters: PayloadFilter[] = [
        { field: 'data', operator: 'exists' },
      ];
      expect(evaluateFilters({ data: 'something' }, filters)).toBe(true);
    });

    it('does not match when field is missing', () => {
      const filters: PayloadFilter[] = [
        { field: 'data', operator: 'exists' },
      ];
      expect(evaluateFilters({ other: 'value' }, filters)).toBe(false);
    });

    it('does not match when field is null', () => {
      const filters: PayloadFilter[] = [
        { field: 'data', operator: 'exists' },
      ];
      expect(evaluateFilters({ data: null }, filters)).toBe(false);
    });
  });

  describe('nested fields (dot notation)', () => {
    it('resolves nested field paths', () => {
      const filters: PayloadFilter[] = [
        { field: 'data.action', operator: 'eq', value: 'update' },
      ];
      expect(evaluateFilters({ data: { action: 'update' } }, filters)).toBe(true);
    });

    it('returns false for missing nested paths', () => {
      const filters: PayloadFilter[] = [
        { field: 'data.nested.deep', operator: 'exists' },
      ];
      expect(evaluateFilters({ data: { other: 'value' } }, filters)).toBe(false);
    });
  });

  describe('multiple filters (AND logic)', () => {
    it('requires all filters to match', () => {
      const filters: PayloadFilter[] = [
        { field: 'action', operator: 'eq', value: 'push' },
        { field: 'branch', operator: 'eq', value: 'main' },
      ];
      expect(evaluateFilters({ action: 'push', branch: 'main' }, filters)).toBe(true);
    });

    it('fails if any filter does not match', () => {
      const filters: PayloadFilter[] = [
        { field: 'action', operator: 'eq', value: 'push' },
        { field: 'branch', operator: 'eq', value: 'main' },
      ];
      expect(evaluateFilters({ action: 'push', branch: 'develop' }, filters)).toBe(false);
    });
  });
});

// ============================================================
// WEBHOOK STORE
// ============================================================

describe('webhookStore', () => {
  beforeEach(() => {
    webhookStore.clear();
  });

  it('stores and retrieves webhook configs', () => {
    const config: WebhookConfig = {
      extractId: 'extract-1',
      secret: 'a-secret-that-is-at-least-32-characters-long',
      filters: [],
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    webhookStore.set('extract-1', config);
    expect(webhookStore.get('extract-1')).toEqual(config);
  });

  it('returns undefined for non-existent configs', () => {
    expect(webhookStore.get('non-existent')).toBeUndefined();
  });
});
