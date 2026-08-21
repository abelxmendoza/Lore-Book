/**
 * In-process TTL cache with in-flight dedupe.
 * Used for per-user preview indexes that are expensive to rebuild and safe to
 * reuse for a short window (composer lexical/lorebook preview).
 */
export function createTtlMemo<T>(ttlMs: number) {
  type Entry = { value: T; expiresAt: number };
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now) return hit.value;

      const pending = inflight.get(key);
      if (pending) return pending;

      const promise = load()
        .then((value) => {
          cache.set(key, { value, expiresAt: Date.now() + ttlMs });
          return value;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, promise);
      return promise;
    },

    invalidate(key?: string): void {
      if (key === undefined) {
        cache.clear();
        inflight.clear();
        return;
      }
      cache.delete(key);
      inflight.delete(key);
    },

    get size(): number {
      return cache.size;
    },
  };
}
