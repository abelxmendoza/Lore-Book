# Evolution Endpoint Performance Audit

**Date:** 2026-06-16  
**Endpoint:** `GET /api/evolution`  
**Route:** `apps/server/src/routes/evolution.ts`  
**Service:** `apps/server/src/services/evolutionService.ts`

## Executive Summary

The ~7500ms latency observed on chat page load was **not** caused by database or graph queries. It was dominated by a single OpenAI `chat.completions.create` call (~95% of wall time), triggered unnecessarily on every app boot because multiple components each mounted `useLoreKeeper()` and ran bootstrap effects including `/api/evolution`.

## Request Trace

```
GET /api/evolution
  └─ evolutionService.analyze(userId)
       ├─ memoryService.searchEntries(userId, { limit: 180 })   ← 1 DB query
       ├─ buildStats(entries)                                    ← in-process, ~1ms
       ├─ buildContext(entries)                                  ← in-process, ~1ms
       └─ openai.chat.completions.create(...)                    ← ~7000ms (dominant)
```

### What evolution does NOT do

- No embeddings calls
- No graph/relationship recovery
- No thread summary queries
- No timeline service calls
- No N+1 query loops

## Latency Breakdown (Before Fixes)

| Stage | Estimated Time | % of Total | Notes |
|-------|---------------|------------|-------|
| Auth middleware | ~5–20ms | <1% | JWT validation |
| DB: `journal_entries` SELECT (limit 180) | ~30–100ms | ~1% | Single query via `memoryService.searchEntries` |
| In-process stats/context build | ~1–5ms | <1% | Tag/mood aggregation over ≤180 rows |
| OpenAI chat completion | ~6500–7500ms | **~95%** | JSON-mode persona synthesis |
| JSON parse + response serialize | ~1ms | <1% | |
| **Total (cold)** | **~7500ms** | 100% | Matches browser console measurement |

### DB query detail

```sql
-- Equivalent Supabase query
SELECT * FROM journal_entries
WHERE user_id = $1
ORDER BY date DESC
LIMIT 180;
```

Indexed on `user_id`; bounded at 180 rows. Not a bottleneck.

## Root Cause: Unnecessary Invocation

Before consolidation, `useLoreKeeper()` was a standalone hook. Every component that called it ran identical mount effects:

- `ChatFirstInterface`, `useChat`, `App`, `CharacterBook`, etc. (15+ call sites)

Each instance fired:

- `/api/entries`
- `/api/timeline` + `/api/timeline/tags`
- `/api/chapters`
- **`/api/evolution`** ← 7s OpenAI call, **no UI on chat load reads `evolution`**

The monitoring hook flagged the slow call because evolution ran during auth/bootstrap, blocking perceived page readiness.

## Fixes Applied

### 1. Lazy evolution (client)

- Moved lore state into `LoreKeeperProvider` (`apps/web/src/contexts/LoreKeeperContext.tsx`)
- Bootstrap effect calls only `refreshEntries`, `refreshTimeline`, `refreshChapters`
- `refreshEvolution(refresh?)` is explicit/lazy — not called on chat load

### 2. Server-side cache (30 min TTL)

- In-memory per-user cache in `EvolutionService`
- Cache hit: ~0ms, no DB, no OpenAI
- `GET /api/evolution?refresh=true` bypasses cache for forced refresh

### 3. Dev timing headers

Non-production responses include:

- `X-Evolution-Timing-Ms`
- `X-Evolution-Db-Ms`
- `X-Evolution-Openai-Ms`
- `X-Evolution-Cache-Hit` (`1` or `0`)

Slow OpenAI calls (>3s) log structured timing via `logger.info`.

## After Fixes

| Scenario | Expected Latency |
|----------|-------------------|
| Chat page load | **0ms** — evolution not called |
| First explicit evolution fetch (cold) | ~7500ms — unchanged OpenAI cost |
| Repeat evolution fetch (cached) | **<5ms** — memory cache hit |
| Evolution after `?refresh=true` | ~7500ms — intentional cold path |

## Remaining Bottlenecks (Evolution-Specific)

| Issue | Priority | Notes |
|-------|----------|-------|
| OpenAI cold path still ~7s | P2 | Acceptable when user opens evolution UI; consider background job + stale-while-revalidate |
| In-memory cache not shared across server instances | P3 | Fine for single-process dev; use Redis for multi-instance prod |
| No cache invalidation on new journal entry | P3 | Insights may be up to 30 min stale; call `evolutionService.invalidate(userId)` from entry POST if needed |

## Verification

```bash
# Server tests
cd apps/server && npm test -- tests/routes/evolution.test.ts tests/services/evolutionService.test.ts

# Manual: chat load should NOT show /api/evolution in network tab
# Manual: curl with auth — second request should show X-Evolution-Cache-Hit: 1
```
