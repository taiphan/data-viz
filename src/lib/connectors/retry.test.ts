import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeDelay, computeBaseDelay, withRetry, createRetryState } from './retry';
import { RetryConfig } from './types';
import { DEFAULT_RETRY_CONFIG } from './constants';

describe('computeBaseDelay', () => {
  const config: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
  };

  it('returns baseDelayMs for attempt 0', () => {
    expect(computeBaseDelay(0, config)).toBe(1000);
  });

  it('applies exponential backoff for subsequent attempts', () => {
    expect(computeBaseDelay(1, config)).toBe(2000);
    expect(computeBaseDelay(2, config)).toBe(4000);
    expect(computeBaseDelay(3, config)).toBe(8000);
  });

  it('caps delay at maxDelayMs', () => {
    expect(computeBaseDelay(4, config)).toBe(8000);
    expect(computeBaseDelay(10, config)).toBe(8000);
  });

  it('uses formula: min(baseDelayMs * multiplier^attempt, maxDelayMs)', () => {
    const customConfig: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 500,
      maxDelayMs: 10000,
      backoffMultiplier: 3,
    };

    expect(computeBaseDelay(0, customConfig)).toBe(500);
    expect(computeBaseDelay(1, customConfig)).toBe(1500);
    expect(computeBaseDelay(2, customConfig)).toBe(4500);
    expect(computeBaseDelay(3, customConfig)).toBe(10000); // capped
  });

  it('handles multiplier of 1 (constant delay)', () => {
    const constantConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 1,
    };

    expect(computeBaseDelay(0, constantConfig)).toBe(1000);
    expect(computeBaseDelay(1, constantConfig)).toBe(1000);
    expect(computeBaseDelay(2, constantConfig)).toBe(1000);
  });
});

describe('computeDelay', () => {
  const config: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
  };

  it('returns a value within jitter range (±25%) of base delay', () => {
    // Run multiple times to verify jitter range
    for (let i = 0; i < 50; i++) {
      const delay = computeDelay(0, config);
      // Base delay for attempt 0 = 1000
      // Jitter range: 1000 * 0.75 to 1000 * 1.25 = 750 to 1250
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    }
  });

  it('applies exponential backoff with jitter for subsequent attempts', () => {
    for (let i = 0; i < 50; i++) {
      const delay = computeDelay(1, config);
      // Base delay for attempt 1 = 2000
      // Jitter range: 2000 * 0.75 to 2000 * 1.25 = 1500 to 2500
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });

  it('caps delay at maxDelayMs (with jitter applied to capped value)', () => {
    for (let i = 0; i < 50; i++) {
      const delay = computeDelay(10, config);
      // Base delay capped at 8000
      // Jitter range: 8000 * 0.75 to 8000 * 1.25 = 6000 to 10000
      expect(delay).toBeGreaterThanOrEqual(6000);
      expect(delay).toBeLessThanOrEqual(10000);
    }
  });

  it('produces varying delays (jitter is not constant)', () => {
    const delays = new Set<number>();
    for (let i = 0; i < 20; i++) {
      delays.add(computeDelay(0, config));
    }
    // With jitter, we should get multiple distinct values
    expect(delays.size).toBeGreaterThan(1);
  });

  it('returns an integer (rounded)', () => {
    for (let i = 0; i < 20; i++) {
      const delay = computeDelay(0, config);
      expect(delay).toBe(Math.round(delay));
    }
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const fastConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
  };

  it('returns result on first successful attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const resultPromise = withRetry(operation, fastConfig);
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and returns result on subsequent success', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('success');

    const resultPromise = withRetry(operation, fastConfig);
    // Advance past the jittered delay (max possible: 100 * 1.25 = 125)
    await vi.advanceTimersByTimeAsync(150);
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws last error after all attempts are exhausted', async () => {
    vi.useRealTimers();

    const quickConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      backoffMultiplier: 2,
    };

    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'));

    await expect(withRetry(operation, quickConfig)).rejects.toThrow('fail 3');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry after maxAttempts is reached', async () => {
    vi.useRealTimers();

    const quickConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      backoffMultiplier: 2,
    };

    const operation = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(operation, quickConfig)).rejects.toThrow('always fails');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('uses DEFAULT_RETRY_CONFIG when no config is provided', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(operation);

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('waits with exponential backoff between retries', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const resultPromise = withRetry(operation, fastConfig);

    // First attempt fails immediately
    expect(operation).toHaveBeenCalledTimes(1);

    // After max jittered delay for attempt 0 (100 * 1.25 = 125), second attempt
    await vi.advanceTimersByTimeAsync(150);
    expect(operation).toHaveBeenCalledTimes(2);

    // After max jittered delay for attempt 1 (200 * 1.25 = 250), third attempt
    await vi.advanceTimersByTimeAsync(300);
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('succeeds on the last attempt', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('last chance');

    const resultPromise = withRetry(operation, fastConfig);
    // Advance enough time for both delays
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(300);
    const result = await resultPromise;

    expect(result).toBe('last chance');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('preserves the error type from the operation', async () => {
    vi.useRealTimers();

    const quickConfig: RetryConfig = {
      maxAttempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 10,
      backoffMultiplier: 2,
    };

    class CustomError extends Error {
      constructor(public code: string) {
        super(`Custom error: ${code}`);
        this.name = 'CustomError';
      }
    }

    const operation = vi.fn().mockRejectedValue(new CustomError('TIMEOUT'));

    try {
      await withRetry(operation, quickConfig);
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
      expect((error as CustomError).code).toBe('TIMEOUT');
    }
  });
});

describe('createRetryState', () => {
  it('creates initial state with no error', () => {
    const state = createRetryState(0, null);

    expect(state.attempt).toBe(0);
    expect(state.lastError).toBeNull();
    expect(state.nextRetryAt).toBeNull();
  });

  it('creates state with error and next retry time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const state = createRetryState(0, 'Connection failed');

    expect(state.attempt).toBe(0);
    expect(state.lastError).toBe('Connection failed');
    expect(state.nextRetryAt).toBe(Date.now() + 1000); // baseDelay * 2^0

    vi.useRealTimers();
  });

  it('returns null nextRetryAt when max attempts reached', () => {
    const state = createRetryState(2, 'Final failure');

    expect(state.attempt).toBe(2);
    expect(state.lastError).toBe('Final failure');
    expect(state.nextRetryAt).toBeNull();
  });

  it('returns null nextRetryAt when no error', () => {
    const state = createRetryState(1, null);

    expect(state.attempt).toBe(1);
    expect(state.lastError).toBeNull();
    expect(state.nextRetryAt).toBeNull();
  });

  it('uses custom config for delay calculation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const customConfig: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 500,
      maxDelayMs: 10000,
      backoffMultiplier: 3,
    };

    const state = createRetryState(1, 'Error', customConfig);

    expect(state.nextRetryAt).toBe(Date.now() + 1500); // 500 * 3^1

    vi.useRealTimers();
  });
});
