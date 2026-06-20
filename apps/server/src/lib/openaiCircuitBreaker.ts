import { logger } from '../logger';
import { logSecurityEvent } from '../services/securityLog';

export type CircuitBreakerSnapshot = {
  isOpen: boolean;
  failures: number;
  openedAt: number | null;
  cooldownMs: number;
};

const THRESHOLD = Math.max(
  1,
  Number(process.env.OPENAI_CIRCUIT_BREAKER_THRESHOLD ?? 5)
);
const COOLDOWN_MS = Math.max(
  5_000,
  Number(process.env.OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS ?? 120_000)
);

let failures = 0;
let openedAt: number | null = null;

function resetIfCooldownElapsed(now = Date.now()): void {
  if (openedAt != null && now - openedAt >= COOLDOWN_MS) {
    failures = 0;
    openedAt = null;
    logger.info('OpenAI circuit breaker reset after cooldown');
  }
}

export function isOpenAiCircuitOpen(now = Date.now()): boolean {
  resetIfCooldownElapsed(now);
  return openedAt != null;
}

export function getOpenAiCircuitBreakerSnapshot(): CircuitBreakerSnapshot {
  resetIfCooldownElapsed();
  return {
    isOpen: openedAt != null,
    failures,
    openedAt,
    cooldownMs: COOLDOWN_MS,
  };
}

export function assertOpenAiCircuitClosed(): void {
  if (isOpenAiCircuitOpen()) {
    throw createOpenAiCircuitOpenError();
  }
}

export function createOpenAiCircuitOpenError(): Error & {
  status: number;
  code: string;
  retryAfter: number;
} {
  const retryAfterSec = openedAt
    ? Math.max(1, Math.ceil((COOLDOWN_MS - (Date.now() - openedAt)) / 1000))
    : COOLDOWN_MS / 1000;
  const err = new Error(
    `OpenAI circuit breaker open — retry after ${retryAfterSec}s`
  ) as Error & { status?: number; code?: string; retryAfter?: number };
  err.status = 503;
  err.code = 'openai_circuit_open';
  err.retryAfter = retryAfterSec;
  return err as Error & { status: number; code: string; retryAfter: number };
}

export function isOpenAiCircuitOpenError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (err?.code === 'openai_circuit_open') return true;
  return (err?.message ?? '').includes('circuit breaker open');
}

export function isOpenAiRateLimitError(error: unknown): boolean {
  const err = error as { status?: number; code?: string; message?: string } | null;
  const message = (err?.message ?? '').toLowerCase();
  return (
    err?.status === 429 ||
    err?.code === 'rate_limit_exceeded' ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('insufficient_quota') ||
    message.includes('quota exceeded')
  );
}

export function recordOpenAiSuccess(): void {
  resetIfCooldownElapsed();
  if (failures > 0) failures = Math.max(0, failures - 1);
}

export function recordOpenAiFailure(error: unknown): void {
  if (!isOpenAiRateLimitError(error)) return;

  failures += 1;
  if (failures < THRESHOLD) return;

  openedAt = Date.now();
  logger.warn(
    { failures, threshold: THRESHOLD, cooldownMs: COOLDOWN_MS },
    'OpenAI circuit breaker opened after repeated rate-limit failures'
  );
  logSecurityEvent('openai_circuit_breaker_open', {
    failures,
    threshold: THRESHOLD,
    cooldownMs: COOLDOWN_MS,
  });
}

/** Test helper */
export function resetOpenAiCircuitBreakerForTests(): void {
  failures = 0;
  openedAt = null;
}
