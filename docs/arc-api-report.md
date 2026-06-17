# Arc API Report

**Sprint:** Arc API & Story Surface — Phase 1–2  
**Date:** 2026-06-16  
**Status:** Complete

## Summary

Story intelligence is now exposed as **read-only HTTP APIs** under `/api/life/*`. No new storage, extraction, or memory types. All endpoints delegate to `lifeArcSynthesisService` via `lifeStoryApiService`.

---

## Phase 1 — Arc Service Audit

### `lifeArcSynthesisService`

| Component | Input | Output |
|-----------|-------|--------|
| `loadSignals` | `userId` | `SignalBundle` from `life_arcs`, `goals`, `organizations`, `journal_entries`, `resolved_events`, `character_relationships` |
| `scoreCategorySignals` | bundle | `Record<ArcCategory, number>` |
| `buildCandidateArcs` | bundle + inventory | `CandidateLifeArc[]` (max 8) |
| `buildEnrichedArcs` | candidates + bundle | `EnrichedLifeArc[]` with provenance |
| `computeMomentum` | title, category, bundle | `emerging \| growing \| stable \| declining \| completed` |
| `detectConflicts` | bundle + arcs | `LifeArcConflict[]` (max 6) |
| `buildCurrentChapter` | arcs + bundle + bio | `{ label, narrative, evidence[] }` |
| `buildLifeDirection` | arcs + conflicts | moving toward / fading / attention |
| `synthesizeLifeArcs` | `userId` | full `LifeArcSynthesis` + prompt `text` |

### Data sources (read-only)

| Signal | Table | Window |
|--------|-------|--------|
| Episodes | `journal_entries` | 90d |
| Goals | `goals` | all |
| Projects | `organizations` | top 12 |
| Relationships | `character_relationships` | top 15 |
| Events | `resolved_events` | 90d |
| Persisted arcs | `life_arcs` | top 12 (often empty) |
| Communities | `organizations` (family/goth filter) | — |
| Biography fallback | `biographyFoundationService` | optional |

---

## Phase 2 — Arc API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/life/arcs` | Candidate arcs + signal inventory + life direction |
| `GET` | `/api/life/current-chapter` | Chapter narrative + dominant arcs + provenance |
| `GET` | `/api/life/conflicts` | Goal/project/time/relationship tensions |
| `GET` | `/api/life/momentum` | Per-arc momentum indicators + summary counts |

### Requirements met

| Requirement | Implementation |
|-------------|----------------|
| Read-only | No POST/PATCH/DELETE on story routes |
| Authenticated | `requireAuth` on all routes |
| Founder-safe | `req.user!.id` tenant isolation only |
| Provenance-aware | Every arc includes `provenance` object (Phase 3) |

### Files

| File | Role |
|------|------|
| `apps/server/src/routes/life.ts` | HTTP routes |
| `apps/server/src/services/lifeStoryApiService.ts` | Response mapping + 30s cache |
| `apps/server/src/services/continuityRuntime/arcs/lifeArcSynthesisService.ts` | Synthesis engine |
| `apps/server/tests/routes/life.test.ts` | Route unit tests (4) |
| `apps/server/scripts/lifeStoryApiAudit.ts` | Founder/developer validation |

### Cache

30-second in-memory cache per user with inflight deduplication — parallel panel requests share one synthesis snapshot and consistent `generatedAt`.

---

## Founder validation (2026-06-16)

| Endpoint | Result |
|----------|--------|
| `/api/life/arcs` | 5 arcs, avg 15.2 evidence refs per arc |
| `/api/life/current-chapter` | Narrative + confidence 0.64 |
| `/api/life/conflicts` | 4 conflicts |
| `/api/life/momentum` | 5 growing |
| Timestamp consistency | OK (inflight dedupe) |
| Verdict | **PASS** |

---

## Run

```bash
# Unit tests
cd apps/server && npm test -- --run tests/routes/life.test.ts

# Live validation
npx tsx apps/server/scripts/lifeStoryApiAudit.ts
```
