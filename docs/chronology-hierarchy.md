# Chronology Hierarchy — Current vs Proposed

Date: 2026-06-15

Purpose: define the **one canonical hierarchy** for LoreBook chronology. Audit only — no implementation.

Related: `docs/timeline-audit.md`, `docs/autobiographical-memory-graph.md`, `docs/life-graph-ontology.md`

---

## The problem

LoreBook uses **competing hierarchy models** simultaneously. Users and engineers cannot answer: "What is a Moment vs an Event vs a Memory vs an Arc vs a Chapter vs a Saga?"

Each model was built for a valid reason. Together they create **conceptual sprawl**.

---

## Competing hierarchy models (today)

### Model A — Life Graph / Autobiographical Memory (target architecture)

```
Life (person node)
  └── Life Period (coarse era)
        └── Chapter (bounded time span)
              └── Arc (narrative thread spanning chapters)
                    └── Theme (recurring motif)
                          └── Episode / Event (immutable scene)
                                └── Message (evidence)
```

**Storage (planned):** `nodes` + `edges` + `episodes`  
**Docs:** `autobiographical-memory-graph.md`, `life-graph-ontology.md`

### Model B — Life Arcs + Swimlane Tracks (active in Omni Timeline)

```
Life (implicit)
  └── Track (career | relationships | creative | health | inner | mixed)
        └── Life Arc (life_era | skill | location | work | occasion | custom)
              └── Arc memberships → event_candidates / resolved_events
```

**Storage:** `life_arcs`, `arc_memberships`, `arc_event_links`  
**UI:** TimelineSwimlanes, TimelineStoryView, SagaScreen

### Model C — 9-Layer Timeline Hierarchy (experimental)

```
Mythos
  └── Epoch
        └── Era
              └── Saga
                    └── Arc
                          └── Chapter
                                └── Scene
                                      └── Action
                                            └── Microaction
```

**Storage:** `timeline_mythos` … `timeline_microactions`  
**UI:** TimelineHierarchyPanel (unwired), ColorCodedTimeline, MemoirEditor

### Model D — Memoir / Lorebook Chapters (user-authored)

```
Life
  └── Era (optional tag on entries)
        └── Saga (optional tag)
              └── Arc (optional tag)
                    └── Chapter (user-written)
                          └── Journal entry / memory
```

**Storage:** `chapters`, journal entry metadata tags  
**UI:** MemoirEditor, MemoryExplorer card links

### Model E — Product UX Terms (Phase 0 productization)

```
Life Log
  └── Moments (browse unit = resolved_events today, episodes tomorrow)
        └── Facts (atomic claims inside moments)
              └── Patterns (recurring cross-session scenes)
```

**Storage:** Same as resolved_events + character_memories + event_candidates  
**UI:** EventsBook (Life Log)

### Model F — Stitched Timeline (read model)

```
Global scope (or life_arc scope)
  └── StitchedItem (kind: moment | event)
        └── sortTime + userSortIndex
```

**Storage:** Projection over `chronology_index` + `resolved_events` + `user_chronology_order`  
**UI:** TimelineStitchedView, calendar day panels

---

## Level-by-level comparison

| Level | Model A (Graph) | Model B (Arcs) | Model C (9-layer) | Model D (Memoir) | Model E (UX) | Model F (Stitched) | Canonical? |
|---|---|---|---|---|---|---|---|
| **Life** | person node | implicit | mythos | implicit | Life Log | global scope | **Yes — person** |
| **Era / Life Period** | life_period node | life_era arc type | era / epoch | era tag | — | — | **Merge → chapter parent** |
| **Chapter** | chapter node | occasion arc? | chapter layer | chapters table | — | — | **Yes — time container** |
| **Saga** | arc (narrative) | life_arc | saga layer | saga tag | — | — | **Merge → arc** |
| **Arc** | arc node | life_arc | arc layer | arc tag | — | life_arc scope | **Yes — narrative thread** |
| **Theme** | theme node | — | — | — | Patterns (weak) | — | **Yes — pattern layer** |
| **Project** | project node | — | — | — | — | — | **Yes — effort arc** |
| **Episode** | episode (immutable) | — | scene layer | — | Moment (future) | — | **Yes — primary unit** |
| **Event** | event node (typed) | resolved_events | — | — | Moment (today) | event kind | **Merge → episode+depth** |
| **Moment** | same as episode | — | — | — | browse card | moment kind | **UX name for episode** |
| **Memory** | episode fragment | chronology_index row | — | journal entry | Fact | moment kind | **Merge → fact or episode** |
| **Fact** | semantic edge/attr | character_memory | entity_fact | — | Fact UX | — | **Yes — semantic layer** |
| **Message** | evidence | chat_messages | — | — | — | — | **Yes — provenance only** |
| **Pattern** | theme instance | event_candidate | — | — | Patterns tab | — | **Yes — recurring scene** |
| **Track** | — | swimlane | — | — | — | — | **UX projection on arc** |
| **Thread** | chapter-ish grouping | — | — | — | — | — | **Container, not hierarchy level** |

