# Timeline Performance Results

**Date:** 2026-06-16  
**Sprint:** Startup Latency & Timeline Performance  
**Status:** Complete — measured locally; production re-measure after deploy

---

## Summary

| Metric | Before (prod reported) | After (local measured) | After (warm cache) |
|--------|------------------------|------------------------|---------------------|
| Entry DB queries on boot | 4 full scans | 1 scan (+ tags cols) | **0** |
| Entry rows transferred | ~1,665 | ~500 | **0** (cached) |
| `/api/timeline` | ~4,000ms | **515ms** | **63ms** |
| `/api/timeline/tags` | ~4,000ms | **127ms** | **0ms** |
| `/api/chapters` | ~6,000ms | **665ms** | **52ms** |
| Parallel boot wall | ~6,000ms | **666ms** | **63ms** |

Local benchmark: `npx tsx scripts/measure-timeline-boot.ts`  
User: `789bd607-e063-466f-a9ef-f68d24e8bb57`

---

## Phase 1 — Exact Breakdown (After, Cold Boot)

### `/api/timeline` — 515ms total

| Component | ms | % |
|-----------|-----|---|
| Entry DB | 443 | 86% |
| Chapter DB | 67 | 13% |
| Stitch | 0 | 0% |
| Serialize | 3 | 1% |
| OpenAI | 0 | 0% |

### `/api/timeline/tags` — 127ms total

| Component | ms | % |
|-----------|-----|---|
| Entry DB (`SELECT tags`) | 126 | 99% |
| Compute | 0 | 0% |
| Serialize | 1 | 1% |
| OpenAI | 0 | 0% |

### `/api/chapters` — 665ms total

| Component | ms | % |
|-----------|-----|---|
| Entry DB | 517 | 78% |
| Chapter DB | 76 | 11% |
| Profile compute | 72 | 11% |
| Candidate compute | 72 | (parallel with profile) |
| OpenAI | 0 | 0% |

Arc/era/saga loading: **not on boot endpoints** — loads on Omni Timeline page only.

---

## Queries Removed

| Optimization | Before | After |
|--------------|--------|-------|
| Entry fetches per boot | 4 × `SELECT *` | 1 × `SELECT * LIMIT 500` |
| Tags payload | 500 full rows | 500 tag columns OR cache |
| Chapters entry fetches | 2 × 400 rows | 1 shared fetch |
| Chapter list in buildProfiles | Duplicate query | Preloaded from controller |
| Cache COUNT check | Every hit | Skipped for 60s |

**Net:** ~3 fewer full entry scans per cold boot (−75% DB reads).

---

## Duplicate Requests Removed

### Server

| Duplicate | Resolution |
|-----------|------------|
| timeline 365 + tags 500 + chapters 400×2 | Single 500-row cache |
| detectCandidates re-fetch | Shared entries |
| buildProfiles chapter re-fetch | Preloaded chapters |

### Client

No boot duplicates — single `LoreKeeperProvider` (confirmed in Phase 3 audit).

Post-chat `refreshTimeline/refreshChapters` in `useChat` remains intentional.

---

## Code Changes

| File | Change |
|------|--------|
| `memoryService.ts` | Entry cache, timing breakdown, tags-only query |
| `chapterInsightsService.ts` | Preloaded entries + chapters |
| `chapterInsightsCacheService.ts` | 60s fast-path |
| `chaptersController.ts` | Single fetch, detailed timing headers |
| `timelineController.ts` | Timing headers |
| `routes/timeline.ts` | Tags timing headers |
| `scripts/measure-timeline-boot.ts` | Benchmark script |

---

## Tests

```
tests/memoryService.test.ts       — 4 pass
tests/timelineController.test.ts — 1 pass
tests/routes/timeline.test.ts     — 2 pass
```

---

## Remaining Bottlenecks

1. **Cold boot entry fetch** — Still dominates (~86% of timeline time)
2. **`SELECT *` payload** — Content + metadata shipped when stitch needs ~6 fields
3. **Production scale** — Larger journals + cross-region DB latency inflate absolute ms
4. **Omni Timeline** — 4 extra requests when user opens that surface (lazy, not boot)
5. **No HTTP caching** — In-process 30s cache only; new session refetches

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| Timeline loads noticeably faster | ✅ 666ms local cold vs ~6s prod before |
| Startup waterfall reduced | ✅ 4 scans → 1 |
| No functionality changes | ✅ Same API response shapes |
| Measured improvements | ✅ Local benchmark + dev headers |
| Instrumentation | ✅ All three endpoints |
| Docs created | ✅ audit + startup + results |

---

## Next Steps

1. Commit server changes + untracked `useAccountAuthority` files (fixes Vercel build)
2. Deploy and capture production `X-*-Timing-Ms` headers
3. Update this doc with production after numbers
