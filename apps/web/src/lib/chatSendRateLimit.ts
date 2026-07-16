/**
 * Shared cooldown for the chat send path. When /api/chat/stream answers 429,
 * useChatStream records the advertised retry window here; useChat consults it
 * so Retry actions short-circuit locally instead of hammering a dead bucket —
 * every blocked attempt would only extend the drought.
 */

const DEFAULT_COOLDOWN_SEC = 60;
const MAX_COOLDOWN_SEC = 15 * 60;

let rateLimitedUntil = 0;

export function noteChatSendRateLimit(error: unknown, now = Date.now()): boolean {
  const e = error as { status?: number; retryAfter?: number } | null;
  if (!e || typeof e !== 'object' || e.status !== 429) return false;
  const sec = Math.min(
    typeof e.retryAfter === 'number' && e.retryAfter > 0 ? e.retryAfter : DEFAULT_COOLDOWN_SEC,
    MAX_COOLDOWN_SEC,
  );
  rateLimitedUntil = now + sec * 1000;
  return true;
}

export function chatSendCooldownRemainingSec(now = Date.now()): number {
  return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
}

/** @internal test helper */
export function resetChatSendRateLimitForTests(): void {
  rateLimitedUntil = 0;
}
