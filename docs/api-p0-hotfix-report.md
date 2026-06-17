# API P0 Hotfix Report

**Date:** 2026-06-16  
**Sprint:** API P0 Hotfix Execution  
**Prerequisite:** `docs/api-inventory.md`, `docs/api-consolidation-roadmap.md`

---

## Mission

Eliminate production-facing API instability from verified P0 audit findings — **no domain merges, no architectural rewrites**.

---

## Files Changed

| File | Change |
| --- | --- |
| `apps/server/src/routes/routeRegistry.ts` | Promote chronology + identity to CORE; replace health mounts with `/api/wellness`; fix account mount auth |
| `apps/server/src/routes/wellness.ts` | **New** — wellness routes (symptoms, sleep, energy, analyze, etc.) |
| `apps/server/src/routes/health.ts` | **Deleted** — wellness no longer collides with system liveness |
| `apps/server/src/routes/chatOrchestration.ts` | Fix POST handler path `/message` → `/` |
| `apps/server/src/routes/identity.ts` | Wire `/pulse` to `identityPulseModule` (same as former analytics route) |
| `apps/server/src/routes/analytics.ts` | Deprecation comment on `/identity` |
| `apps/web/src/api/identity.ts` | `fetchIdentityPulse` → `/api/identity/pulse` |
| `apps/server/tests/routes/chatOrchestration.test.ts` | Canonical path + legacy 404 regression test |
| `apps/server/tests/routes/wellness.test.ts` | **New** — replaces health.test.ts |
| `apps/server/tests/routes/health.test.ts` | **Deleted** |
| `docs/core-vs-experimental-dependencies.md` | **New** — Phase 1 audit |
| `docs/api-p0-hotfix-report.md` | **New** — this report |

---

## Routes Fixed

| Issue | Before | After |
| --- | --- | --- |
| Chronology 503 | `EXPERIMENTAL` — 503 in prod | `CORE_RUNTIME` — always mounted |
| Identity pulse 503 | `GET /api/analytics/identity` (ADMIN tier) | `GET /api/identity/pulse` (CORE) |
| Identity WhatAIKnows 503 | `/api/identity` EXPERIMENTAL | `/api/identity` CORE_RUNTIME |
| Chat double path | `POST /api/chat/message/message` | `POST /api/chat/message` |
| Health collision | Wellness at `/api/health/symptoms` etc. + liveness | Liveness: `index.ts` `/api/health` only; Wellness: `/api/wellness/*` |
| Root wellness leak | `GET /symptoms` at `/` mount | **Removed** — no `/` health mount |

### Canonical Routes (Post-Fix)

```
GET  /api/health              → system liveness (index.ts)
GET  /api/health/db           → schema health (index.ts)
POST /api/chat/message        → chat orchestration
GET  /api/identity/pulse      → identity pulse (authenticated)
GET  /api/chronology          → chronology (CORE)
POST /api/wellness/analyze    → wellness analysis
GET  /api/wellness/symptoms   → user symptoms
GET  /api/wellness/score      → wellness score (was /api/health/wellness)
```

---

## 503 Risks Removed

| Risk | Severity | Status |
| --- | --- | --- |
| Timeline/chronology views 503 in production | P0 | ✅ Fixed — chronology promoted |
| Identity pulse header 503 in production | P0 | ✅ Fixed — moved off ADMIN analytics |
| WhatAIKnows page 503 in production | P0 | ✅ Fixed — identity promoted |
| Chat orchestration wrong path (404 or double segment) | P0 | ✅ Fixed |
| Railway healthcheck hitting wellness handler | P1 | ✅ Fixed — `/api/health` is liveness-only |

### 503 Risks Remaining (P1 — Not in P0 Scope)

