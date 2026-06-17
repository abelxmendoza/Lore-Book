# CORE vs EXPERIMENTAL Frontend Dependencies

**Audit date:** 2026-06-16  
**Scope:** `apps/web` calls to `/api/*` where mount tier is not `CORE_RUNTIME` in production default

---

## Summary

| Disposition | Count | Description |
| --- | ---: | --- |
| **Fixed in P0 hotfix** | 3 | Promoted or rerouted — no longer 503 in prod |
| **Promote to CORE (P1)** | 14 | Active CORE UI callers — still 503 in prod today |
| **Gate UI (P1)** | 4 | `_future-surfaces` or dev-only — hide when experimental off |
| **Remove dependency (P2)** | 3 | Dead or duplicate paths |
| **Admin-only (OK gated)** | 1 | Analytics modules config — not main product UI |

---

## Fixed in P0 Hotfix ✅

| Frontend | Route | Was | Fix |
| --- | --- | --- | --- |
| `api/timelineV2.ts`, `stitchedTimeline.ts`, `calendarMonth.ts`, `TimelineCalendarView`, `ChronologyNarrativeModal` | `/api/chronology/*` | EXPERIMENTAL | **Promoted to CORE_RUNTIME** |
| `api/identity.ts` → `useIdentityPulse` | `/api/analytics/identity` | ADMIN tier (503) | **Moved to `/api/identity/pulse`** + identity promoted to CORE |
| `routes/WhatAIKnows.tsx` | `/api/identity/*` | EXPERIMENTAL | **Identity mount promoted to CORE** |

---

## Active CORE UI → EXPERIMENTAL (P1 — Promote)

These routes are called from production-facing UI (not `_future-surfaces`). They return **503** unless `ENABLE_EXPERIMENTAL_RUNTIME=true`.

| Route / Mount | Frontend Callers | Disposition |
| --- | --- | --- |
| `/api/biography/*` | `LoreBook.tsx`, `useLoreNavigatorData`, `livingBiography.ts`, `LorebookStats`, `BiographyGenerator`, `KnowledgeBaseCreator`, `LorebookRecommendations`, `useDiscoverySummary` | **PROMOTE to CORE** |
| `/api/goals/*` | `useGoalsAndValues.ts` | **PROMOTE to CORE** |
| `/api/life-arcs` | `useLifeArcs.ts`, `api/saga.ts` | **PROMOTE to CORE** |
| `/api/voids/*` | `VoidMemoryOverlay`, `KnowledgeGapDashboard` | **PROMOTE to CORE** |
| `/api/insights`, `/api/predictions` | `useInsightsAndPredictions`, `useDiscoverySummary`, `MonthlyYearlyInsights` | **PROMOTE to CORE** |
| `/api/entity-resolution/*` | `entityResolution.ts`, chat chips, entity panels, `SkillDetailModal` | **PROMOTE to CORE** |
| `/api/entity-ambiguity/resolve` | `EntityClarificationChip.tsx` | **MERGE into entity-resolution, PROMOTE** |
| `/api/timeline-hierarchy/*` | `useTimelineHierarchy`, `TimelineNodeDetailModal`, `MemoryFiltersSidebar`, `MemoryExplorer` | **PROMOTE to CORE** |
| `/api/knowledge/*` | `knowledge.ts`, `ActiveContextPanel`, `SelfKnowledgeView`, `CharacterDetailModal` | **PROMOTE to CORE** |
| `/api/mrq/*` | `useMemoryReviewQueue`, `ChatMemorySuggestion`, `useDiscoverySummary` | **PROMOTE to CORE** |
| `/api/documents/*`, `/api/photos/*` | `DocumentUpload`, `ChatGPTImport`, `PhotoGallery`, `PhotoAlbum` | **PROMOTE to CORE** (ingestion sprint) |
| `/api/hqi/*` | `HQIPanel`, `useHQISearch`, `HQIResultCard` | **PROMOTE to CORE** or merge into `/api/search` |
| `/api/external-hub/*` | `useExternalHub.ts` | **PROMOTE to CORE** or gate integrations UI |
| `/api/memory-engine/*` | `MemoryComponents.tsx` (memory explorer) | **REPLACE with CORE memory route (P2)** or promote |
| `/api/naming/memoir` | `MemoirGenerator.tsx` | **PROMOTE** or redirect to `/api/memoir` |
| `/api/memoir/*` | `MemoirView.tsx` | **PROMOTE to CORE** |
| `/api/verification/*` | `useVerification`, verification badges | **PROMOTE to CORE** (if verification UI ships) |

---

## Future / Dev UI — Gate Behind Flag (P1)

| Route | Callers | Disposition |
| --- | --- | --- |
| `/api/rpg/*` | `components/_future-surfaces/rpg/*` | **Gate UI** — already under `_future-surfaces` |
| `/api/orchestrator/*` | `api/index.ts` | **Gate UI** or promote if orchestrator dashboard ships |
| `/api/dev/*` | `LiveLogs`, `PopulateDummyData`, `FlagTogglePanel` | **OK** — dev console, ADMIN tier |
| `/api/integrations/*` | `GithubPanel`, `InstagramPanel` | **PROMOTE** when integrations ship, else gate panel |

---

## Admin Analytics (OK to Stay Gated)

| Route | Callers | Notes |
| --- | --- | --- |
| `/api/analytics/*` | `config/analyticsModules.ts` | Admin analytics dashboard modules — not the identity pulse path (fixed) |

---

## Dependency Graph (Before P0)

```
Timeline UI ──→ /api/chronology (EXPERIMENTAL) ──→ 503 in prod  ✅ FIXED
Identity Pulse ──→ /api/analytics/identity (ADMIN) ──→ 503 in prod  ✅ FIXED
WhatAIKnows ──→ /api/identity (EXPERIMENTAL) ──→ 503 in prod  ✅ FIXED
LoreBook ──→ /api/biography (EXPERIMENTAL) ──→ 503 in prod  ⏳ P1
Goals UI ──→ /api/goals (EXPERIMENTAL) ──→ 503 in prod  ⏳ P1
```

---

## Verification Checklist (Post-P0)

- [x] Chronology mounts as CORE_RUNTIME in `routeRegistry.ts`
- [x] Identity mounts as CORE_RUNTIME in `routeRegistry.ts`
- [x] `fetchIdentityPulse` calls `/api/identity/pulse`
- [x] No timeline client changes required (routes unchanged, tier fixed)
- [ ] Remaining P1 promotions (biography, goals, etc.) — tracked in consolidation roadmap

---

## Decision Log

| Route | Options Considered | Chosen |
| --- | --- | --- |
| `/api/chronology` | A) Promote B) Switch to timeline-v2 | **A — Promote** — no duplicate chronology in CORE; timeline-v2 client already depends on these endpoints |
| Identity pulse | A) New CORE mount B) Use `/api/identity/pulse` | **B** — endpoint existed; wired to analytics module + promoted identity mount |
| Wellness | A) Keep on `/api/health` B) Split to `/api/wellness` | **B — Split** — system liveness stays on inline `index.ts` `/api/health` |
