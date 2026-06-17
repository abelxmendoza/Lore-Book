# Activation Candidates

Status: Code Archaeology Sprint — Phase 3/4 (ACTIVATE + MERGE).
Companion: [dead-code-salvage-report.md](dead-code-salvage-report.md).

These are dead/shadow systems whose logic is **superior to or absent from** production and should be wired in (ACTIVATE) or folded into a live equivalent (MERGE). Ordered by leverage.

## ACTIVATE

### 1. `entityResolutionCore` — wire the shadow brain into the live path ⭐ highest leverage
- **Why now:** it was purpose-built to collapse six parallel resolvers into one; the [classification sprint](dynamic-classification-model.md) independently concluded the same "one `classify()`/resolve boundary" design. Two sprints point at this file.
- **Activation steps:**
  1. Route `peoplePlacesService` dedup + `characterRegistry.classifyForCreation` through `entityResolutionCore.resolve()` behind a shadow-compare flag (log divergence, don't act).
  2. Confirm divergence is acceptable on real threads (kinship/alias cases especially).
  3. Flip the flag to authoritative; retire the redundant resolvers per the salvage report.
- **Risk:** medium — it's on the entity write path. The shadow-compare step de-risks it.
- **Depends on:** classification sprint M1 (stable `root_type`) is complementary, not blocking.

### 2. `episodeSegmentationCore` — make episodes real
- **Why now:** episodes are described as the primary memory unit but three competing segmenters run instead of this consolidated core.
- **Activation steps:**
  1. Add the thin DB-persistence + LLM-titling wrapper the header describes.
  2. Run in shadow alongside `sceneSegmenter`/`narrativeSegmenter`/`narrativeSegmentationService`; compare boundaries.
  3. Promote, retire the three.
- **Risk:** medium. Pure core is testable in isolation first.
- **Note:** `episodeSegmentationCore` was previously reported "dead/fake" in audits — this sprint confirms it is **real, ~75% complete, and unwired**, not fake. Re-classified from DEAD to ACTIVATE.

### 3. RPG quest/skill slice — finish the already-shipped fragment
- **Why now:** quest log + skill-from-quest leveling already ship; `rpgProcessor` is the orchestrator that would auto-update them from journal entries.
- **Activation steps:** wire `rpgProcessor.processJournalEntry()` for the quest + skillTree engines **only**; leave companion/faction/discovery archived.
- **Risk:** low — additive, gated to the live gamification surface.

## MERGE

### 4. `recallEngine` → `chat/memoryRetriever`
- **Salvage:** the `RecallIntent` taxonomy + STRONG/TENTATIVE phrasing + epistemic-type/contract integration (production lost the hedging when it re-implemented retrieval).
- **Discard:** the duplicated fetch/embedding mechanics already present in the live retriever.
- **Outcome:** recall answers gain calibrated "I'm fairly sure / I think" phrasing without a second retrieval stack.

### 5. `experienceClusterer` → `eventRecoveryService`
- **Salvage:** centroid + temporal-span + entity-set clustering to dedupe before event assembly (both are batch today, so low risk).
- **Outcome:** fewer redundant/duplicate recovered events.

### 6. `lifeArcService` timeframe rollups → continuity engine
- **Salvage:** the `LAST_7/30/90_DAYS` digestible-summary windows.
- **Discard:** the rest (superseded by `narrativeContinuityService`).
- **Outcome:** "what happened lately" summaries without a parallel service.

### 7. `llmMemoryExtraction` → `memoryExtractionService`
- **Salvage:** any prompt/heuristic not in the live extractor; then delete the file (see deletion doc).

## Sequencing
1. **Cores first** (#1, #2) in shadow-compare — highest leverage, and they *reduce* the file count by retiring the resolvers/segmenters they replace.
2. **Cheap merges** (#4, #5, #6) — small, isolated, improve quality.
3. **RPG slice** (#3) when gamification is prioritized.

## Definition of done
- [ ] `entityResolutionCore` authoritative; ≥4 redundant resolvers retired.
- [ ] `episodeSegmentationCore` authoritative; 3 segmenters retired.
- [ ] recall phrasing/intents live in the chat retriever.
- [ ] experience clustering in the event path; lifeArc rollups in continuity.
- [ ] Net file count **down**, not up — activation here is consolidation, not addition.
