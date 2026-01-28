# Analytics Execution Blueprint — Phase B

**Focus:** Cache correctness + invalidation

---

## Goal

- Avoid recomputation
- Never serve stale analytics
- Keep caching simple and observable

---

## Cache Interface

```ts
interface AnalyticsCache {
  get(key: string): AnalyticsResult<AnalyticsPayload> | null;
  set(key: string, result: AnalyticsResult<AnalyticsPayload>): void;
  invalidateByUser(userId: string): void;
}

cache = InMemoryCache(); // Phase B default
```

---

## Cache Key (Already Designed)

`buildCacheKey(context, analyticsType)` already exists in [apps/server/src/services/analytics/orchestrator.ts](apps/server/src/services/analytics/orchestrator.ts):

```ts
function buildCacheKey(context: AnalyticsContext, analyticsType: string): string {
  return hash({
    userId: context.userId,
    analyticsType,
    dataVersion: context.dataVersion,
    modelVersion: context.modelVersion,
    timeWindow: context.timeWindow
  });
}
```

---

## Execute Module (Updated)

```ts
function executeModule(module, context) {
  cacheKey = buildCacheKey(context, module.name);

  cached = cache.get(cacheKey);
  if (cached) {
    cached.diagnostics.warnings.push("CACHE_HIT");
    return cached;
  }

  startTimer();
  result = runModule(module, context);
  result.diagnostics.executionTimeMs = stopTimer();

  cache.set(cacheKey, result);
  return result;
}
```

---

## Invalidation Strategy

- **Automatic via dataVersion change** — No manual deletes needed in Phase B. When `computeDataVersion(userId)` changes (e.g. new journal entry), the next request gets a new `context.dataVersion`, so `buildCacheKey` produces a different key and the cache is effectively bypassed for that user until recomputed.
- **Optional manual invalidation hook:**

```ts
function onNewMemory(userId: string): void {
  cache.invalidateByUser(userId);
}
```

---

## Observability

Log:

- `analyticsType` (from `result.diagnostics.analyticsType`)
- `cacheHit` / `cacheMiss`
- `executionTimeMs`
- `dataVersion`
- `modelVersion`

---

## Non-Goals (Not Yet)

- Distributed cache
- Partial recomputation
- TTL-based eviction
- Cache warming

Keep it boring and correct first.

---

## Relation to Phase A

Phase A added the orchestrator ([orchestrator.ts](apps/server/src/services/analytics/orchestrator.ts)), `buildAnalyticsContext`, `buildCacheKey`, `executeModule` (without cache), and types in [types.ts](apps/server/src/services/analytics/types.ts). Phase B wires an `AnalyticsCache` into `executeModule`: check cache before `runModule`, set result in cache after, and optionally support `invalidateByUser` for explicit invalidation. The existing `buildCacheKey` is the cache key; no change to its signature.
