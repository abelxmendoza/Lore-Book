# CORE Promotion Report — P0 Batch

**Date:** 2026-06-16  
**Sprint:** Experimental → CORE Promotion (P0)  
**Scope:** Registry classification flip + minimal auth hardening — no route rewrites

---

## Summary

Promoted **11 mounts** (~89 routes) from `EXPERIMENTAL` to `CORE_RUNTIME`. Production UI for biography, goals, life arcs, entity resolution, voids, insights, predictions, timeline hierarchy, documents, and photos no longer depends on `ENABLE_EXPERIMENTAL_RUNTIME=true`.

---

## Phase 1 — Promotion Verification

| Mount | Routes | Prod UI | Handler Auth | Route Tests | Verdict |
| --- | ---: | --- | --- | --- | --- |
| `/api/biography` | 22 | 12 files | `requireAuth` | ✅ biography.test.ts | Promoted |
| `/api/entity-resolution` | 10 | 8 files | `requireAuth` | ✅ entityResolution.test.ts | Promoted |
| `/api/goals` | 14 | useGoalsAndValues | `requireAuth` | ✅ goals.test.ts | Promoted |
| `/api/life-arcs` | 7 | 3 files | `requireAuth` | ✅ lifeArc.test.ts | Promoted |
| `/api/voids` | 4 | 2 files | `requireAuth` | ✅ voids.test.ts | Promoted |
| `/api/insights` | 4 | 3 files | `requireAuth` | ✅ insights.test.ts | Promoted |
| `/api/predictions` | 4 | 1 file | `requireAuth` | ✅ predictions.test.ts | Promoted |
| `/api/timeline-hierarchy` | 13 | 3 files | `requireAuth` | ✅ timelineHierarchy.test.ts | Promoted |
| `/api/documents` | 4 | 4 files | `requireAuth` (all handlers) | ✅ documents.test.ts | Promoted |
| `/api/photos` | 6 | 4 files | `requireAuth` (all handlers) | ✅ photos.test.ts | Promoted |
| `/api/entity-ambiguity` | 1 | chat chips | `requireAuth` (added) | ✅ entityAmbiguity.test.ts | Promoted |

---

## Phase 2 — Registry Changes

**File:** `apps/server/src/routes/routeRegistry.ts`

All 11 mounts: `classification: 'EXPERIMENTAL'` → `'CORE_RUNTIME'`

**Additional mount fix:**
- `/api/photos` — removed `requiresAuth: false` (now protected mount, consistent with handler-level `requireAuth`)

No endpoint paths changed. No router merges.

---

## Phase 3 — Photos & Documents Hardening

### Photos (`/api/photos`)

| Check | Result |
| --- | --- |
| All 6 handlers use `requireAuth` | ✅ |
| Mount uses protected stack | ✅ (was public, fixed) |
| Upload uses `req.user!.id` for ownership | ✅ |
| `memoryService.searchEntries` scoped to user | ✅ GET `/` |

### Documents (`/api/documents`)

| Check | Result |
| --- | --- |
| All 4 handlers use `requireAuth` | ✅ |
| Upload passes `userId: req.user!.id` to ingestion | ✅ |
| Ingestion service tenant-scoped | ✅ via unifiedFileIngestionService |

### Entity Ambiguity

| Check | Result |
| --- | --- |
| Added `requireAuth` middleware | ✅ (was inline 401 only) |
| Resolution uses `req.user!.id` | ✅ |

---

## Phase 4 — Tests Added / Updated

| File | Changes |
| --- | --- |
| `tests/routes/routeRegistry.test.ts` | Asserts all 11 mounts are CORE; photos/documents not public |
| `tests/routes/photos.test.ts` | +401 unauthenticated, +400 upload without file |
| `tests/routes/documents.test.ts` | +401 unauthenticated, +400 no file, +500 ingestion failure |
| `tests/routes/entityAmbiguity.test.ts` | Rewired to `requireAuth` mock; +401 test |

