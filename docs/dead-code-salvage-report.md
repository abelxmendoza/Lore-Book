# Dead Code Salvage Report

Status: Code Archaeology Sprint — Phase 2 salvage audit.
Companion: [code-archaeology-report.md](code-archaeology-report.md).

For each dead/inactive component: *what it solves · is it superior to production · did production duplicate it later · unique concepts · completeness.* Disposition rationale carried through to [activation-candidates.md](activation-candidates.md) / [deletion-candidates.md](deletion-candidates.md).

---

## Tier 1 — Salvage with high leverage (the prize)

### `services/entities/entityResolutionCore.ts` (195 lines) — ACTIVATE
- **Solves:** one deterministic entity-resolution brain (lore-aware kinship/alias resolution — "grandma" → existing "Abuela" without dupes; context-aware disambiguation by thread co-occurrence/recency/relationship overlap rather than string distance).
- **Superior to production?** Yes in design intent. Production today scatters this across `characterRegistry.classifyForCreation`, `entityResolutionService`, `entityResolver`, `EntityRegistry`, `certifiedEntityIndexService`, `peoplePlacesService` — six parallel resolvers (the exact sprawl the [classification sprint](classification-audit.md) flagged).
- **Duplicated later?** No — it was meant to *absorb* the six, but the cutover never flipped. Imported by `omegaMemoryService`/`entityResolutionBridge` in shadow.
- **Unique concepts:** confidence-margin gating (only disambiguate when ambiguous), kinship/alias lore-awareness.
- **Completeness:** ~80%. Pure and testable; needs the call sites routed through it.

### `services/conversationCentered/episodeSegmentationCore.ts` (130 lines) — ACTIVATE
- **Solves:** deterministic thread→episode segmentation from time-gap/entity-shift/location-shift/topic-shift signals (episodes = the primary memory unit).
- **Superior to production?** It is the intended consolidation of `sceneSegmenter` / `narrativeSegmenter` / `narrativeSegmentationService`.
- **Duplicated later?** It is itself the de-dup target; the three segmenters still run.
- **Unique concepts:** multi-signal boundary detection; pure core + thin DB/LLM-titling wrapper split.
- **Completeness:** ~75%. Needs the wrapper + wiring; dead per static graph today.

---

## Tier 2 — Salvage by merging into production

### `services/memoryRecall/recallEngine.ts` (444 lines) — MERGE
- **Solves:** natural-language recall with enrichment-based ranking; typed `RecallIntent` (EMOTIONAL/TEMPORAL/PATTERN_LOOKBACK/GENERAL) and `Phrasing` (STRONG/TENTATIVE) — i.e. epistemic hedging in recall.
- **Superior to production?** Partially. The live path uses `chat/memoryRetriever` + `contextScoringService`; recallEngine's **intent typing + tentative phrasing + contract/epistemic-type integration** are richer than what's live.
- **Duplicated later?** The retrieval mechanics were re-implemented in the chat path; the epistemic phrasing largely was **not**.
- **Unique concepts:** recall intent taxonomy, STRONG/TENTATIVE phrasing, `VERIFIED_SILENCE_FALLBACK` usage.
- **Completeness:** ~85% but against an older retrieval contract. **Merge the intent/phrasing layer into `memoryRetriever`; discard the duplicated fetch mechanics.**

### `services/lifeArcService.ts` (539 lines) — MERGE
- **Solves:** narrative human-readable summaries of recent life (`LAST_7/30/90_DAYS`).
- **Superior to production?** Overlaps `narrativeContinuityService` + `stabilityDetectionService` (which it imports). Some timeframe-rollup logic is unique.
- **Duplicated later?** Largely superseded by the continuity engine; lifeArc is the older sibling.
- **Unique concepts:** fixed timeframe windows for digestible summaries.
- **Completeness:** ~90% but redundant. **Lift the timeframe-rollup into the continuity engine, then retire.**

