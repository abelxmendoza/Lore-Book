import { logger } from '../logger';
import { logSecurityEvent } from '../services/securityLog';
import { createSemaphore } from './semaphore';

type BreakerState = {
  failures: number;
  openedAt: number | null;
};

export type ExternalGuard = {
  run<T>(fn: () => Promise<T>): Promise<T>;
  stats(): { isOpen: boolean; failures: number; active: number; queued: number };
};

export function createExternalGuard(options: {
  name: string;
  threshold?: number;
  cooldownMs?: number;
  maxConcurrency?: number;
  isRateLimitError?: (error: unknown) => boolean;
}): ExternalGuard {
  const threshold = Math.max(1, options.threshold ?? 5);
  const cooldownMs = Math.max(5_000, options.cooldownMs ?? 120_000);
  const isRateLimit =
    options.isRateLimitError ??
    ((err: unknown) => {
      const e = err as { status?: number; statusCode?: number; message?: string } | null;
      const msg = (e?.message ?? '').toLowerCase();
      return (
        e?.status === 429 ||
        e?.statusCode === 429 ||
        msg.includes('429') ||
        msg.includes('rate limit')
      );
    });

  let state: BreakerState = { failures: 0, openedAt: null };
  const semaphore = createSemaphore(options.maxConcurrency ?? 3);

  const resetIfCooldown = (now = Date.now()) => {
    if (state.openedAt != null && now - state.openedAt >= cooldownMs) {
      state = { failures: 0, openedAt: null };
      logger.info({ service: options.name }, 'External circuit breaker reset');
    }
  };

  const assertClosed = () => {
    resetIfCooldown();
    if (state.openedAt != null) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((cooldownMs - (Date.now() - state.openedAt)) / 1000)
      );
      const err = new Error(
        `${options.name} circuit breaker open — retry after ${retryAfterSec}s`
      ) as Error & { status?: number; code?: string; retryAfter?: number };
      err.status = 503;
      err.code = `${options.name}_circuit_open`;
      err.retryAfter = retryAfterSec;
      throw err;
    }
  };

  const recordFailure = (error: unknown) => {
    if (!isRateLimit(error)) return;
    state.failures += 1;
    if (state.failures < threshold) return;
    state.openedAt = Date.now();
    logger.warn({ service: options.name, failures: state.failures }, 'External circuit breaker opened');
    logSecurityEvent('external_circuit_breaker_open', {
      service: options.name,
      failures: state.failures,
      cooldownMs,
    });
  };

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      assertClosed();
      return semaphore.run(async () => {
        try {
          const result = await fn();
          resetIfCooldown();
          if (state.failures > 0) state.failures = Math.max(0, state.failures - 1);
          return result;
        } catch (err) {
          recordFailure(err);
          throw err;
        }
      });
    },
    stats() {
      resetIfCooldown();
      const sem = semaphore.stats();
      return {
        isOpen: state.openedAt != null,
        failures: state.failures,
        active: sem.active,
        queued: sem.queued,
      };
    },
  };
}

/** Stripe API — bounded concurrency + cooldown on repeated 429s */
export const stripeGuard = createExternalGuard({
  name: 'stripe',
  maxConcurrency: Math.max(1, Number(process.env.STRIPE_MAX_CONCURRENCY ?? 3)),
  threshold: Number(process.env.STRIPE_CIRCUIT_BREAKER_THRESHOLD ?? 5),
  cooldownMs: Number(process.env.STRIPE_CIRCUIT_BREAKER_COOLDOWN_MS ?? 120_000),
});

/** GitHub REST API */
export const githubGuard = createExternalGuard({
  name: 'github',
  maxConcurrency: Math.max(1, Number(process.env.GITHUB_MAX_CONCURRENCY ?? 2)),
});

/** X / Twitter API */
export const xApiGuard = createExternalGuard({
  name: 'x_api',
  maxConcurrency: 1,
});
