/**
 * Exponential backoff with jitter for retryable OpenAI errors.
 * @see https://developers.openai.com/api/docs/guides/rate-limits#error-mitigation
 */
import { isOpenAiRateLimitError } from './openaiCircuitBreaker';

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

const DEFAULT_SHOULD_RETRY = (error: unknown) => isOpenAiRateLimitError(error);

export function computeExponentialBackoffMs(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30_000,
  jitterRatio = 0.25
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exp * jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const shouldRetry = options.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delayMs = computeExponentialBackoffMs(
        attempt,
        options.baseDelayMs,
        options.maxDelayMs,
        options.jitterRatio
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}