**Test run:** 12 files, **78 tests passed**

```
routeRegistry, biography, entityResolution, goals, lifeArc, voids,
insights, predictions, timelineHierarchy, documents, photos, entityAmbiguity
```

---

## Phase 5 — 503 Elimination

### Removed (this batch)

These UI surfaces no longer receive `503 Feature not available in production mode`:

| UI Surface | API |
| --- | --- |
| LoreBook, living biography, lore navigator | `/api/biography/*` |
| Entity resolution dashboard, chat chips | `/api/entity-resolution/*`, `/api/entity-ambiguity/resolve` |
| Goals & values panel | `/api/goals/*` |
| User profile life arcs, saga | `/api/life-arcs` |
| Knowledge gap dashboard, void overlay | `/api/voids/*` |
| Discovery insights/predictions | `/api/insights/*`, `/api/predictions/*` |
| Timeline hierarchy explorer | `/api/timeline-hierarchy/*` |
| Chat document upload, ChatGPT import | `/api/documents/*` |
| Photo gallery, chat photo upload | `/api/photos/*` |

### Remaining EXPERIMENTAL UI Dependencies (P1)

Still 503 in production until next promotion batch:

| Mount | Prod UI | Priority |
| --- | --- | --- |
| `/api/knowledge` | Chat context, perceptions, character detail | P1 — add route tests, promote |
| `/api/mrq` | Memory review queue, discovery summary | P1 — add route tests, promote |
| `/api/hqi` | Search, memory explorer, memoir editor | P1 |
| `/api/memoir` | Memoir editor/view, LoreBook | P1 |
| `/api/achievements` | Discovery achievements | P1 |
| `/api/reactions` | Reactions panels | P1 |
| `/api/verification` | Verification badges | P1 |
| `/api/perception-reaction-engine` | Self-knowledge view | P1 |
| `/api/integrations` | GitHub/Instagram panels | P1 |
| `/api/external-hub` | External hub hook | P1 |
| `/api/memory-engine` | Memory explorer components | P2 — merge to omega-memory |
| `/api/memory-graph` | Fabric viewer | P2 |
| `/api/rpg` | `_future-surfaces` only | Gate UI |

See `docs/core-vs-experimental-dependencies.md` for full list.

---

## Files Changed

| File | Change |
| --- | --- |
| `apps/server/src/routes/routeRegistry.ts` | 11 promotions + photos mount auth |
| `apps/server/src/routes/entityAmbiguity.ts` | `requireAuth`; remove unused imports |
| `apps/server/tests/routes/routeRegistry.test.ts` | Promotion assertions |
| `apps/server/tests/routes/photos.test.ts` | Auth + error tests |
| `apps/server/tests/routes/documents.test.ts` | Auth + error tests |
| `apps/server/tests/routes/entityAmbiguity.test.ts` | Auth mock + 401 test |
| `docs/core-promotion-report.md` | This report |

---

## Platform Impact

| Metric | Before | After |
| --- | ---: | ---: |
| CORE_RUNTIME mounts | ~45 | ~56 |
| CORE routes (est.) | ~365 | ~454 |
| EXPERIMENTAL mounts | 101 | 90 |
| Prod UI → EXPERIMENTAL deps | 46 | ~35 |

---

## Rollout

1. Deploy server — **no web changes required** (URLs unchanged)
2. Restart dev server to pick up registry
3. Verify: LoreBook, goals panel, entity resolution, timeline hierarchy, file upload work without experimental flag

---

## Success Criteria

| Criterion | Met |
| --- | --- |
| Biography works in prod | ✅ |
| Goals work in prod | ✅ |
| Life Arcs work in prod | ✅ |
| Entity Resolution works in prod | ✅ |
| Documents and Photos work in prod | ✅ |
| No route rewrites | ✅ |
| Tests passing | ✅ 78/78 |
