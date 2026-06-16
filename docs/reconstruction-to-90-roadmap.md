# Reconstruction → 90 Roadmap

Date: 2026-06-15
Status: integration plan. Connect existing systems; build nothing new.
Baseline: Life Reconstruction = 66/100 (measured by `apps/server/src/scripts/lifeReconstructionScore.ts`).

Score weights (real, from the harness):
`overall = memory·0.15 + entity·0.15 + relationship·0.25 + timeline·0.20 + recall·0.15 + continuity·0.10`

Projected scores below are **estimates** anchored to which weighted component each change unblocks. They are not measured; re-run the harness after each step to replace them with real numbers.

---

## The ranked path

| # | Improvement | Current | Projected | Eng. Cost | Risk | ROI | Why |
|---|---|---|---|---|---|---|---|
| 1 | **Live-path the recovery services** — call `eventRecoveryService` + `relationshipFoundationService` from chat ingest (debounced), not just batch scripts | 66 | **76** | M (2–3 d) | Low | **Highest** | Stops graph decay between batch runs; directly feeds the 0.25 + 0.20 + 0.15 weights every conversation |
| 2 | **Activate episode segmentation** — add `episodes` table + Step 12.9 calling `segmentEpisodes` on resolved node IDs | 76 | **83** | M (3–4 d) | Low | High | Episodes become event-recovery + timeline anchors and feed 3 dead thread-intel fields |
| 3 | **Evidence / provenance linkage** — link recovered events + relationships back to `episodes`/`chat_messages` so retrieval can cite them | 83 | **88** | M (2–3 d) | Low | High | Raises recall confidence (`assembleWorkingMemory` gates on confidence ≥ 0.35) and biography sourcing |
| 4 | **Entity deduplication** — promote `entityResolutionCore` to the live resolver, retire `omegaMemoryService.resolveEntities` dupe; merge duplicate people/places | 88 | **91** | M (3 d) | Med | Med | Duplicate nodes split coverage credit; merging consolidates relationship + memory accuracy |
| 5 | **Feed the 3 dead thread-intel fields** (projects, episodes, open_loops) | 91 | **92** | S (1 d) | Low | Med | Continuity weight (0.10) + UX; mostly free once #2 lands |

Cumulative: **66 → ~92**, all by connecting code that already exists.

---

## Step detail

### 1. Live-path recovery (66 → 76) — do this first
- **What:** in `ingestionPipelineClass.ingestMessageCore`, after entity resolution, fire-and-forget a debounced call to `relationshipFoundationService` and `eventRecoveryService` scoped to the entities touched this turn. Pattern already used everywhere in this file (`void import(...).then(...)`).
- **Why first:** the scorecard *measures* these services. Today they only reflect the last run of `recoverEvents.ts` / `generateRelationships.ts`. Every new chat since then is invisible to the graph → the score erodes silently. This is the single change that converts chat into graph growth.
- **Guardrail:** debounce per thread (e.g. on idle / every N turns) so we don't run full recovery per message.

### 2. Episode activation (76 → 83)
- Add `episodes` table (immutable scene log; `thread_id ON DELETE SET NULL` so episodes outlive threads).
- New Step 12.9 calls `segmentEpisodes(messages, {entityIds, locationIds})` on the open tail of the thread; upsert closed episodes; LLM-title them (titling layer already envisioned in the core's header).
- Pass active `episodeId` into `threadIntelligenceService.updateOnMessage`.
- Make episodes the input unit for step #1's event recovery (scene → event).

### 3. Evidence linkage (83 → 88)
- When recovery creates an event/relationship, write a provenance row pointing at the `episode_id` (and underlying `chat_message` ids). Generalize the existing `provenance_edges` concept.
- `assembleWorkingMemory` can then return cited evidence, lifting recall confidence above its 0.35 gate for more benchmark queries.

### 4. Entity dedup (88 → 91)
- Route live resolution through `entityResolutionCore.resolveMention` (deterministic, shares `entityClassifier`, returns merge suggestions). Retire the parallel `omegaMemoryService.resolveEntities` path.
- Run a one-time merge of existing duplicate people/places (see `graph-health-report.md`).

### 5. Feed dead thread-intel fields (91 → 92)
- `projects`: collect `PROJECT`-typed resolved entities into `_threadMetaTurn` (mirror the people/places lines).
- `episodes`: arrives free from #2.
- `open_loops`: pass the open-question signal the summary service already detects into `turn.openLoop`.

---

## Sequencing rule

Do **1 → 2 → 3** in order: each is the feeder for the next (live recovery needs a trigger cadence; episodes give it scene boundaries; evidence linkage cites those scenes). **4 and 5** are independent and can land any time after **2**.

Re-run `lifeReconstructionScore.ts` after each step. If a step does not move its targeted weighted component, stop and inspect before proceeding — the projections are hypotheses, the harness is ground truth.
