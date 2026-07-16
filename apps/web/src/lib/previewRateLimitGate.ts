/**
 * Shared 429 circuit breaker for high-frequency composer preview endpoints.
 * Previews are cosmetic: when the server rate-limits them, stop calling for
 * the advertised retry window instead of spamming requests (and logs) while
 * the user types. One gate per endpoint.
 */

const DEFAULT_COOLDOWN_SEC = 60;
const MAX_COOLDOWN_SEC = 15 * 60;

export class PreviewRateLimitGate {
  private cooldownUntil = 0;

  /** True while the endpoint is rate-limited and calls should be skipped. */
  isCoolingDown(now = Date.now()): boolean {
    return now < this.cooldownUntil;
  }

  /**
   * Inspect a fetch error; if it is a 429, arm the cooldown and return true.
   * Non-429 errors leave the gate untouched.
   */
  noteError(err: unknown, now = Date.now()): boolean {
    const e = err as { status?: number; retryAfter?: number } | null;
    if (!e || e.status !== 429) return false;
    const retryAfterSec = Math.min(
      typeof e.retryAfter === 'number' && e.retryAfter > 0 ? e.retryAfter : DEFAULT_COOLDOWN_SEC,
      MAX_COOLDOWN_SEC,
    );
    this.cooldownUntil = now + retryAfterSec * 1000;
    return true;
  }

  /** @internal test helper */
  reset(): void {
    this.cooldownUntil = 0;
  }
}
