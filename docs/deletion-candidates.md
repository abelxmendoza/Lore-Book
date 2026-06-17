# Deletion Candidates

Status: Code Archaeology Sprint — Phase 3 (DELETE + ARCHIVE).
Companion: [code-archaeology-report.md](code-archaeology-report.md).

**Hard rule:** no entry is DELETE on zero-references alone. Every DELETE below names the **live system that supersedes it** or why it has no salvageable concept. ARCHIVE = move to an `_archive/` namespace, keep git history, stop maintaining; reversible.

---

## DELETE — superseded duplicates / fixtures (rationale mandatory)

| File(s) | Superseded by / reason | Pre-delete check |
| --- | --- | --- |
| `apps/web/src/components/timeline/ImprovedTimelineView.tsx` + `TimelineArcRibbon`, `TimelineDriftTag`, `TimelineIdentityPulse`, `TimelineVoiceMemoMarker`, `TimelineLayerToggles`, `TimelineEventsChronology` | Abandoned timeline experiments. Live path is **timeline-v2** (`/api/timeline-v2` is CORE_RUNTIME; these components are unmounted and reference the old timeline contract). Multiple half-variants of the same view = classic prototype residue. | Confirm none are imported by the mounted timeline page (verified zero-ref); confirm timeline-v2 is the rendered surface. |
| `apps/server/src/services/compiler/test-data/classification-samples.ts` | Test fixture for the dead `compiler` classification path. Tests nothing live. | Confirm no live test imports it (zero-ref). |
| `apps/server/src/services/llmMemoryExtraction.ts` | Superseded by live `memoryExtractionService`. | **Only after** salvaging any unique prompt/heuristic into the live extractor (see activation #7). |
| `apps/server/src/jobs/recommendationJob.ts` | Orphaned job for the archived recommendation worker; no scheduler references it; `recommendationWorker` itself is part of the archived Life-OS layer. | Confirm not registered in the job scheduler (verified). |

**Why so few DELETEs:** almost everything "dead" here is either reusable infra, frozen governance, or roadmap-bearing experimental code. Deleting those would destroy intent, not debt. The genuine garbage is duplicate UI variants and a fixture.

---

## ARCHIVE — move to `_archive/`, keep history (not deleted)

Reversible relocation. Removes from the maintained surface (lint/tsc/test/cognitive load) without losing the work. Recommended target: `apps/server/src/_archive/...` and `apps/web/src/components/_archive/...`, excluded from build.

### Server — the Life-OS experimental stratum
- **19 domain workers**: `dreamsWorker, decisionWorker, learningWorker, creativeWorker, socialWorker, financialWorker, goalWorker, timeWorker, wisdomWorker, valuesWorker, habitWorker, eqWorker, growthWorker, influenceWorker, interventionWorker, resilienceWorker, chronologyWorker, legacyWorker, healthWorker`.
  - *Rationale:* coherent unfinished product bet (per-domain reasoning), gated with 90 EXPERIMENTAL routes. Encodes roadmap → archive, don't delete. Their underlying domain engines should be archived alongside if also unreferenced.
- **Paracosm (5)**: `paracosmClassifier, paracosmExtractor, paracosmGraphBuilder, paracosmScoring, paracosmStorage`.
  - *Rationale:* complete niche subsystem (inner-world modeling), lowest current value, possible future tie-in to the internal-life graph.
- **RPG remainder**: `discoverySystem`, `reflectionPrompts`, and the non-quest engines behind `rpgProcessor` (companion/faction/etc.).
  - *Rationale:* keep the quest/skill slice (activation #3); archive the rest until gamification is revisited.
- **Misc orphans**: `storyInsightService`, `continuity/resolutionService`, `threads/threadAssignmentService`, `will/llmRules`, `rag/semanticChunker`, `activeLearning/modelFineTuner`, `ingestion/eventPostProcessor`, `services/conversationCentered/batchProcessor`.
  - *Rationale:* abandoned single-purpose services with no live caller and no clear merge target. Archive; promote to DELETE only if a future pass confirms a live duplicate.

### Frontend — unmounted feature surfaces
- `components/_future-surfaces/*` (DataSourceBadge, MotifHeatmap, EntryList, CorrelationGraph) — already self-labeled future.
- `components/memoir/*` (3), `components/github/*` (2), `components/events/*` (3), `components/romantic/*` (2), `chronology/ChronologyView`, `relationshipTree/RelationshipTreeView`, `verification/VerificationDetailsModal`, `components/lorebook/*` (VersionManager, QuerySuggestions, BiographyRecommendations, CoreLorebooks), `skills/SkillNetworkView`, `subscription/FeatureGate`, `dev/PopulateDummyData`.
  - *Rationale:* built feature views never mounted into a route. Archive as a unit; several pair with archived backend routes.
- **Hooks**: `useVerification`, `useOrchestratorStream` → archive (pair with experimental routes). `useDebounce` → **KEEP** (generic primitive).

---

## KEEP (explicitly not deletion candidates, listed to prevent re-flagging)
`engine/PriorityQueue.ts`, `hooks/useDebounce.ts` (reusable infra) · `jobs/runEmbeddingReindex.ts`, `lib/founderGuard.ts` (operational/security) · `contracts/contractEnforcer.ts` + `contractAwareMemoryRetriever.ts` + `compiler/*` (frozen Formal-Cognition-Governance architecture — no production equivalent encodes constrained memory views).

---

## Execution guidance
1. **ARCHIVE first** (mechanical, reversible) — instantly shrinks the maintained surface and makes the real architecture legible. Update `tsconfig`/lint excludes for `_archive/`.
2. **DELETE second**, each behind its pre-delete check, ideally one PR per cluster with the rationale row in the description.
3. **Add `knip`/`ts-prune` to CI** so this never re-accumulates silently — the manual BSD-grep method (see archaeology report) is too error-prone to repeat by hand.
4. Re-run after activation (#1/#2): retiring the redundant resolvers/segmenters will move several more files from live → deletable, with the cores as their documented replacement.