---

## Current hierarchy (what the product actually behaves as)

```
User
  │
  ├─ THREAD (conversation_sessions)
  │     └─ messages (evidence)
  │     └─ episodes (segmented, not in UX yet)
  │
  ├─ LIFE LOG / OMNI TIMELINE (duplicate browse)
  │     ├─ Moments (= resolved_events)
  │     ├─ Facts (= journal + character_memories via MemoryExplorer)
  │     ├─ Patterns (= event_candidates)
  │     └─ Calendar (= stitched + occasions)
  │
  ├─ OMNI SWIMLANES
  │     └─ Track → Life Arc → (events + chronology dots)
  │
  ├─ STORY / SAGA
  │     └─ Life Arc as readable chapter
  │
  ├─ CHARACTER / PROJECT / ORG PAGES
  │     └─ Filtered timeline projections
  │
  └─ SEARCH
        └─ Universal grouped results (separate from browse)
```

**Missing links:** episodes don't surface; threads don't appear in timeline; arcs and chapters are disconnected; facts float without moment parents in browse UX.

---

## Proposed canonical hierarchy

One model. Three strata. User-facing words in **bold**.

```
┌─ NARRATIVE ─────────────────────────────────────────────
│  Life Period · Chapter · Arc · Theme · Pattern
│  (derived, proposed, evidence-linked — not authored blindly)
├─ EPISODIC ────────────────────────────────────────────
│  **Moment** (= episode, optionally deepened with meaning layers)
│  Message evidence (hidden unless requested)
├─ SEMANTIC ────────────────────────────────────────────
│  **Fact** (stable claims with validity intervals)
│  Person · Place · Project · Relationship (entity graph)
└─ CONTAINERS (orthogonal, not hierarchy levels) ───────
   Thread · Calendar day · Swimlane track
```

### Official level definitions

| Level | Internal | User word | Definition | Mutability |
|---|---|---|---|---|
| 0 | `chat_messages` | *(hidden)* | Raw evidence | Immutable |
| 1 | `episodes` | **Moment** | Bounded scene: who, where, when, messages | Immutable (supersede only) |
| 2 | `event` node + meaning layers | **Moment (deep)** | Moment with emotions, cognitions, narrative, causal links | Immutable evidence; mutable interpretation |
| 3 | semantic edges/attrs | **Fact** | Stable claim ("Abuela is my grandmother") | Versioned |
| 4 | `event_candidates` | **Pattern** | Recurring cross-session scene | Append-only |
| 5 | `life_arcs` / `chapter` nodes | **Chapter** | Named time span container | Proposed + confirmable |
| 6 | `arc` nodes | **Arc** | Narrative thread across chapters | Proposed + confirmable |
| 7 | `theme` nodes | **Theme** | Recurring motif | Derived |
| 8 | `life_period` nodes | **Life Period** | Coarse era ("Post-college") | Derived |
| — | `conversation_sessions` | **Thread** | Conversation container holding moments | Metadata |
| — | `life_arcs.track` | **Track** | UX swimlane (career, relationships…) | Projection on chapter/arc |

### What users should never see as separate products

- Events vs Memories vs Episodes → all **Moments** (with depth and facts inside)
- Omni Timeline vs Life Log → **Life Timeline**
- Saga vs Story view → **Story mode** inside Life Timeline
- 9-layer hierarchy layers → **advanced memoir structure** only (MemoirEditor), not global browse

---

## Disposition matrix

| Level / System | Current | Proposed | Action |
|---|---|---|---|
| Message | chat_messages | Evidence layer | **KEEP** |
| Episode | episodeSegmentationCore (backend) | Moment | **KEEP — surface in UX** |
| Resolved event | resolved_events | Moment (deep) | **MERGE into episode/event node** |
| Character memory | character_memories | Fact inside moment | **MERGE — never top-level browse** |
| Journal entry | journal_entries | Episode source | **MERGE → episodes** |
| Chronology index row | chronology_index | Moment projection | **KEEP as read cache** |
| Event candidate | event_candidates | Pattern | **KEEP** |
| Life arc | life_arcs | Chapter or Arc | **KEEP — rename UX to Chapter/Arc** |
| Swimlane track | life_arcs.track | Track projection | **KEEP — fix inference** |
| 9-layer hierarchy | timeline_mythos…microactions | Memoir-only or DELETE | **DELETE from global browse** |
| User chapters | chapters table | Chapter (authored) | **KEEP for MemoirEditor** |
| Saga (UI) | SagaScreen | Story mode | **MERGE into Life Timeline** |
| Stitched item | moment \| event kinds | Moment (unified kind) | **MERGE kinds → moment** |
| Thread | conversation_sessions | Container | **KEEP — not a hierarchy level** |
| Project | projects + tags | Entity + arc link | **KEEP as entity scope filter** |
| Character timeline | character_timeline_events | Filtered Life Timeline | **MERGE → projection** |
| timelimes_v2 | broken table | — | **DELETE** |
| ColorCodedTimeline (empty) | dummy/empty | — | **DELETE or wire to chapters** |

