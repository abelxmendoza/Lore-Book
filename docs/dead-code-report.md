# Dead Code Report

Date: 2026-06-16 · Audit only. "Dead" = zero non-test, non-self references (verified by grep). Lower-confidence sweep targets are labeled REVIEW.

## High-confidence dead code (safe to delete)

| Item | Path | LOC | Evidence | Disposition |
|---|---|---|---|---|
| **`episodeSegmentationCore`** | `services/conversationCentered/episodeSegmentationCore.ts` (+ `.test.ts`) | ~131 + test | 0 non-self refs. Built to consolidate the segmenter trio but never wired. | DELETE or wire — it has been dead across multiple sprints |
| **`entityResolutionCore`** | `services/entities/entityResolutionCore.ts` | ~200 | 0 refs. The live path uses `entityResolutionService` (6 refs) + `omegaMemoryService.resolveEntities`. Pure duplicate. | DELETE |
| **`billing/pricing.ts`** | `services/billing/pricing.ts` | ~23 | 0 importers since `billingRouter` was deleted. Static tier table. | DELETE (or wire to a pricing UI) |

**Removable now: ~350+ LOC** across 3 files (4 with the test), zero behavioral change.

## Dead *capability slots* (consumer exists, producer never wired)
- **`threadIntelligenceService` fields `projects`, `episodes`, `open_loops`** — rendered by `buildContinuityCard` but never populated (only `people`/`places`/summaries are fed). Either wire producers or remove the slots from the card. Not deletable code per se, but dead surface area.

## Database dead weight (from performance advisor)
| Item | Count | Action |
|---|---|---|
| **Unused indexes** | ~200 | Review + drop the confirmed-unused ones — they slow every write and consume disk. Biggest mechanical cleanup. |
| **Duplicate indexes** | 5 (`extracted_units`, `locations`, `resolved_events`, `skills`, `utterances`) | Drop one of each — free win. |
| Orphaned/legacy migrations | — | `migrations/` and `supabase/migrations/` are partially duplicated trees; reconcile to one source of truth (separate effort). |

## REVIEW — needs reference analysis before deleting (do not delete blind)
- **Segmenter trio** (`sceneSegmenter`, `narrativeSegmenter`, `narrativeSegmentationService`) — each has 3 live refs, so **NOT dead**. But they overlap conceptually; if episode segmentation is ever wired, these become consolidation candidates. Leave for now.
- **Untracked design docs (~47 in `docs/`)** — not code, but maintenance noise; many are superseded vision docs. Curate/archive separately.
- **Dormant route namespaces** — `routeRegistry` mounts ~80 route groups (e.g. `/api/rpg`, `/api/social-projection`, `/api/inner-mythology`-style engines). Many may be unused by the frontend. A route-usage audit (frontend `fetchJson` call sites vs mounted routes) would surface dead routes — deferred; requires cross-referencing, not included here.

## Maintenance reduction estimate
- **Immediate, safe:** ~350 LOC (3 dead files) + 5 duplicate indexes + the `billing/` directory collapse.
- **After review:** ~200 unused indexes, dead route namespaces, doc curation — potentially the larger win, but each needs verification.

## Highest-ROI deletions (before next sprint)
1. Delete the 3 dead files (`episodeSegmentationCore`, `entityResolutionCore`, `billing/pricing.ts`) — trivial, removes confusing duplicate "which resolver/segmenter is live?" ambiguity.
2. Drop the 5 duplicate indexes — free write performance.
3. Schedule a frontend-route-usage cross-reference to retire dead `/api/*` namespaces (deferred, higher payoff).
