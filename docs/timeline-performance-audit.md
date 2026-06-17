# Timeline Performance Audit

**Date:** 2026-06-16  
**Scope:** `/api/timeline`, `/api/timeline/tags`, `/api/chapters`  
**Goal:** Measure startup latency contributors without adding features or changing behavior.

---

## Phase 1 — Endpoint Trace (Exact Breakdown)

### `GET /api/timeline`

| Stage | Handler | Measured (local dev) | Production (before opt) |
|-------|---------|----------------------|-------------------------|
| Auth | `requireAuth` | ~1ms | ~1ms |
| Entry DB | `searchEntries(limit:365)` | 443ms cold / 0ms cache hit | ~2,500ms |
| Chapter DB | `chapterService.listChapters` | 67ms cold / 60ms warm | ~300ms |
| Stitch | Group by chapter + month | 0ms | ~50–150ms |
| Serialize | `JSON.stringify(timeline)` | 3ms | ~50–200ms |
| OpenAI | — | **0ms** | **0ms** |
| **Total** | | **515ms cold / 63ms warm** | **~4,000ms** |

**Arc loading:** Not on this endpoint. Arcs load separately on Omni Timeline via `GET /api/timeline/arcs` (`useTimelineData`).

Dev headers: `X-Timeline-Timing-Ms`, `X-Timeline-Db-Ms`, `X-Timeline-Stitch-Ms`, `X-Timeline-Serialize-Ms`, `X-Timeline-Chapter-Load-Ms`, `X-Timeline-Entry-Cache-Hit`, `X-Timeline-Openai-Ms`

---

### `GET /api/timeline/tags`

| Stage | Handler | Measured (local dev) | Production (before opt) |
|-------|---------|----------------------|-------------------------|
| Auth | `requireAuth` | ~1ms | ~1ms |
| Entry DB | `SELECT tags … LIMIT 500` (or cache) | 126ms cold / 0ms cache hit | ~2,500ms (was `SELECT *`) |
| Compute | Tag count aggregation | 0ms | ~10–50ms |
| Serialize | `JSON.stringify({ tags })` | 1ms | ~5–20ms |
| OpenAI | — | **0ms** | **0ms** |
| **Total** | | **127ms cold / 0ms warm** | **~4,000ms** (parallel with timeline) |

Dev headers: `X-Timeline-Tags-Timing-Ms`, `X-Timeline-Tags-Db-Ms`, `X-Timeline-Tags-Compute-Ms`, `X-Timeline-Tags-Serialize-Ms`, `X-Timeline-Tags-Cache-Hit`, `X-Timeline-Tags-Openai-Ms`

---

### `GET /api/chapters`

| Stage | Handler | Measured (local dev) | Production (before opt) |
|-------|---------|----------------------|-------------------------|
| Auth | `requireAuth` | ~1ms | ~1ms |
| Entry DB | `searchEntries(limit:400)` | 517ms cold / 0ms cache hit | ~2,500ms × **2** (duplicate) |
| Chapter DB | `chapterService.listChapters` | 76ms | ~300ms |
| Profile compute | `buildProfiles` (facets, traits) | 72ms / 1ms cache hit | ~500ms |
| Candidate compute | `detectCandidates` | 72ms / 1ms cache hit | ~500ms |
| Serialize | `JSON.stringify({ chapters, candidates })` | included in total | ~100–300ms |
| OpenAI | — | **0ms** | **0ms** |
| **Total** | | **665ms cold / 52ms warm** | **~6,000ms** |

Dev headers: `X-Chapters-Timing-Ms`, `X-Chapters-Db-Ms`, `X-Chapters-Entry-Fetch-Ms`, `X-Chapters-Chapter-Load-Ms`, `X-Chapters-Profile-Compute-Ms`, `X-Chapters-Candidate-Compute-Ms`, `X-Chapters-Serialize-Ms`, `X-Chapters-Cache-Hit`

---

## Phase 2 — Query Audit

### Queries per bootstrap (before optimization)

| Endpoint | Query | Rows | Index |
|----------|-------|------|-------|
| `/api/timeline` | `journal_entries SELECT * … LIMIT 365` | 365 | `(user_id, date DESC)` |
| `/api/timeline/tags` | `journal_entries SELECT * … LIMIT 500` | 500 | Same |
| `/api/chapters` (profiles) | `journal_entries SELECT * … LIMIT 400` | 400 | Same |
| `/api/chapters` (candidates) | `journal_entries SELECT * … LIMIT 400` | 400 | Duplicate |
| `/api/chapters` (cache check) | `journal_entries COUNT` | — | Index scan |
| All | `chapters SELECT * WHERE user_id = ?` | N | `chapters_user_id_idx` |

**Total entry row reads (cold boot, before):** 365 + 500 + 400 + 400 = **1,665 rows**

