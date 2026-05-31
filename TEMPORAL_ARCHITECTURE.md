# Temporal Architecture

Lorekeeper models human autobiographical time — which is not physics time. A person's life has five distinct temporal layers that require separate treatment:

| Layer | What it captures | Example |
|-------|-----------------|---------|
| **Clock time** | When the computer recorded this | `created_at` — always UTC, always exact |
| **Event time** | When it actually happened | `date` on journal_entries — can be fuzzy, approximate, inferred |
| **Narrative time** | The order the story is told | Flashbacks, retrospective interpretation |
| **Psychological time** | How long it felt | A grief year is not the same as a good year |
| **Relational time** | What else was happening simultaneously | Parallel life tracks |

The architecture uses five systems to handle these layers. They are **not redundant** — each answers a different question.

---

## System 1: ChronologyEngine V1

**Location:** `apps/server/src/services/chronology/`

**Question it answers:** *What caused what? What patterns exist in the raw event stream? What is missing between events?*

### Components

| File | Responsibility |
|------|---------------|
| `chronologyEngine.ts` | Main orchestrator — runs the full pipeline |
| `ambiguityResolver.ts` | Infers timestamps for events with none |
| `temporalGraph.ts` | Builds directed graph using Allen's interval algebra |
| `causalInference.ts` | Longest-path DAG to find causal chains |
| `gapDetector.ts` | Finds temporal gaps between consecutive events |
| `patternDetector.ts` | Temporal density, clustering, regular intervals |
| `narrativeBuilder.ts` | First-person LLM narrative from chronological events |
| `utils/intervalAlgebra.ts` | All 13 Allen relations with precision-aware confidence |
| `eventMapper.ts` | Converts journal_entries / memory_components → Event |
| `storageService.ts` | Persists snapshot to `chronology_snapshots` table |
| `chronologyArcBridge.ts` *(integration)* | Redirects causal/Allen findings into `arc_relationships` |
| `gapNodeService.ts` *(integration)* | Converts significant gaps into typed `timeline_scenes` nodes |
| `hierarchyContextProvider.ts` *(integration)* | Feeds era/saga/arc date ranges into ambiguity resolution |

### Pipeline

```
Events (from journal_entries or memory_components)
  │
  ├─ hierarchyContextProvider.applyHierarchyConstraints()   [NEW]
  │    Annotates events with their hierarchy period (era/saga/arc/chapter).
  │    Anchors undated events to the nearest hierarchy period.
  │
  ├─ AmbiguityResolver.resolve()
  │    Infers missing timestamps via: hierarchy anchoring → embedding similarity
  │    → average of known events → current time.
  │
  ├─ TemporalGraphBuilder.buildWithCausality()
  │    Applies Allen's 13 interval relations to all event pairs.
  │    Boosts confidence when semantic similarity > 0.7.
  │
  ├─ CausalInference.infer()
  │    DAG longest-path algorithm on 'causes' edges.
  │    Returns CausalChain[] { rootEvent, chain[], confidence }.
  │
  ├─ GapDetector.detect()
  │    Finds spans > 3 days between consecutive events.
  │
  ├─ PatternDetector.detect()
  │    Temporal density score, clustering (7-day windows), regular intervals.
  │
  └─ [outputs]
       ├─ chronology_snapshots (upserted, one row per user)
       ├─ arc_relationships ← chronologyArcBridge.ts   [NEW: causal/Allen → arc graph]
       └─ timeline_scenes ← gapNodeService.ts           [NEW: gaps → typed hierarchy nodes]
```

### Allen's Interval Relations

```
before   — A ends before B starts
after    — B ends before A starts
meets    — A ends exactly when B starts
overlaps — A starts before B ends, B starts before A ends (partial)
contains — A wholly surrounds B
during   — B wholly surrounds A
starts   — A and B share a start; A ends first
finishes — A and B share an end; A starts later
equals   — identical date ranges
causes   — inferred causal relationship (semantic + temporal proximity)
```