---

## Competing hierarchies — resolution rules

### Rule 1: Episodic beats narrative
Narrative levels (chapter, arc, theme) are **derived from** episodes/moments, never the other way around. If a chapter has no linked moments, it cannot display in browse UX.

### Rule 2: One browse unit
Users browse **Moments**. Facts appear inside moments. Patterns are a filter, not a parallel hierarchy.

### Rule 3: One narrative container system
`life_arcs` absorbs 9-layer saga/arc for timeline purposes. MemoirEditor may keep deep hierarchy for authoring, but it reads/writes the same `chapters` + `life_arcs` stores — not a third tree.

### Rule 4: Tracks are projections, not data
Swimlane tracks are computed labels on arcs (`life_arcs.track`), not a separate hierarchy level. Fixing Mixed swimlane is track inference, not a new layer.

### Rule 5: Threads are containers
Threads group moments chronologically within a conversation. They appear in thread intelligence and as filters on Life Timeline — not as a replacement for moments.

---

## Missing hierarchy levels (gaps)

| Gap | Impact | Fix |
|---|---|---|
| **Episodes not in UX** | Thread scenes invisible; Life Log shows assembled events only | Wire episode cards (Phase 1 productization) |
| **Fact → moment link in browse** | Facts float in MemoryExplorer without parent | Provenance chip + filter "has parent moment" |
| **Project as timeline scope** | No project timeline page filter in global browse | Project scope filter on Life Timeline |
| **Thread → moment link** | Can't see thread's moments in timeline | Thread intelligence rail + filter |
| **Turning points** | No explicit pivot level in UX | Derive from significance + causal centrality (graph plan) |
| **Relationship arcs** | Romantic/family arcs split across tables | Reified relationship_state nodes (graph plan) |
| **Valid-time on facts** | "Used to work at X" vs "Works at X" | Bi-temporal semantic layer (graph plan) |

---

## User-facing vocabulary (canonical)

| Say this | Not this | Internal |
|---|---|---|
| **Life Timeline** | Omni Timeline, Events, Life Log | merged browse surface |
| **Moment** | Event, Memory, Episode | episode / resolved_event |
| **Fact** | Memory (in browse) | character_memory, entity_fact |
| **Pattern** | Recurring Scene, event candidate | event_candidates |
| **Chapter** | Life Arc (in user copy) | life_arcs (occasion/era types) |
| **Arc** | Saga (for narrative threads) | life_arcs + graph arc nodes |
| **Story** | Life Saga | story mode over chapters |
| **Track** | Swimlane, category | life_arcs.track |

---

## Hierarchy diagram (proposed — single model)

```
                    ┌─────────────┐
                    │    LIFE     │  (one person — the user)
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ Life Period│  │   Thread   │  │  Project   │  ← containers / scopes
    └──────┬─────┘  └──────┬─────┘  └────────────┘
           │               │
           ▼               ▼
    ┌────────────┐  ┌────────────┐
    │  Chapter   │  │  Moments   │  ← primary browse
    └──────┬─────┘  └──────┬─────┘
           │               │
           ▼               ├─► Facts (semantic)
    ┌────────────┐         ├─► Evidence (messages)
    │    Arc     │         └─► Meaning layers (deep moments)
    └──────┬─────┘
           ▼
    ┌────────────┐
    │   Theme    │
    └──────┬─────┘
           ▼
    ┌────────────┐
    │  Pattern   │  ← recurring cross-session
    └────────────┘

    Track (career/relationships/…) = colored row in swimlane VIEW over Chapters/Arcs
```

---

## Success criteria

1. An engineer can draw the hierarchy from memory in **one diagram**.
2. A user can explain Life Log in **one sentence**: "Moments from my life, with details inside."
3. No two tables store the same narrative level under different names without a documented projection rule.
4. Every narrative level links to **moment evidence** or is hidden.
5. Graph migration (`graph-migration-plan.md`) and UX productization (`episode-experience.md`) reference **the same level names**.
