/**
 * Smallest coherent provider-pressure policy.
 * Uses local failure counters — no global control plane.
 *
 * normal   — assistant + core ingestion + optional enrichment
 * degraded — core prioritized; optional enrichment deferred
 * critical — raw persist + durable job only; LLM enrichment waits; no hot retry storms
 */

export type ProviderPressure = 'normal' | 'degraded' | 'critical';

type FailureCategory = 'rate_limit' | 'quota_exhausted' | string;

const WINDOW_MS = 60_000;
const DEGRADED_THRESHOLD = 3;
const CRITICAL_THRESHOLD = 8;

const events: Array<{ at: number; category: FailureCategory }> = [];

function prune(now = Date.now()): void {
  while (events.length > 0 && now - events[0].at > WINDOW_MS) {
    events.shift();
  }
}

export function recordProviderFailure(category: FailureCategory): void {
  events.push({ at: Date.now(), category });
  prune();
}

export function getProviderPressure(): ProviderPressure {
  prune();
  const quotaHits = events.filter((e) => e.category === 'quota_exhausted').length;
  const rateHits = events.filter((e) => e.category === 'rate_limit').length;
  const total = events.length;

  if (quotaHits >= 2 || total >= CRITICAL_THRESHOLD) return 'critical';
  if (rateHits >= DEGRADED_THRESHOLD || total >= DEGRADED_THRESHOLD) return 'degraded';
  return 'normal';
}

export function shouldRunOptionalEnrichment(pressure: ProviderPressure = getProviderPressure()): boolean {
  return pressure === 'normal';
}

export function shouldAttemptAssistant(pressure: ProviderPressure = getProviderPressure()): boolean {
  // Even under critical, we may attempt assistant once — failures return truthful status.
  // Hot retry storms are suppressed by backoff elsewhere.
  return pressure !== 'critical' || events.filter((e) => e.category === 'quota_exhausted').length < 5;
}

export function shouldRunDeterministicCoreOnly(
  pressure: ProviderPressure = getProviderPressure(),
): boolean {
  return pressure === 'critical';
}

/** Extra delay multiplier for retry storms under pressure. */
export function pressureBackoffMultiplier(pressure: ProviderPressure = getProviderPressure()): number {
  if (pressure === 'critical') return 8;
  if (pressure === 'degraded') return 3;
  return 1;
}

export function resetProviderPressureForTests(): void {
  events.length = 0;
}

export function getProviderPressureSnapshot() {
  prune();
  return {
    pressure: getProviderPressure(),
    windowEvents: events.length,
    windowMs: WINDOW_MS,
  };
}