| UI Surface | Route | Action |
| --- | --- | --- |
| LoreBook / Biography | `/api/biography/*` | Promote to CORE |
| Goals & Values | `/api/goals/*` | Promote to CORE |
| Life Arcs | `/api/life-arcs` | Promote to CORE |
| Knowledge Gaps | `/api/voids/*` | Promote to CORE |
| Insights panel | `/api/insights`, `/api/predictions` | Promote to CORE |
| Entity resolution UI | `/api/entity-resolution/*` | Promote to CORE |
| Timeline hierarchy | `/api/timeline-hierarchy/*` | Promote to CORE |
| Knowledge panel | `/api/knowledge/*` | Promote to CORE |
| Memory review queue | `/api/mrq/*` | Promote to CORE |
| Chat file upload | `/api/documents/*`, `/api/photos/*` | Promote to CORE |
| HQI search | `/api/hqi/*` | Promote or merge to search |

See `docs/core-vs-experimental-dependencies.md` for full list.

---

## Phase 6 — Auth Consistency

### Safe Fix Applied

| Mount | Before | After | Reason |
| --- | --- | --- | --- |
| `/api/account` | `requiresAuth: false` (public mount) | Protected mount (default) | Export/delete always require auth; bypassed CSRF stack unnecessarily |

### Documented — No Code Change (Risky)

| Mount | Handler Auth | Issue | Recommendation |
| --- | --- | --- | --- |
| `/api/entries` | requireAuth | Public mount bypasses apiRouter CSRF/rate-limit | P1: set `requiresAuth: true` |
| `/api/chat` | optionalAuth | Intentional dev behavior | Keep public; document |
| `/api/timeline` | mixed | Public mount | P1: set protected after handler audit |
| `/api/corrections` | requireAuth | Public mount | P1: set protected |
| `/api/chapters`, `/api/evolution`, `/api/locations` | requireAuth | Public mount | P1: set protected |
| `/api/summary`, `/api/canon` | requireAuth | Public mount | P1: set protected |
| `/api/diagnostics` | mixed | Public root OK for deploy probe | Per-route auth already correct |
| `/api/legal` | none | Truly public | Keep public |

---

## Phase 7 — Verification

### Tests Run

```
tests/routes/chatOrchestration.test.ts  — 4 passed
tests/routes/wellness.test.ts           — 7 passed
```

### Manual Verification Matrix

| Check | Result |
| --- | --- |
| Chronology tier = CORE_RUNTIME | ✅ `routeRegistry.ts` |
| Identity tier = CORE_RUNTIME | ✅ `routeRegistry.ts` |
| No health router on `/api/health` | ✅ Removed from registry |
| Inline `/api/health` in index.ts unchanged | ✅ Railway liveness preserved |
| Frontend identity pulse URL | ✅ `/api/identity/pulse` |
| Chat canonical POST path | ✅ `/api/chat/message` |
| Legacy `/api/chat/message/message` | ✅ Returns 404 (regression test) |

---

## Remaining P1 Consolidation Work

1. **Promote remaining CORE UI experimental mounts** — biography, goals, life-arcs, voids, insights, entity-resolution, timeline-hierarchy, knowledge, mrq, documents/photos (see dependency doc)
2. **Merge `/api/threads` into `/api/conversation`** — not started (out of P0 scope)
3. **Merge timeline v1 → v2** — not started
4. **Normalize public mount flags** — entries, timeline, corrections, chapters
5. **Diagnostics consolidation** — move admin/dev diagnostics to target structure
6. **Response envelope** — `sendSuccess`/`sendError` helpers

---

## Success Criteria

| Criterion | Met? |
| --- | --- |
| Verified P0 audit issues fixed | ✅ |
| No major refactors / domain merges | ✅ |
| Chronology works on CORE in production | ✅ |
| Identity pulse off ADMIN analytics | ✅ |
| Chat route canonical | ✅ |
| System health vs wellness separated | ✅ |
| All production pages on CORE only | ⚠️ Partial — P1 promotions still needed for biography, goals, etc. |
| Regression tests added | ✅ chat + wellness |

---

## Rollout Notes

- **No frontend chronology URL changes** — tier promotion only
- **Wellness URL change** — `/api/health/*` wellness paths → `/api/wellness/*` (no known frontend callers; zero client diff expected)
- **Identity pulse URL change** — one line in `apps/web/src/api/identity.ts`
- **Deploy order** — server + web together for identity pulse; chronology server-only safe
