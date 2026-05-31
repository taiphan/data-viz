import { RetryConfig, RetryState } from './types';
import { DEFAULT_RETRY_CONFIG } from './constants';

/**
 * Computes the delay for a given retry attempt using exponential backoff with jitter.
 * Formula: min(baseDelayMs * backoffMultiplier^attempt, maxDelayMs) * jitterFactor
 *
 * Jitter adds randomness (±25%) to prevent thundering herd when multiple
 * clients retry simultaneously.
 *
 * @param attempt - Zero-indexed attempt number
 * @param config - Retry configuration
 * @returns Delay in milliseconds (with jitter applied)
 */
export function computeDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);
  const jitter = 0.75 + Math.random() * 0.5; // Random factor between 0.75 and 1.25
  return Math.round(cappedDelay * jitter);
}

/**
 * Computes the base delay without jitter (deterministic).
 * Useful for testing and state calculations.
 * Formula: min(baseDelayMs * backoffMultiplier^attempt, maxDelayMs)
 *
 * @param attempt - Zero-indexed attempt number
 * @param config - Retry configuration
 * @returns Delay in milliseconds (no jitter)
 */
export function computeBaseDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(baseDelay, config.maxDelayMs);
}

/**
 * Executes an async operation with retry logic using exponential backoff.
 * Retries the operation up to maxAttempts times, with increasing delays
 * between attempts. Jitter is applied to delays to prevent thundering herd.
 *
 * @param operation - Async function to execute
 * @param config - Retry configuration (defaults to DEFAULT_RETRY_CONFIG)
 * @returns The result of the operation
 * @throws The last error encountered after all retry attempts are exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < config.maxAttempts - 1) {
        const delay = computeDelay(attempt, config);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Creates a RetryState object representing the current state of a retry sequence.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param lastError - The last error message, or null if no error
 * @param config - Retry configuration for computing next retry time
 * @returns RetryState object
 */
export function createRetryState(
  attempt: number,
  lastError: string | null,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): RetryState {
  const hasMoreAttempts = attempt < config.maxAttempts - 1;
  const nextRetryAt = hasMoreAttempts && lastError
    ? Date.now() + computeBaseDelay(attempt, config)
    : null;

  return {
    attempt,
    lastError,
    nextRetryAt,
  };
}
