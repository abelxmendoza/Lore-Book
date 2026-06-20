/**
 * Shared in-memory rate limit counters (free — no Redis).
 *
 * For multi-instance deploys, set RATE_LIMIT_BACKEND=postgres to persist
 * buckets in Supabase Postgres (already included in your stack).
 */
export type RateLimitRecord = {
  count: number;
  resetTime: number;
};

export type RateLimitStore = Map<string, RateLimitRecord>;

const globalStores = new Set<RateLimitStore>();

export function createRateLimitStore(): RateLimitStore {
  const store: RateLimitStore = new Map();
  globalStores.add(store);
  return store;
}

export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now()
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const record = store.get(key);

  if (!record || now > record.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }

  if (record.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((record.resetTime - now) / 1000)),
    };
  }

  record.count += 1;
  return { allowed: true };
}

export function pruneRateLimitStore(store: RateLimitStore, now = Date.now()): void {
  for (const [key, record] of store.entries()) {
    if (now > record.resetTime) store.delete(key);
  }
}

/** Periodic cleanup for every in-memory store in the process. */
export function startRateLimitStoreJanitor(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const store of globalStores) {
      pruneRateLimitStore(store, now);
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
