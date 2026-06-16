# Reconstruction Gap Analysis

Date: 2026-06-15
Status: integration audit. No new architecture proposed. Every claim below is grounded in a code path.

> **Thesis:** LoreBook's reconstruction score is stuck because the systems that *build* the graph and the systems that *grade* the graph are on different pipelines. The live chat pipeline writes atomic memory; the graph the scorecard measures (relationships, events, episodes) is built by **batch recovery scripts** that the chat path never triggers. We do not need new systems — we need to move five already-built services onto the live ingestion path and activate one dead core.

---

## Part 1 — Production Wiring Audit

`Built` = file exists. `Imported` = referenced by non-test, non-self code. `Executed` = reached on a runtime path (not just a script). `Prod Path` = reached by live chat ingestion or live chat retrieval.

| System | Built | Imported | Executed | Prod Path | Verdict |
|---|---|---|---|---|---|
| **Entity Resolution (live)** — `omegaMemoryService.resolveEntities` | ✅ | ✅ | ✅ | ✅ chat ingest Step 4 | **LIVE** |
| **Entity Resolution (core)** — `entityResolutionCore.resolveMention` | ✅ | ❌ self-only | ❌ | ❌ | **DEAD / duplicate** |
| **Episode Segmentation** — `episodeSegmentationCore.segmentEpisodes` | ✅ | ❌ self-only | ❌ | ❌ | **DEAD (no `episodes` table)** |
| **Thread Intelligence** — `threadIntelligenceService.updateOnMessage` | ✅ | ✅ | ✅ | ✅ ingest line ~2192 | **LIVE (2 of 6 fields fed)** |
| **Thread Summaries** — `threadSummaryService` | ✅ | ✅ | ✅ | ✅ ingest + threadIntel | **LIVE** |
| **Working Memory Assembler** — `assembleWorkingMemory` | ✅ | ✅ | ✅ | ✅ `ragBuilderService:497` → omegaChat | **LIVE** |
| **Relationship Recovery** — `relationshipFoundationService` | ✅ | ✅ | ⚠️ scripts + file-import + diagnostics | ❌ not in chat ingest | **PARTIAL (batch-only)** |
| **Event Recovery** — `eventRecoveryService` | ✅ | ✅ | ⚠️ scripts + file-import + diagnostics | ❌ not in chat ingest | **PARTIAL (batch-only)** |
| **Timeline Generation** — `eventRecoveryService.benchmarkCoverage` + chronology | ✅ | ✅ | ⚠️ measured, fed by recovery | ❌ not continuous | **PARTIAL** |
| **Life Arcs** — `continuityRuntime/arcs/*` | ✅ | ✅ (dayOccasionService in ingest) | ⚠️ partial | ⚠️ | **PARTIAL** |
| **Discovery Hub** — discovery analytics | ✅ | ✅ | ✅ read path | ✅ | **LIVE (reads stale projections)** |

**Duplicate systems found**
- Entity resolution: `omegaMemoryService.resolveEntities` (live) vs `entityResolutionCore.resolveMention` (dead, better-designed deterministic scorer sharing `entityClassifier`). One must win.
- Segmentation lineage: `episodeSegmentationCore` was written to *consolidate* `sceneSegmenter` / `narrativeSegmenter` / `narrativeSegmentationService` (per its own header) — but it never shipped, so the old three are still the only ones that (sometimes) run.

**Dead code (zero live callers)**
- `episodeSegmentationCore.ts` (+ its `segmentEpisodes` / `boundaryScore`)
- `entityResolutionCore.ts` (`resolveMention` and the scoring helpers)

---

## Part 2 — Episode Activation

**Why it is not running**
1. There is **no `episodes` table**. The core is a pure function with nowhere to persist output.
2. **Nothing imports it.** `segmentEpisodes` is referenced only inside `episodeSegmentationCore.ts`.
3. The **consumer already exists but starves**: `threadIntelligenceService` has an `episodes: string[]` slot and `updateOnMessage` accepts `turn.episodeId` — but the live pipeline never passes one, because segmentation never runs.

**Missing imports / wiring**
- Ingestion (`ingestionPipelineClass.ingestMessageCore`) never imports `episodeSegmentationCore`.
- The core consumes `SegMessage[]` with **resolved `entityIds`/`locationIds`** — those exist in the pipeline (`resolvedEntities`) but are not assembled into the core's input shape.

**Which stage should call it**
- New **Step 12.9 (post-message, after entity resolution + thread-meta update)**: pull the thread's recent messages with their resolved node IDs, run `segmentEpisodes`, upsert closed episodes, pass the active `episodeId` into `threadIntelligenceService.updateOnMessage`.
- Run **lazily** (on thread idle or every N messages) so the segmenter has lookahead — single-message segmentation is ambiguous by design.

