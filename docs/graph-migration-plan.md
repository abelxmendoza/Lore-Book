# LoreBook — Migration Plan: Current Systems → Autobiographical Graph

**Status:** plan, not implementation. Reads with `autobiographical-memory-graph.md` (target model) and `lorebook-v2-architecture.md` (target runtime).

**Strategy:** strangler-fig, not big-bang. Stand up the three canonical tables (`nodes`, `edges`, `episodes`), **dual-write** from the existing ingestion, **backfill** from history, migrate **readers one surface at a time** behind flags, then **delete** the legacy stores once no reader remains. The immutable `episodes` log makes this safe: any derived table can be rebuilt, so we can cut over readers without fear of losing source data.

**Posture (per your instruction): not optimizing for backwards compatibility.** Where a system is a redundant representation, it gets deleted, not adapted.

---

## Phase 8 — Disposition of every current system

Legend: **KEEP** (becomes canonical or stays as-is) · **MERGE** (folds into a canonical table) · **REWRITE** (replace implementation, keep concept) · **DELETE** (redundant; remove).

### Data stores

| System | Disposition | Becomes / Why |
|---|---|---|
| `journal_entries` | **MERGE → `episodes`** | Episodes are the canonical immutable log. Journal entries are episodes with `source='journal'`. |
| `extracted_units`, `utterances` | **MERGE → `episodes`** (+ provenance) | These *are* episodic fragments; collapse into the episode log with provenance to `chat_messages`. |
| `chat_messages` | **KEEP** | Stays as the raw transport log + correction history (already versioned). `episodes` reference it via `source_id`. |
| `characters`, `people_places` | **MERGE → `nodes`** (type=person/place/org…) | One node table. The `characters`/`people_places` split is an artifact. |
| `character_memories` | **DELETE** (replaced) | A join that becomes `edges` (`involves`/`about`) from `episodes`/`event` nodes to `person` nodes. |
| `character_relationships` | **MERGE → `edges`** | Typed relationship edges. |
| `romantic_relationships` | **MERGE → `edges` + reified `relationship_state` node** | Kills the dual relationship model; significant relationships reify to nodes. |
| `resolved_events` | **MERGE → `event` nodes + `episodes`** | Canonical event = node anchoring its episodes. |
| `character_timeline_events`, `event_candidates` | **DELETE** (replaced by views) | Projections of `event` nodes + temporal edges; stop maintaining parallel stores. |
| `timelines`, `chronologyV2.*` | **REWRITE → `chapter`/`life_period` nodes + temporal edges** | Timeline becomes a *view* over the graph, not a store. Keep the chronology *algorithms* (bucketing, stitching) as graph builders. |
| `biographies`, `narrative_accounts` | **DELETE as a store; REWRITE as a renderer** | Biography is *rendered* from `chapter`/`arc`/`theme` nodes on demand. No stored biography → nothing to go stale. |
| importance scores (Sprint AL columns) | **REWRITE → `nodes.salience` (centrality, versioned)** | Derived + self-invalidating; drop the stored-uninvalidated column model. |
| significance scores (Sprint AL columns) | **REWRITE → `episodes.importance` / `event` node salience (versioned)** | Same; nullable + `scored_at`, never default-minor. |
| `event_meaning_cache` / `eventMeaningService` | **MERGE → `reflection` nodes (type=meaning)** | Meaning becomes a provenance-linked node, not a text cache. |
| `crystallized_knowledge`, `entity_facts`, `omega_claims` | **MERGE → semantic `edges`/`attrs` with confidence** | Three overlapping "fact" stores → one semantic layer on the graph. |
| `provenance_edges` | **KEEP / PROMOTE** | Already the right idea; becomes the universal derived→episode link. The one Composer system that v2 leans *into*. |
| discovery analytics tables | **REWRITE → computed projections** | Analytics derive from the graph; stop persisting denormalized analytics that drift. |

### Services / runtime

| System | Disposition | Notes |
|---|---|---|
| `recallQueryRouter` | **DELETE** | Replaced by the single working-memory assembler. |
| `conversationIntelligenceRouter` | **MERGE → assembler** | Its evidence-backed handler shape is good; becomes part of the one pipeline. |
| `explicitRecallService`, `threadRecallService`, `significanceRecall`, `foundationRecallDataService` | **MERGE/DELETE** | Collapse into the assembler's retrieval + ranking. |
| Sprint AM `scene/event/relationship/story` reconstruction (4 services) | **MERGE → one graph-backed story renderer** | Reconstruction becomes a graph walk over `arc`/`chapter`/`event` nodes. |
| `eventSignificanceService`, `characterImportanceService`, `relationshipScoringService` | **REWRITE → consolidation workers** | Keep the deterministic math; change *when/how* it runs (incremental, versioned) and *where* it writes (`salience`). |
| `entityMentionIndexService` | **KEEP / PROMOTE** | Becomes the per-user entity index for anchor resolution (finally used). |
| `characterRegistry` (merge/resolve) | **REWRITE → context-aware resolver** | Blocking + phonetic + graph-context ranking; the JW-only path is deleted. |
| ingestion pipeline (`ingestionPipelineClass`, queue) | **KEEP, EXTEND** | Becomes the dual-writer to `episodes`/`nodes`/`edges` and the trigger for incremental consolidation. |
| `messageCorrectionService` (the correction loop) | **KEEP, EXTEND** | Already does supersede + re-ingest; extend to recompute touched `salience`/consolidation. |
| diagnostics: `intelligenceHealthCoverage`, `storyCoverageDiagnostics`, `memoryDebugMode`, `buildRecallCoverageReport`, "What AI Knows" | **MERGE → one "Memory Health" service** | Five surfaces → one, backed by the graph invariants. |

