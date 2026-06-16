# Episodes → Life Graph + Architecture Deletion Plan

Two halves: (8) how episodes become the primary memory unit feeding the autobiographical memory graph, and (10) the deletion plan that makes the architecture **simpler** while doing it. Reads with `thread-intelligence-architecture.md`, `autobiographical-memory-graph.md`, `lorebook-v2-architecture.md`.

---

## Phase 8 — Mapping: messages become evidence, episodes become memory

```
chat_messages  (canonical log, immutable)          ← evidence, never the unit of memory
     │  episodeSegmentationCore.segmentEpisodes()
     ▼
EPISODE         {messageIds[], participants[], locations[], startAt, endAt, theme}
     │  entityResolutionCore.resolveMention()   (lore-aware; no duplicates)
     ▼
ENTITIES        person / place / project / org  (resolved ids, not raw strings)
     │  key_people / key_places / key_events on the thread
     ▼
THREAD          a bounded container of episodes + entities + living summaries
     │  thread embedding + key_* sets
     ▼
LIFE GRAPH      episodes = `event` nodes; messages = their provenance;
                entities = nodes; threads = a chapter-ish grouping;
                edges: episode -involves→ person, episode -located_in→ place,
                       episode -part_of→ thread/chapter, message -evidence_for→ episode
```

**The inversion:** today a thread is "a list of messages." After this layer, a thread is "a sequence of episodes, each a small story with participants and a place," and messages are the *evidence rows* that back each episode. That is exactly the `episodes` substrate of the v2 autobiographical graph (`autobiographical-memory-graph.md`): an episode here **is** an `event` node, its `messageIds` are the provenance, and its `participants`/`locations` are the `involves`/`located_in` edges. So this sprint is not a detour — it is the on-ramp to the graph, built from the existing thread data.

**What each layer contributes to the graph:**
| Layer | Becomes (graph) | Provenance |
|---|---|---|
| message | — (evidence) | `chat_messages` row |
| episode | `event` node | `messageIds` |
| participant | `person`/`org` node + `involves` edge | resolved via `entityResolutionCore` |
| location | `place` node + `located_in` edge | resolved |
| thread | `chapter`-like grouping (`part_of`) | `conversation_sessions` |
| theme | `theme` node (`about`) | episode clustering |

No new tables required to start: episodes live in thread metadata / a lightweight `episodes` projection; promotion to graph `event` nodes happens in the v2 migration (`graph-migration-plan.md`).

---

## Phase 10 — Deletion plan (the architecture gets SMALLER)

The audit found **6 entity-resolution services and 3 segmenters** doing overlapping work — the sprawl this sprint must reduce.

### Entity resolution: 6 → 1 core + thin adapters

| System | Disposition | Rationale |
|---|---|---|
| `entities/entityResolutionCore.ts` (new) | **KEEP — the one brain** | pure, deterministic, lore-aware + context disambiguation; everything routes through it |
| `entityClassifier.ts` | **KEEP** | the type oracle the core uses |
| `characterRegistry.classifyForCreation` | **MERGE → core** | keep the registry's locking/choke-point, replace its JW-only matching with `resolveMention()` |
| `entityResolutionService.ts` | **MERGE → core** | fold its candidate loading behind the core; delete its bespoke scoring |
| `entityResolver.ts` | **DELETE** | superseded by the core |
| `entityRegistry/EntityRegistry.ts` | **MERGE or DELETE** | keep only if it owns persistence the core lacks; otherwise delete |
| `entityResolutionCache.ts` | **KEEP (as cache)** | caches candidate loads for the core; not a second resolver |
| `certifiedEntityIndexService.ts` | **MERGE → candidate index** | becomes the core's candidate source (the entity index), not a parallel matcher |

Net: **one resolution decision function**, one classifier, one cache, one candidate index. Five bespoke scoring/creation paths deleted or reduced to adapters.

### Segmentation: 3 → 1 core

| System | Disposition | Rationale |
|---|---|---|
| `conversationCentered/episodeSegmentationCore.ts` (new) | **KEEP — the one segmenter** | deterministic, signal-based |
| `scenes/sceneSegmenter.ts` | **MERGE → core** | scenes are episodes; reuse the boundary signals |
| `narrative/narrativeSegmenter.ts` | **MERGE → core** | same |
| `backwardStorytelling/narrativeSegmentationService.ts` | **DELETE / MERGE** | redundant; fold any unique heuristic into the core's signals |

### Summarization & thread metadata

| System | Disposition | Rationale |
|---|---|---|
| `conversationTitleService` + `threadTitleUtils` | **KEEP** | titles already solid (generic-title guard) |
| `chat/conversationSummaryBuilder.ts` | **MERGE → `threadSummaryService`** | one summarizer with short/medium/long + versioning; delete duplicate summary builders |
| `conversation_sessions.metadata.messages` snapshot | **DELETE as source** | `chat_messages` canonical (Thread Durability Sprint); rebuilt by `threadRecoveryService` |

### Retrieval

| System | Disposition |
|---|---|
| `recallQueryRouter` (legacy, 2 call paths) | **DELETE → Working Memory Assembler** (already the entry; thread-first candidate reorder lands in the WMA) |
| Working Memory Assembler | **KEEP — the one retrieval entry** |

---

## Net effect

**Before:** 6 resolvers · 3 segmenters · ≥2 summary builders · legacy recall routers · 3 message representations.
**After:** **1** resolution core · **1** segmenter · **1** summarizer · **1** retrieval entry (WMA) · **1** canonical message store (`chat_messages`).

That is the success criterion "architecture becomes simpler than before" made concrete — and every consolidated piece is a building block of the autobiographical memory graph, not a detour from it.

## Sequencing (low-risk)
1. Land the two new cores (done) behind the existing call sites — shadow-compare `resolveMention()` vs `characterRegistry.classifyForCreation` on real mentions.
2. Route `characterRegistry` + `entityResolutionService` through the core; delete `entityResolver` + redundant scoring.
3. Route the 3 segmenters through `episodeSegmentationCore`; delete redundancies.
4. Collapse summary builders into `threadSummaryService`; wire thread metadata (Phase 1).
5. Reorder WMA candidate generation to thread-first; delete `recallQueryRouter`.

Each step ships value standalone and **removes** code. Stop after any step and the system is simpler than before.