### Inputs
- `journal_entries` (via `eventMapper.mapMemoryEntriesToEvents`)
- `memory_components` (via `eventMapper.mapMemoryComponentsToEvents`)

### Outputs (post-integration)
- `chronology_snapshots` — full result snapshot (gaps, chains, patterns, counts)
- `arc_relationships` — Allen/causal edges mapped to arc-level relationships
- `timeline_scenes` — typed gap nodes (recovery, transition, no_data)

### Routes
```
POST /api/chronology/process    — run full pipeline on provided/fetched events
GET  /api/chronology/narrative  — first-person narrative summary [NEW]
GET  /api/chronology/gaps       — detected gaps for user
GET  /api/chronology/chains/:id — causal chains from an entry
GET  /api/chronology/graph/:id  — temporal graph for an entry
GET  /api/chronology/summary    — latest snapshot (fast, no recompute)
```

### Known gaps
- Python analytics client (`pythonClient.ts`) fires but output is discarded — either surface or remove
- `narrativeBuilder.ts` endpoint is new; test for token cost under high event counts

---

## System 2: ChronologyService V2

**Location:** `apps/server/src/services/chronologyV2/`

**Question it answers:** *Give me events in order. Find overlapping periods. Bucket by decade/year/month.*

### Design

V2 is a **read-only query service** over the `chronology_index` table — a denormalized view of `journal_entries` with year/month/decade buckets pre-computed. It never runs analysis; it serves pre-indexed data fast.

### Key methods

```typescript
getChronologicalOrder(userId, startTime?, endTime?, timelineIds?) → ChronologyEntry[]
detectOverlaps(userId, entryId?)                                  → ChronologyOverlap[]
validateChronology(entry)                                         → ChronologyConstraint[]
getTimeBuckets(userId, 'decade'|'year'|'month')                   → TimeBucket[]
```

### Inputs
- `chronology_index` table (pre-populated from `journal_entries`)

### Routes
```
GET /api/chronology          — master chronological view (calls getChronologicalOrder)
GET /api/chronology/overlaps — overlapping time periods
GET /api/chronology/buckets  — decade/year/month aggregation
```

### Relationship to V1
V2 and V1 are **orthogonal**. V1 runs analysis (expensive, async); V2 runs queries (cheap, synchronous). V1 feeds `chronology_snapshots`; V2 reads `chronology_index`. Neither replaces the other.

---

## System 3: Timeline Hierarchy

**Location:** `apps/server/src/services/timelineManager.ts` + `supabase/migrations/20250120000033_timeline_hierarchy.sql`

**Question it answers:** *What is the narrative structure of this life? Where does this event belong in the story?*

### 9-Layer Hierarchy

```
timeline_mythos        — top-level life narrative (one per user)
  timeline_epochs      — broad historical periods
    timeline_eras      — refined time periods
      timeline_sagas   — major story arcs
        timeline_arcs  — character/plot arcs
          chapters     — chapters of a story
            timeline_scenes   — individual scenes
              timeline_actions      — specific actions
                timeline_microactions — smallest unit
```

Each node has: `id, user_id, parent_id, title, description, start_date, end_date, tags, source_type, metadata`.

### TimelineManager (896 lines)

The manager provides:
- `createNode()` — with auto-title generation via LLM
- `getChildren()` / `getNodeWithChildren()` — tree traversal
- `autoClassify()` — AI classification of content to the right layer
- `getRecommendations()` — suggest parent nodes for new content
- `autoAssignTags()` / `autoGenerateSummary()` — enrichment
- `search()` — full-text search across all 9 layers simultaneously
- `closeNode()` — set end_date to mark completion

### Gap nodes (post-integration)
When V1 detects gaps ≥ 30 days, `gapNodeService.ts` creates `timeline_scenes` with:
- `source_type: 'ai'`
- `tags: ['gap', 'chronology_inferred', gapType]`
- `gapType` one of: `recovery`, `transition`, `no_data`, `identity_shift`

These are idempotent (identified by `start_date + end_date + user_id`).