**What data should feed it**
- `conversation_messages` (id, role, content, created_at) for the thread.
- Per-message resolved `entityIds` and `locationIds` (already produced at Step 4; today they're discarded after thread-meta collection).

| | Path |
|---|---|
| **Current** | `chat → messages → entity resolution → (entityIds discarded) → ❌ no segmentation → episodes slot empty` |
| **Target** | `chat → messages → entity resolution → segmentEpisodes(messages+nodeIds) → episodes table → threadIntel.episodes + event recovery input` |

**Risk assessment**
- *Low correctness risk*: the core is pure and unit-tested; output is additive (a new table + a metadata slot).
- *Medium cost risk*: re-segmenting a long thread every turn is O(messages). Mitigate by segmenting only the open tail (messages since last episode boundary).
- *No retrieval regression risk*: nothing reads `episodes` today, so activation cannot break existing reads. It only adds signal.

---

## Part 3 — Thread → Episode → Graph Flow

```
Chat Message            ✅ saved (chat_messages + conversation_messages)
  → Entity Resolution   ✅ omegaMemoryService.resolveEntities (Step 4)
  → Episode Segmentation ❌ BREAKS HERE — segmentEpisodes never called, no episodes table
  → Event Recovery       ❌ eventRecoveryService not on chat path (batch-only)
  → Relationship Recovery ⚠️ partial — entityRelationshipDetector runs live; relationshipFoundationService (the scored one) is batch-only
  → Graph Update         ⚠️ writes to legacy stores (characters, resolved_events, *_relationships); no unified episode anchor
  → Thread Intelligence  ✅ updateOnMessage runs — but only people+places arrive; episodes/projects/open_loops starve
```

**Where the flow breaks**
- **Break 1 (hard):** episode segmentation — the bridge between messages and the graph — does not exist at runtime.
- **Break 2 (hard):** the **scored** recovery services (`eventRecoveryService`, `relationshipFoundationService`) are never invoked by chat. They only run when someone uploads a file (`unifiedFileIngestionService`) or runs `recoverEvents.ts` / `generateRelationships.ts`. So the scorecard reflects the last batch run, not live state.
- **Break 3 (soft):** thread intelligence receives 2 of its 6 fields; the rest are wired but unfed.

---

## Part 4 — Threads Are Containers (already enforced)

**Deleting a thread does NOT delete knowledge — and this is enforced in two places:**

1. **Application guard** — `DELETE /api/conversation/threads/:id` ([conversationCentered.ts:2950](../apps/server/src/routes/conversationCentered.ts)):
   - Calls `isThreadProtected(userId, id)` and counts `entity_conversation_links` for the session.
   - If protected or `linkCount > 0` and not `?force=true` → **HTTP 409**, refusing deletion.
2. **Database constraint** — `entity_conversation_links.session_id REFERENCES conversation_sessions(id) ON DELETE RESTRICT` ([20260614133000_entity_conversation_links.sql](../supabase/migrations/20260614133000_entity_conversation_links.sql)). The DB physically refuses to drop a session that still has entity links.

**What dies vs survives on delete:**

| Layer | Table(s) | On thread delete | Why |
|---|---|---|---|
| Raw transcript | `conversation_messages`, `chat_messages` | **Deleted** (CASCADE / explicit) | Evidence transport — intended |
| Atomic fragments | `utterances` → `extracted_units` | **Deleted** (CASCADE from message) | Re-derivable fragments |
| **Consolidated knowledge** | `characters`, `entity_facts`, `crystallized_knowledge`, `resolved_events`, `character_relationships`, `romantic_relationships`, `journal_entries`, quests/goals, `entity_conversation_links` | **Survives** | Keyed by `user_id`, only soft-references messages via `metadata.chat_message_id` | 

✅ Characters, Events, Relationships, Facts, Goals, Stories all survive.

**One nuance to flag (not a leak):** surviving knowledge points back to raw messages via `metadata.chat_message_id` (a soft reference, not an FK). After a forced delete, that provenance becomes a dangling tombstone — the knowledge stands, but "show me where I said this" breaks. Acceptable; worth a tombstone UX, not a schema change.

---

## Part 5 — Thread Intelligence: live vs theoretical

`threadIntelligenceService` stores `threadMeta` in `conversation_sessions.metadata` (no new table) and is called live at ingest (`updateOnMessage`).

| Field | Wired to receive? | Fed in production? | Status |
|---|---|---|---|
| `summary_*` | ✅ | ✅ via `threadSummaryService.writeSummaries` | **LIVE** |
| `people` | ✅ | ✅ `_threadMetaTurn.people` | **LIVE** |
| `places` | ✅ | ✅ `_threadMetaTurn.places` | **LIVE** |
| `projects` | ✅ | ❌ never populated (pipeline collects only people/places) | **THEORETICAL** |
| `episodes` | ✅ (`turn.episodeId`) | ❌ segmentation dead | **THEORETICAL** |
| `open_loops` | ✅ (`turn.openLoop`) | ❌ no producer passes it | **THEORETICAL** |

**Live: 3 of 6 (summaries, people, places). Theoretical: 3 of 6 (projects, episodes, open_loops).** All three dead fields have *consumers already built* (`buildContinuityCard` renders Projects/Recent events/open loops) — they render blank because nothing feeds them.

---

## Part 6 — What single change moves each tier

Derived from the **real** weight formula (`overall = memory·0.15 + entity·0.15 + relationship·0.25 + timeline·0.20 + recall·0.15 + continuity·0.10`). These are estimates tied to which weighted component each change unblocks.

| Tier | Single highest-ROI integration | Mechanism |
|---|---|---|
| **31 → 66** (already achieved) | Batch relationship + event recovery scripts | Backfilled the 0.25 + 0.20 weights once |
| **66 → 80** | **Move `eventRecoveryService` + `relationshipFoundationService` onto the live chat ingest path** | Stops the graph from decaying between batch runs; recall + timeline + relationship all stop drifting down as new chats arrive |
| **80 → 90** | **Activate `episodeSegmentationCore`** (Step 12.9 + `episodes` table) | Episodes become event-recovery input and timeline anchors; feeds the 3 dead thread-intel fields; raises timeline (0.20) + recall (0.15) together |

---

## Bottom line

> If we stopped building features today, the largest reconstruction gain comes from **connecting, in order: (1) live-path the two recovery services the scorecard already measures, (2) activate episode segmentation as their feeder, (3) retire the duplicate dead resolver.** Zero new systems.