### UI surfaces

| Surface | Disposition | Becomes |
|---|---|---|
| Character Book | **KEEP as a view** | Filtered view of `person` nodes + their edges/episodes (one data source). |
| Dating & Romance | **KEEP as a view** | View of `relationship_state` nodes + trajectories. |
| Life Log | **KEEP as a view** | View of `episodes`/`event` nodes ordered by time, framed by `chapter`s. |
| Discovery Hub | **COLLAPSE → 3 concepts** | People (graph) · Timeline/Life Log (events+chapters) · Memory Health (diagnostics). |
| "What AI Knows" | **MERGE → Memory Health** | Lists semantic facts *with provenance + confidence*. |

**Net effect:** ~14 data stores → **3 canonical + a few projections**; ~6 recall services → **1 assembler**; ~5 diagnostics → **1**; ~4 story services → **1 renderer**; 2 relationship models → **1**.

---

## Migration sequencing (safe, incremental)

This maps onto the P0–P3 from `opus-master-roadmap.md` — the v1 trust fixes are *also* the first migration steps, because they push behavior toward the graph.

### Stage 0 — Trust fixes on the current schema (the P0 set)
Do the P0 items first (journal fallback, claim-to-reality, context-aware resolution, self-invalidating scores, evidence-linking). These deliver user value now **and** establish the invariants the graph depends on (provenance at creation, no stale derived data). No new tables yet.

### Stage 1 — Stand up canonical tables + dual-write
- Create `nodes`, `edges`, `episodes` (additive; no reads yet).
- Make the ingestion pipeline **dual-write**: every chat/journal ingest also appends an `episode` and upserts the `node`/`edges` it implies. Old tables keep working.
- Risk: low (additive). Validate with a reconciliation job comparing old vs new representations.

### Stage 2 — Backfill from history
- Replay `journal_entries` + `extracted_units` + `chat_messages` into `episodes` (they're the source of truth).
- Rebuild `nodes`/`edges` from episodes via consolidation (this is the *real* test that consolidation can reconstruct the graph — the event-sourcing payoff).
- Reconcile against `characters`/`relationships`/`resolved_events`; investigate diffs (they'll reveal RC-1 orphans and entity-resolution errors — fix them here).

### Stage 3 — Cut over readers, one surface at a time (behind flags)
Order by risk, lowest first:
1. **Memory Health / "What AI Knows"** → read from graph (read-only surface; safe).
2. **Character Book / Life Log / Dating & Romance** → graph-backed views (golden-snapshot tests vs current output).
3. **Recall (the assembler)** → the big one. Run the assembler in **shadow** alongside the current routers, compare answers on a labeled transcript set, then flip the flag. Keep the routers one release for rollback.

### Stage 4 — Delete legacy
Once no reader references a legacy store and shadow has matched for a release, **delete**: the two recall routers, `character_memories`, `character_timeline_events`/`event_candidates`, `romantic_relationships`, the stored-score columns' write paths, the 4 reconstruction services, the duplicate diagnostics, `narrative_accounts` as a store. This is where the codebase gets *smaller*.

### Stage 5 — Scale-out (only as load demands)
Split API/consolidation workers → Redis cache tier → partition `episodes` by user → shard by `user_id` (Citus) → memory tiering (hot/warm/cold). None of this changes the model; it's the per-user-sharding payoff of the Phase-0 decision.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Backfill reveals data quality is worse than believed (orphan entities, bad merges) | That's a *feature* of Stage 2 — surface and fix before cutover; the reconciliation diff is the QA. |
| Assembler regresses some answers vs hand-tuned routers | Shadow mode + labeled transcript eval set before flipping; keep routers one release. |
| Dual-write doubles ingest write load | Episodes are cheap appends; consolidation is async. Monitor; batch. |
| Consolidation can't reconstruct a known fact | Then the fact was never evidenced — a trust win to discover, not hide. Add the missing episode link. |
| Scope/time (this is multi-quarter) | It's incremental: every stage ships value standalone; you can stop after any stage and be better off. |

---

## What to delete with confidence (the ruthless list)

- **Both recall routers** → one assembler.
- **`character_memories`, `character_timeline_events`, `event_candidates`** → edges/views.
- **`romantic_relationships`** as a separate model → unified edges + reified nodes.
- **Stored-uninvalidated importance/significance write paths** → versioned `salience` (Sprint AL persistence model partially reverted).
- **The 4 Sprint-AM reconstruction services** → one graph renderer (Sprint AM partially replaced).
- **`narrative_accounts`/biographies as a store** → rendered from graph.
- **3 of the 5 fact stores** (`crystallized_knowledge`/`entity_facts`/`omega_claims` consolidated) and **4 of the 5 diagnostics**.

None of these deletions lose information, because **episodes are immutable and everything else is rebuildable from them.** That property — established by Stage 0/1 — is the license to be ruthless.