### Queries per bootstrap (after optimization)

| Endpoint | Query | Rows | Notes |
|----------|-------|------|-------|
| First simple list call | `SELECT * … LIMIT 500` | 500 | Populates 30s cache |
| `/api/timeline` | Cache slice to 365 | 0 DB (warm) | |
| `/api/timeline/tags` | Cache aggregate OR `SELECT tags LIMIT 500` | 0–500 tags cols | |
| `/api/chapters` | Cache slice to 400 + chapters list | 0 entry DB (warm) | Single fetch in controller |
| Chapter insights cache hit | Skip profile rebuild | 0 entry DB | 60s fast-path skips COUNT |

**Total entry row reads (warm boot):** **0** (cache hit)  
**Total entry row reads (cold boot):** **~500** (one full scan + tags-only if racing)

### Issues found & resolved

| Issue | Severity | Fix |
|-------|----------|-----|
| 4 duplicate entry fetches | Critical | 30s entry list cache |
| Full-row fetch for tags | High | `SELECT tags` on cache miss |
| detectCandidates re-fetch | High | Shared entries in controller |
| buildProfiles re-fetch chapters | Medium | Preloaded chapters param |
| COUNT on every cache hit | Medium | 60s fast-path TTL |
| N+1 patterns | None | — |
| Full table scans | None | Indexes exist |
| Unbounded fetches | None | All queries have LIMIT |

---

## Phase 3 — Client Waterfall

### Bootstrap: `LoreKeeperProvider` (single instance)

```
App mount
└── LoreKeeperProvider useEffect (once per session)
    ├── refreshEntries()     → GET /api/entries
    ├── refreshTimeline()    → parallel:
    │   ├── GET /api/timeline
    │   └── GET /api/timeline/tags
    └── refreshChapters()    → GET /api/chapters
```

**Parallel wall clock:** `max(entries, timeline+tags, chapters)` ≈ slowest of the three.

### Component audit

| Component | Fetches on mount | Data source |
|-----------|------------------|-------------|
| **HomeScreen** | `/api/characters/list`, skills API | Does **not** fetch timeline/chapters/tags |
| **Life Timeline sidebar** (`ImprovedTimelineView`) | None | Props from parent via `useLoreKeeper()` |
| **TimelinePanel** | None | Props only |
| **LoreKeeperProvider** | entries + timeline + tags + chapters | Canonical boot source |
| **App.tsx** | Only on mock-data toggle change | Not duplicate on normal boot |
| **useChat** | Post-message refresh at 4s/11s | Intentional post-ingestion |
| **TimelinePage** (Omni Timeline) | `/api/timeline/entries`, `/eras`, `/sagas`, `/arcs` | **Lazy** — only when user opens Omni Timeline surface |
| **LoreBook** | `/api/biography/main-lifestory` | Uses `useLoreKeeper().chapters` (no extra chapter fetch) |

### Duplicate requests

| Request | Boot duplicates | Resolution |
|---------|-----------------|------------|
| `/api/timeline` | 1 (provider only) | ✅ Already deduped |
| `/api/timeline/tags` | 1 (bundled in refreshTimeline) | ✅ |
| `/api/chapters` | 1 (provider only) | ✅ |
| `/api/entries` | 1 (provider only) | ✅ |
| Post-chat refresh | Yes (useChat) | By design |

### Cache sharing opportunities (implemented)

| Layer | Mechanism |
|-------|-----------|
| Server | 30s entry list cache across timeline/tags/chapters |
| Server | Chapter insights cache (10min, entry-count invalidation) |
| Client | Single LoreKeeperProvider state (no per-component fetch) |
| Client | localStorage entry cache (10 entries, display only) |

### Lazy-load candidates (not implemented — out of scope)

| Candidate | Savings | Trade-off |
|-----------|---------|-----------|
| Defer `/api/chapters` until timeline tab open | ~2–6s on chat-only users | Empty chapter panel briefly |
| Defer `/api/timeline/tags` until tag filter used | ~0.3–4s | Tags unavailable on first paint |
| Omni Timeline arcs/eras | Already lazy (separate route) | — |

---

## Instrumentation

Run benchmark locally:

```bash
cd apps/server && npx tsx scripts/measure-timeline-boot.ts [userId]
```

Measure via HTTP (dev headers):

```bash
curl -s -D - -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/timeline | grep X-Timeline
```

---

## Remaining Bottlenecks

1. **Cold boot `SELECT *`** — Full row payload including content/embeddings metadata
2. **Production corpus size** — Local benchmark user ~500 entries; production users with large journals see higher absolute times
3. **Chapter profile CPU** — O(chapters × entries) in-memory on cache miss
4. **Omni Timeline separate fetch** — 4 additional requests when user opens that surface (not boot path)
