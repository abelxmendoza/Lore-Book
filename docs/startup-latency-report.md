# Startup Latency Report

**Date:** 2026-06-16  
**Focus:** App boot → Life Timeline usable

---

## Startup Waterfall

```
Browser load
    │
    ▼
React mount
    │
    ├── Auth session (Supabase)
    │
    └── LoreKeeperProvider bootstrap (parallel)
            ├── GET /api/entries
            ├── GET /api/timeline      ─┐
            ├── GET /api/timeline/tags   ┘ parallel pair
            └── GET /api/chapters        ← slowest (critical path)
```

**Chat is not blocked.** Timeline/chapter panels wait on LoreKeeper bootstrap.

**Evolution (`/api/evolution`)** is not on boot (removed in evolution sprint — saves ~7.5s).

**Omni Timeline** (`/api/timeline/arcs`, `/eras`, `/sagas`, `/entries`) loads only when user navigates to that surface — not part of chat boot.

---

## Measured Results (Phase 5)

Benchmark: `npx tsx scripts/measure-timeline-boot.ts`  
User: `789bd607-e063-466f-a9ef-f68d24e8bb57` (local Supabase)

### Cold boot (cache cleared)

| Endpoint | Wall | DB | Compute | Serialize | OpenAI |
|----------|------|-----|---------|-----------|--------|
| `/api/timeline` | 515ms | 510ms | 0ms stitch | 3ms | 0ms |
| `/api/timeline/tags` | 127ms | 126ms | 0ms | 1ms | 0ms |
| `/api/chapters` | 665ms | 517ms entry + 76ms chapters | 72ms profile + 72ms candidates | — | 0ms |
| **Parallel wall** | **666ms** | | | | |

### Warm boot (30s entry cache)

| Endpoint | Wall | DB | Notes |
|----------|------|-----|-------|
| `/api/timeline` | 63ms | 60ms (chapters only) | Entry cache hit |
| `/api/timeline/tags` | 0ms | 0ms | Full cache hit |
| `/api/chapters` | 52ms | 51ms (chapters only) | Entry cache hit, insights cache hit |
| **Parallel wall** | **63ms** | | **10× faster** |

### Production comparison (user-reported, pre-optimization)

| Endpoint | Production (before) | Local cold (after) | Notes |
|----------|---------------------|--------------------|-------|
| `/api/timeline` | ~4,000ms | 515ms | Local DB closer; prod has larger corpus + network |
| `/api/chapters` | ~6,000ms | 665ms | Eliminated duplicate 400-row fetch |
| Boot critical path | ~6,000ms | 666ms local / **~63ms warm** | |

Production absolute times will remain higher than local dev due to:
- Larger entry counts (500+ rows with full content)
- Supabase network latency (Vercel iad1 → DB region)
- Cold serverless function starts

Relative improvement (duplicate query elimination) applies regardless of absolute latency.

---

## Optimizations Applied

1. **30s entry list cache** — One `SELECT * LIMIT 500` serves timeline, tags, chapters
2. **Tags `SELECT tags`** — Lightweight column fetch on cache miss
3. **Shared entries in listChapters** — Single fetch for profiles + candidates
4. **Preloaded chapters in buildProfiles** — Avoids duplicate chapter query
5. **Chapter insights cache fast-path** — Skip COUNT for 60s after write
6. **Timing instrumentation** — Dev headers on all three endpoints

---

## Client Waterfall — No Changes Required

- Single `LoreKeeperProvider` bootstrap (not per hook caller)
- `HomeScreen` does not fetch timeline data
- Life Timeline sidebar reads from context props
- Post-chat refresh in `useChat` is intentional

---

## How to Re-Measure After Deploy

1. Open DevTools → Network on preview deploy
2. Sign in, reload app
3. Check response headers on timeline endpoints
4. Compare first load (cold) vs second reload within 30s (warm)

```bash
curl -s -D - -H "Authorization: Bearer $TOKEN" https://your-preview.vercel.app/api/timeline
curl -s -D - -H "Authorization: Bearer $TOKEN" https://your-preview.vercel.app/api/chapters
```

Or run locally:

```bash
cd apps/server && npx tsx scripts/measure-timeline-boot.ts
```

---

## Vercel Build Blocker (Separate)

Deploy fails on `main` — missing untracked files:
- `apps/web/src/hooks/useAccountAuthority.ts`
- `apps/web/src/lib/accountAuthority.ts`

Commit these before deploy to validate production timing.