### `services/conversationCentered/experienceClusterer.ts` (258 lines) — MERGE
- **Solves:** clusters similar EXPERIENCE units (centroid + intra-cluster similarity + temporal span + entity set) to reduce redundant event assembly.
- **Superior to production?** It's a clean clustering primitive the **batch event recovery** path lacks.
- **Duplicated later?** No equivalent in the live event path.
- **Unique concepts:** experience centroid + temporal-span clustering.
- **Completeness:** ~70%. **Merge into `eventRecoveryService` / event assembly** (both batch today).

### `services/llmMemoryExtraction.ts` — MERGE/DELETE
- **Solves:** LLM-based memory extraction. **Superseded** by the live `memoryExtractionService`. Check for any prompt/heuristic not present in the live one; salvage that, then delete. Mostly **duplicate**.

---

## Tier 3 — Keep (don't activate, don't delete)

### `contracts/contractEnforcer.ts` + `contracts/contractAwareMemoryRetriever.ts` — KEEP
- **Solves:** "the gate" — no system reads memory without passing a `SensemakingContract` (contradiction policy, constrained memory view). This is the **Formal Cognition Governance** research line.
- **Superior to production?** Conceptually ahead; not currently enforced anywhere.
- **Unique concepts:** constrained memory views, contradiction policy as a first-class contract.
- **Completeness:** ~60% — a strong skeleton. **Keep as frozen architecture; revisit when epistemic enforcement is prioritized.** Do not delete — no production equivalent encodes this.

### `engine/PriorityQueue.ts`, `hooks/useDebounce.ts` — KEEP
- Generic, complete, reusable infrastructure. Zero references today is incidental; deleting reusable primitives is false economy. Keep.

### `jobs/runEmbeddingReindex.ts`, `lib/founderGuard.ts` — KEEP
- Operational/maintenance + security tooling. Run rarely, by hand or ops — "dead" by import graph but **operationally live**. Keep.

---

## Tier 4 — Archive (encodes roadmap, stop maintaining)

### 19 domain workers (`dreamsWorker`, `decisionWorker`, …) — ARCHIVE
- **Solves:** the **Life-OS vision** — per-domain background reasoning (decisions, goals, habits, growth, emotional intelligence, etc.). Each is a ~40-line wrapper over a domain engine + storage (e.g. `decisionWorker` → `DecisionEngine`+`DecisionStorage`).
- **Superior to production?** N/A — never activated; gated with the 90 EXPERIMENTAL routes.
- **Completeness:** wrappers complete; underlying engines vary. As a *layer* it's a coherent unfinished product bet.
- **Disposition:** ARCHIVE as a unit — they are the written-down roadmap. Deleting them deletes product intent. (Note: `groupDetectionWorker` is the known OOM offender — kept gated off, not archived.)

### Paracosm (5 files) — ARCHIVE
- **Solves:** modeling a user's imaginary/inner world (paracosm). Niche, complete-ish subsystem, lowest business value now, modest roadmap value (ties to the internal-life graph). Archive intact.

### RPG subsystem (`rpgProcessor`, `discoverySystem`, `reflectionPrompts`) — ACTIVATE-partial / ARCHIVE
- **Solves:** gamification — `rpgProcessor` orchestrates companion/faction/skillTree/quest/challenge/resource/chapter engines on each journal entry.
- **Duplicated later?** **Partially shipped already** — the quest log + skill-from-quest leveling are live (per project history), but the full processor isn't wired.
- **Disposition:** the quest/skill slice is an **activation candidate**; the rest (factions, companions, discovery) **archive** until the gamification bet is revisited.

### Frontend feature surfaces — ARCHIVE
- `_future-surfaces/*` (self-labeled), memoir, github, events, romantic, relationshipTree, verification, lorebook/* — unmounted feature views. Archive as a `components/_archive/` stratum.

---

## Tier 5 — Delete (superseded; rationale mandatory)

See [deletion-candidates.md](deletion-candidates.md). Summary: superseded **timeline component variants** (live path is timeline-v2), the **`compiler/test-data/classification-samples.ts`** fixture (tests dead code), and `llmMemoryExtraction` **after** any unique prompt is salvaged into `memoryExtractionService`. Nothing here is deleted for zero-refs alone — each is a proven duplicate of a live system.