### Routes
```
POST /api/timeline/:layer/create
PUT  /api/timeline/:layer/update/:id
GET  /api/timeline/:layer/:id
GET  /api/timeline/:layer/:id/children
GET  /api/timeline/:layer/:id/tree
DELETE /api/timeline/:layer/:id
POST /api/timeline/:layer/:id/close
POST /api/timeline-hierarchy/search
POST /api/timeline/:layer/:id/auto-classify
GET  /api/timeline/:layer/recommendations
```

---

## System 4: TimelineInsight

**Location:** `apps/server/src/services/timelineInsight/`

**Question it answers:** *For this arc/saga, what gaps exist inside it? What was happening in parallel?*

### Components

| File | Responsibility |
|------|---------------|
| `timelineContextInsightService.ts` | Orchestrator — combines gap detection + parallel resolution |
| `hierarchyGapDetection.ts` | Pure logic: finds empty spans inside a parent node |
| `parallelContextResolution.ts` | Finds overlapping sagas/arcs, now with Allen relation types |

### Gap detection

```typescript
detectHierarchyGaps(parent: HierarchyNodeInput, children: ChildNodeForGaps[]): HierarchyGap[]
```

Finds unoccupied date ranges within a parent node (before first child, between children, after last child). Classifies by size: `short` (<30d), `medium` (<180d), `long` (≥180d). Pure logic — no DB access.

### Parallel resolution (upgraded)

```typescript
resolveParallelContext(userId, node) → ParallelContext {
  explicit: []   // explicit parallel_to relations from timeline_node_relations
  implicit: []   // date-overlap detection with Allen relation type
}
```

Each implicit parallel node now carries `allen_relation: AllenRelation` — one of `overlaps`, `contains`, `during`, `starts`, `finishes`, `equals`. This tells consumers not just that two periods overlapped, but how.

### Allen relation function

```typescript
computeAllenRelation(aStart, aEnd, bStart, bEnd): AllenRelation
```

Exported from `parallelContextResolution.ts`. Can be used anywhere hierarchy nodes need precise temporal relationship computation.

### Integration with chat
`extendChatContext()` returns parallel and gap summaries to the RAG builder, which injects them into the system prompt so the AI can say: *"While you were in the 'Building Lorekeeper' arc, you were simultaneously navigating the 'With Maya' relationship arc (overlapping) and the 'Post-breakup year' arc (preceding)."*

---

## System 5: Life Arcs

**Location:** `apps/server/src/services/continuityRuntime/arcs/`

**Question it answers:** *What named life periods exist? How do they relate causally and structurally?*

Life arcs are the **canonical autobiographical containers**. They sit above the event stream and below the timeline hierarchy.

```
resolved_events → event_candidates → life_arcs
                                         ↓
                                    arc_memberships (which events define each arc)
                                         ↓
                                    arc_relationships (how arcs relate: spawned, influenced, overlapped...)
```

### Arc relationship types
```
spawned    — Arc A gave rise to Arc B (college era → tech career)
influenced — Arc A shaped Arc B without replacing it (depression → values shift)
overlapped — A and B ran simultaneously
preceded   — A ended before B began
merged     — Two arcs converged into one
split      — One arc diverged into two
```

### Post-integration data flows into arc_relationships

1. **From ChronologyEngine V1** (via `chronologyArcBridge.ts`):
   - Allen `causes` edges → `spawned` arc relationships
   - Allen `before`/`meets` edges → `preceded` arc relationships
   - Allen `overlaps`/`contains`/`during` → `overlapped` arc relationships
   - Causal chains ≥ 3 events → `spawned` (root arc → terminus arc)

2. **From relationship_ended trigger** (via `knowledgeCrystallization/relationshipEndedTrigger.ts`):
   - Relationship arcs created with `track: 'relationships'`
   - `metadata.romantic_relationship_id` links arc to source relationship

3. **From arc_inference** (when the arc inference service runs):
   - Inferred arcs with confidence-based visibility thresholds

### Confidence thresholds
- `< 0.5` — speculative, not shown to user
- `≥ 0.5` — visible on arc timeline
- `≥ 0.8` — included in system prompt continuity block

