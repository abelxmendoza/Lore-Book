/**
 * Client read-cache over fetchJson — fewer refetches, lower egress.
 *
 * The app has no query library, so read-heavy GETs (entity detail, knowledge
 * base, lists) re-hit the API on every view. This adds two wins for idempotent
 * GETs:
 *   - TTL cache: a repeat read within `ttlMs` returns the stored value, no network.
 *   - In-flight dedupe: concurrent reads of the same URL share ONE request (e.g.
 *     a list that renders the same entity many times, or a modal that mounts twice).
 *
 * Durability is unaffected — the source of truth stays in Postgres. This is a
 * pure read optimization layered on top. Use ONLY for GETs; after a mutation
 * (edit/merge/delete) call `invalidateCache(entityId)` so the next read is fresh.
 */
import { fetchJson } from './api';

type CacheEntry<T> = { at: number; data: T };

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Conservative default — fresh enough that recent ingestion surfaces quickly. */
export const DEFAULT_CACHE_TTL_MS = 60_000;

export interface CachedFetchOptions {
  /** Time a cached value is considered fresh. Default 60s. */
  ttlMs?: number;
  /** Skip the cached value and force a network read (still repopulates the cache). */
  force?: boolean;
}

/**
 * Cached GET over fetchJson, keyed by URL. Returns the cached value when fresh,
 * joins an in-flight request when one is already pending, otherwise fetches and
 * stores. Cache hits also skip fetchJson's per-call session lookup.
 */
export async function cachedFetchJson<T>(url: string, options: CachedFetchOptions = {}): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;

  if (!options.force) {
    const hit = cache.get(url) as CacheEntry<T> | undefined;
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    const pending = inFlight.get(url) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const request = fetchJson<T>(url)
    .then((data) => {
      cache.set(url, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      // Only clear the slot if it's still ours (a forced refetch may have replaced it).
      if (inFlight.get(url) === request) inFlight.delete(url);
    });

  inFlight.set(url, request);
  return request;
}

/**
 * Drop cached entries whose URL contains `substr` (e.g. an entity id) so the next
 * read re-fetches. Call after a mutation. With no argument, clears everything.
 */
export function invalidateCache(substr?: string): void {
  if (substr === undefined) {
    cache.clear();
    inFlight.clear();
    return;
  }
  for (const key of [...cache.keys()]) if (key.includes(substr)) cache.delete(key);
  for (const key of [...inFlight.keys()]) if (key.includes(substr)) inFlight.delete(key);
}