---

## System 6: TimelineEngine + Normalizers

**Location:** `apps/server/src/services/timeline/`

**Question it answers:** *Give me all timeline-visible events from any domain in one unified format.*

Normalizes events from diverse source types (journal entries, relationships, career events, health records, habits) into a single `timeline_events` table. 11 normalizers cover different domains.

---

## Data Flow Summary

```
User writes journal entry
        │
        ├─► ingestion pipeline (entity extraction, omega_claims, resolved_events)
        │
        ├─► ChronologyEngine V1 (via POST /api/chronology/process)
        │     │
        │     ├─ hierarchy context applied first (era/saga/arc annotations)
        │     ├─ Allen's algebra on all event pairs
        │     ├─ causal chains inferred
        │     ├─ gaps detected
        │     │
        │     ├─► chronology_snapshots (upserted)
        │     ├─► arc_relationships (causal + Allen findings)
        │     └─► timeline_scenes (typed gap nodes)
        │
        ├─► ChronologyService V2 (fast indexed queries)
        │     └─► chronology_index (read)
        │
        └─► TimelineInsight (on hierarchy node request)
              ├─ hierarchyGapDetection (pure logic)
              └─ parallelContextResolution (Allen-typed overlaps)
                    └─► ChatContextExtension (injected into RAG)
```

---

## Orphan Registry

Files that are complete, valuable, and dormant — awaiting integration:

| File | Unique value | Status |
|------|-------------|--------|
| `legacy/legacyEngine.ts` | Long-term meaning emergence, significance curves across years | PRESERVE — wire into engineRegistry |
| `services/lifeArcService.ts` | Narrative life story fragment generation with stability gating | PRESERVE — wire into dashboard route |
| `memoryRecall/recallEngine.ts` | Multi-stage recall with semantic ranking + continuity awareness | PRESERVE — wire into chat/search |
| `compiler/ndie.ts` | Narrative diff & identity evolution tracking | PRESERVE — wire into identity pipeline |
| `compiler/canonService.ts` | User-controlled canonical story curation | PRESERVE — Phase 3.6 |
| `encryptionService.ts` | AES-256-GCM, complete, never imported | PRESERVE — activate in privacy features |
| `paracosm/` (5 files) | Internal world/alternate self modeling | PRESERVE — wire into ingestion |
| `rpg/rpgProcessor.ts` | Event-driven RPG stat aggregation | PRESERVE — hook journal entry creation |
| `chronology/pythonClient.ts` | Python ML analytics bridge | ARCHIVE — verify backend exists |
| `activeLearning/modelFineTuner.ts` | Personalization stub | ARCHIVE — pending ML infrastructure |

## Deprecated / Redirected

| What | Status |
|------|--------|
| `graph_edges` writes (storageService.ts) | Still written as cache; additionally bridged to `arc_relationships` |
| `timeline_relationships` table | Preserved as future scaffolding; no active reads or writes |
| `relationship_snapshots` table | Written by temporalEdgeService; read path not yet activated |

---

## Known Gaps

1. **Timezone**: `timeEngine.setUserTimezone()` is implemented but never called from any request middleware. All relative time parsing ("yesterday") operates in UTC. Fix: inject user timezone from profile into every request context.

2. **Fuzzy date intervals**: `time_precision` and `time_confidence` are stored in the DB but not used in Allen's algebra — all events are treated as point events or exact intervals. Allen's algebra should produce uncertainty-weighted relations when `time_precision = 'month'` or `'year'`.

3. **Recording lag**: The delta between `created_at` (when written) and `date` (when it happened) is never computed or used. Longer lags should reduce confidence on knowledge claims and signal memoir-mode reconstruction.

4. **Seasonal patterns**: `patternDetector.ts` finds regular intervals but not year-over-year seasonal patterns. The `chronology_index` year/month buckets are built for this; no query uses them.

5. **Future-pointing events**: Intentions and predictions ("I'm going to leave this job") are stored as regular entries. No service tracks whether the predicted event materialized.
