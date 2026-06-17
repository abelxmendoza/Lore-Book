# Timeline Audit — Full Chronology Inventory

Date: 2026-06-15

Purpose: inventory every chronology-related system before Timeline Intelligence work. **Audit only — no implementation.**

Related: `TEMPORAL_ARCHITECTURE.md`, `docs/graph-migration-plan.md`, `docs/episode-experience.md`

---

## Executive summary

LoreBook has **at least six overlapping temporal stacks** serving different questions, plus **three active browse surfaces** (Omni Timeline, Life Log, Life Saga) that duplicate calendar/stitched views. There is **no single source of truth** for chronology today.

| Stack | Question it answers | Canonical? |
|---|---|---|
| `resolved_events` + assembly pipeline | What happened, when, with whom? | **Yes — event substrate** |
| `chronology_index` + Chronology V2 | Give me journal memories in order | **Yes — memory read path** |
| `life_arcs` + tracks | What named life periods exist? | **Yes — narrative containers (swimlanes)** |
| 9-layer timeline hierarchy | What is the mythos→microaction story tree? | **Experimental — overlaps life_arcs** |
| Chronology V1 engine | What caused what? What gaps exist? | **Analysis-only — not browse** |
| Episode segmentation | What scenes exist inside threads? | **Backend active — UX not wired** |

**Recommended canonical model (Phase 7):** one **Life Timeline** view over two substrates — **Moments** (`episodes` + `resolved_events`) and **Facts** (semantic claims) — framed by **Chapters** (`life_arcs` + graph `chapter` nodes), with Chronology V1 as async analysis, not a browse surface.

---

## Phase 1 — Timeline inventory

### Primary data substrates

| Feature | Purpose | Source (tables) | API | Used by | Status | Redundant? | Canonical? |
|---|---|---|---|---|---|---|---|
| **Resolved events** | Assembled life happenings from chat (WHO/WHERE/WHEN + meaning layers) | `resolved_events`, `event_mentions`, `event_impacts`, `event_causal_links`, `narrative_accounts` | `GET /api/conversation/events`, `POST /api/conversation/assemble-events` | Life Log Moments, Omni stitched, calendar, character timelines | **Active** | Partial overlap with chronology_index moments | **Yes — event substrate** |
| **Event candidates (Patterns)** | Cross-session recurring scenes | `event_candidates` | `GET /api/conversation/event-candidates` | Life Log Patterns tab | **Active** | Distinct from V1 patternDetector | **Yes — pattern layer** |
| **Chronology index (memories)** | Denormalized journal memory timeline | `chronology_index` ← `journal_entries` | `GET /api/chronology` | Omni Timeline swimlanes (dots), stitched merge | **Active** | Overlaps stitched "moment" items | **Yes — journal read path** |
| **Stitched timeline** | Unified stream: journal moments + resolved events | `chronology_index` + `resolved_events` + `user_chronology_order` | `GET /api/chronology/stitched` | Omni Events tab, Life Log calendar day panel, `TimelineStitchedView` | **Active** | Duplicated in Life Log + Omni | **Yes — unified browse stream** |
| **Calendar aggregation** | Month grid: occasions + events + moments | `life_arcs` (occasion), `resolved_events`, `chronology_index` | `GET /api/chronology/calendar?year=&month=` | Omni Calendar, Life Log Calendar | **Active** | **High duplication** with Life Log | **Yes — calendar projection** |
| **Life arcs** | Named life periods on parallel tracks | `life_arcs`, `arc_memberships`, `arc_event_links`, `arc_relationships` | `GET/POST /api/life-arcs` | Omni Swimlanes, Story view, SagaScreen | **Active** | Overlaps 9-layer sagas/arcs | **Yes — narrative containers** |
| **Character timeline events** | Per-person shared experience lane | `character_timeline_events` ← `resolved_events` | `GET /api/conversation/characters/:id/timelines` | CharacterTimelinePanel, org modals | **Active** | Projection of resolved_events | **Merge → graph view** |
| **Episodes (segmentation)** | Thread-local bounded scenes | Thread metadata / future `episodes` table | Not exposed yet | Thread intelligence (planned) | **Backend active** | Will supersede raw message browse | **Future canonical moment unit** |
| **Thread metadata** | Thread summaries, key people/places/episodes | `conversation_sessions.metadata.threadMeta` | Thread routes + chat continuity | Chat header (planned) | **Active backend, weak UX** | Not a timeline store | **Container metadata** |
| **User chronology order** | Drag-reorder overrides | `user_chronology_order` | `PUT /api/chronology/order` | TimelineStitchedView | **Active** | — | **Yes — user preference overlay** |

### Analysis / legacy substrates

| Feature | Purpose | Source | API | Used by | Status | Redundant? | Canonical? |
|---|---|---|---|---|---|---|---|
| **ChronologyEngine V1** | Causal chains, gaps, Allen relations, patterns | `journal_entries` → `chronology_snapshots`, `arc_relationships`, `timeline_scenes` | `POST /api/chronology/process`, `/gaps`, `/narrative`, `/chains/:id` | Experimental; chat RAG extension | **Experimental** | Overlaps V2 naming | **Keep — analysis only** |
| **9-layer timeline hierarchy** | Mythos→microaction narrative tree | `timeline_mythos` … `timeline_microactions`, `chapters` | `/api/timeline-hierarchy`, `/api/timeline/:layer/*` | TimelineHierarchyPanel (unwired), ColorCodedTimeline, MemoirEditor | **Experimental / legacy UI** | **High overlap with life_arcs + chapters** | **Merge → chapter/arc graph** |
| **Timeline engine + normalizers** | Domain events → unified timeline format | `timeline_events` (via normalizers) | `/api/timeline/entries`, `/api/search/universal` | Universal Search, legacy timeline pages | **Partially active** | Overlaps stitched + resolved_events | **Merge → projections** |
| **timelines / timeline_memberships** | Flexible multi-timeline journal grouping | `timelines`, `timeline_memberships` | Chronology V2 optional filter | V2 queries | **Active but niche** | Overlaps life_arcs | **Merge → chapter nodes** |
| **timelines_v2 service** | CRUD on timelines_v2 | **`timelines_v2` — no migration found** | `/api/timeline-v2` | `useTimelineV2`, timeline-v2 components | **Likely dead/broken** | Fully redundant | **DELETE** |
| **Chronology snapshots** | V1 analysis cache | `chronology_snapshots` | `GET /api/chronology/summary` | Diagnostics | **Active cache** | — | **Keep — V1 output** |
| **Python chronology** | Advanced pattern/causality | Called via `pythonClient.ts` | Internal | V1 pipeline | **Underused** — output discarded | Redundant with TS | **DELETE or wire** |
| **Saga engine (analytics)** | Embedding clusters → saga labels | `journal_entries` embeddings | Background | Analytics | **Background** | Overlaps timeline_sagas | **Merge → consolidation worker** |
| **Life arc narrative service** | LLM summary of recent 7/30/90 days | `resolved_events` | **`/api/life-arc/recent` — route missing** | LifeArcPanel (Discovery) | **Broken** | Overlaps thread summaries | **Fix or DELETE panel** |

---

## UI surfaces inventory

| Surface | Route / sidebar | Component | Data APIs | Status | Redundant with |
|---|---|---|---|---|---|
| **Omni Timeline** | `/timeline` | `OmniTimeline.tsx` | `/api/life-arcs`, `/api/chronology`, stitched, calendar | **Primary timeline UX** | Life Log |
| ↳ Swimlanes | Omni sub-view | `TimelineSwimlanes.tsx` | life_arcs + chronology entries | **Active** | — |
| ↳ Events (stitched) | Omni sub-view | `TimelineStitchedView.tsx` | `/api/chronology/stitched` | **Active** | Life Log Moments |
| ↳ Calendar | Omni sub-view | `TimelineCalendarView.tsx` | `/api/chronology/calendar` | **Active** | Life Log Calendar |
| ↳ Story | Omni sub-view | `TimelineStoryView.tsx` | life_arcs | **Active** | SagaScreen |
| ↳ Search (inline) | Omni sub-view | Inline filter on chronology entries | Client-side only | **Weak** — content substring match | Universal Search |
| **Life Log** | `/events` (legacy `/memories`) | `EventsBook.tsx` | `/api/conversation/events`, event-candidates, calendar | **Primary moment browse** | Omni Events + Calendar |
| ↳ Moments (grid) | Life Log tab | EventProfileCard grid | resolved_events | **Active** | Omni stitched |
| ↳ Timeline layout | Life Log sub-layout | `ColorCodedTimeline` **with no props** | None — empty/dummy | **Broken** | Omni Swimlanes |
| ↳ Search facts | Life Log sub-layout | `MemoryExplorer` | journal / memory APIs | **Active** | Universal Search (partial) |
| ↳ Patterns | Life Log tab | Recurring scene cards | event_candidates | **Active** | — |
| ↳ Calendar | Life Log tab | Calendar grid + day panel | `useCalendarMonth` | **Active** | Omni Calendar |
| **Life Saga** | `/saga` | `SagaScreen.tsx` | `/api/life-arcs` + mock | **Active** | Omni Story view |
| **Universal Timeline Search** | `/search` | `TimelineSearch.tsx` | `POST /api/search/universal` | **Active — buried** | Omni inline search |
| **Character timelines** | Character detail | `CharacterTimelinePanel.tsx` | character timelines API | **Active** | Filtered life timeline |
| **Org timelines** | Org detail | `EventTimelineSwimlanes` | Derived from org events | **Active** | Entity-scoped view |
| **Timeline Hierarchy Panel** | Not in App shell | `TimelineHierarchyPanel.tsx` | `/api/timeline-hierarchy` | **Legacy/unwired** | life_arcs + chapters |
| **ChronologyView** | Not in App shell | `ChronologyView.tsx` | chronology V1 | **Unwired** | — |
| **TimelinePage / V2 / Panel** | Not in App shell | Various under `components/timeline/` | Legacy routes | **Superseded** | OmniTimeline |
| **MemoirEditor timeline** | `/memoir` | ColorCodedTimeline with props | chapters + hierarchy | **Active in memoir** | — |
| **Discovery LifeArcPanel** | Discovery hub | `LifeArcPanel.tsx` | Missing `/api/life-arc/recent` | **Broken** | Thread intelligence |

---

## Phase 3 — Timeline data flow

### Current flow (as implemented)

```
chat_messages (immutable evidence)
    │
    ├─► ingestion pipeline
    │       ├─► resolved_events (+ meaning layers)
    │       ├─► character_timeline_events (per-person projection)
    │       ├─► event_candidates (recurring patterns)
    │       └─► journal_entries / extracted_units
    │
    ├─► chronology_index (journal denormalization)
    │
    ├─► episodeSegmentationCore (thread scenes — not persisted to UX yet)
    │
    ├─► threadIntelligenceService → conversation_sessions.metadata
    │
    ├─► event_candidates ──► arcInferenceService ──► life_arcs (swimlane bars)
    │
    ├─► resolved_events ──► dayOccasionService ──► life_arcs (occasion type)
    │
    ├─► ChronologyEngine V1 (async analysis)
    │       └─► chronology_snapshots, arc_relationships, timeline_scenes
    │
    └─► UI reads (THREE parallel paths):
            ├─ Omni Timeline: life_arcs + chronology + stitched + calendar
            ├─ Life Log: resolved_events + event_candidates + calendar
            └─ Universal Search: timeline engine normalizers
```

### Target flow (from graph + episode plans — not implemented)

```
chat_messages
    ↓ episodeSegmentationCore
EPISODE (moment unit — primary)
    ↓ entityResolutionCore
ENTITIES (person, place, project)
    ↓ consolidation
SEMANTIC FACTS (edges/attrs)
    ↓ clustering
CHAPTER / ARC (life_arcs → graph chapter nodes)
    ↓ rendering
LIFE STORY (projection, not stored blob)
```

### Duplicate transformations (same data, multiple paths)

| Transformation | Path A | Path B | Path C |
|---|---|---|---|
| Journal → timeline item | `chronology_index` | Stitched `moment` kind | Universal search normalizer |
| Chat → life happening | `resolved_events` | Stitched `event` kind | `character_timeline_events` |
| Events → narrative period | `life_arcs` (inference) | 9-layer `timeline_arcs/sagas` | `chapters` table |
| Recurring detection | `event_candidates` | Chronology V1 `patternDetector` | Analytics sagaEngine |
| Day grouping | Calendar aggregation | dayOccasionService | EventsBook calendar local merge |
| Thread → scenes | episodeSegmentationCore | resolved_events assembly | metadata.messages (legacy) |

---

## Phase 4 — Swimlane "Mixed" failure analysis

### Three different "Mixed" concepts (do not conflate)

| System | Field | Meaning |
|---|---|---|
| **Life arc tracks** | `life_arcs.track = 'mixed'` | Thematic swimlane: multi-domain or unclassified arc |
| **Event confidence UI** | confidence 0.4–0.7 | "Mixed" confidence label in EventsView |
| **Emotional impact** | `emotionalImpact: 'mixed'` | Emotional tone on event/character timeline |

User complaint "everything appears in Mixed" refers to **swimlane track `mixed`**.

### Track assignment pipeline

```
event_candidates / resolved_events
    ↓
arcInferenceService.inferTrack()     dayOccasionService.inferTrack()
    ↓                                      ↓
life_arcs.track stored in DB
    ↓
useLifeArcs → arcsByTrack (null track → 'inner')
    ↓
TimelineSwimlanes → TRACK_ORDER rows including 'mixed'
```

### Root causes

**1. Multi-signal → mixed rule (arcInferenceService)**

```typescript
// apps/server/src/services/continuityRuntime/arcs/arcInferenceService.ts
const signals = [hasHealth, hasRelationship, hasCreative, hasCareer].filter(Boolean).length;
if (signals > 1) return 'mixed';
```

Real life routinely spans domains (family + work + health). Any candidate with activities touching two domains becomes `mixed`.

**2. Occasion arcs default to mixed (dayOccasionService)**

```typescript
// apps/server/src/services/continuityRuntime/arcs/dayOccasionService.ts
function inferTrack(events): ArcTrack {
  // Only relationships, career, creative keyword paths
  // No health, no inner — everything else:
  return 'mixed';
}
```

Most day-clustered occasions that don't match narrow regex lists land in **Mixed**.

**3. Weak activity/entity signal on event_candidates**

`recurring_activities` and `dominant_entity_names` are often sparse from assembly. `life_era` arcs with empty signals fall through to `inner` in inference — but occasion arcs bypass this and use dayOccasionService.

**4. No user override path in UI**

Tracks are inferred once; no UI to reassign arc track. Errors persist.

**5. Visual prominence**

`mixed` track uses gray styling (`bg-white/8`) but may contain the **majority** of arcs if inference is permissive — the lane looks like "everything is Mixed."

**6. Chronology entry dots vs arc bars**

Memory dots use `entryTrack()` — assign to best date-overlapping arc's track, default `inner`. So **bars** cluster in Mixed while **dots** may spread — inconsistent UX.

### Fix plan (P0–P2)

| Priority | Fix | Effort |
|---|---|---|
| **P0** | Change dayOccasionService default from `mixed` → `inner` (or infer from dominant event.type) | S |
| **P0** | Replace binary multi-signal rule with **primary track scoring** (highest-weight domain wins) | M |
| **P1** | Expand keyword lexicons: health, inner, family, logistics | M |
| **P1** | Add `track_source: 'inferred' \| 'user'` + UI track reassignment on arc detail | M |
| **P1** | Backfill existing arcs with improved inferTrack; script + confidence bump | M |
| **P2** | Unify track inference in one function (arcInference + dayOccasion share core) | M |
| **P2** | Hide `mixed` row when empty; collapse single-arc mixed into primary track | S |

---

## Phase 5 — Filter audit

### Existing filters (by surface)

| Filter | Omni Timeline | Life Log | Universal Search | Character timeline | Status |
|---|---|---|---|---|---|
| **Time / date range** | Zoom + scroll window | Date range chips, calendar | — | Implicit (character scope) | **Active** |
| **People** | — (arc titles only) | Keyword + people count filter | `people` group | Built-in scope | **Partial** |
| **Places / locations** | — | Location filter, category | `locations` group | — | **Partial** |
| **Projects** | — | — | `projects` group | — | **Search only** |
| **Relationships** | Track: relationships | Category: family, with_people | `relationships` group | Built-in | **Fragmented** |
| **Family** | — | Category chip (keywords) | — | — | **Keyword-only** |
| **Career / work** | Track: career | Category: work | `jobs` group | — | **Fragmented** |
| **Health** | Track: health | — | — | — | **Swimlane only** |
| **Creative** | Track: creative | Category: concerts, festivals | — | — | **Fragmented** |
| **Organizations** | — | — | — | Org modal scope | **Entity page only** |
| **Skills** | — | — | `skills` group | — | **Search only** |
| **Confidence** | — | Min/max + significance chips | — | — | **Life Log only** |
| **Source** | — | — | `sourceType` in results | Memory source tags | **Hidden** |
| **Impact type** | — | Impact chips (I was there, ripple…) | — | — | **Life Log only** |
| **Significance** | — | Major/moderate/minor | — | — | **Life Log only** |
| **Arc / saga / era** | Story view by arc | — | `arcs`, `sagas`, `eras` groups | — | **Search + Story only** |
| **Patterns / recurring** | — | Patterns tab | — | — | **Life Log only** |
| **Entity type** (apps, products…) | — | — | — | — | **Missing** |
| **Thread scope** | — | — | — | — | **Missing** |
| **Episode scope** | — | — | — | — | **Missing (no UX)** |
| **Provenance / verified** | — | — | — | — | **Missing** |

### Broken / hidden filters

| Issue | Detail |
|---|---|
| Life Log categories | Client keyword matching on title/summary — **not** DB `category` or swimlane track |
| Omni inline search | Substring on `entry.content` only — no entity grouping |
| ColorCodedTimeline | No filters — receives no data in Life Log timeline layout |
| Universal Search | Rich grouping but **separate surface** from timeline browse |
| Swimlane tracks | Fixed 6 lanes — no filter to show/hide tracks |

### Recommended canonical filter model

One filter bar shared across Life Timeline (merged Omni + Life Log):

```
Scope:     [ Everything ] [ Moments ] [ Facts ] [ Patterns ]
Entity:    People · Places · Projects · Organizations
Theme:     Career · Relationships · Creative · Health · Inner
Time:      Presets + calendar range
Quality:   Confidence · Significance · Has evidence · Needs review
Presence:  I was there · Heard about · Recurring
Source:    Chat · Journal · Import · Inferred
```

Filters compile to a single query against **stitched timeline + entity index**, not per-surface keyword lists.

---

## Phase 6 — Search UX audit

### Current placement

| Search surface | Location | Scope | Quality |
|---|---|---|---|
| **Universal Timeline Search** | Sidebar → `/search` (separate surface) | People, places, skills, jobs, projects, eras, arcs, sagas, relationships via `/api/search/universal` | **Best grouping** — buried |
| **Omni Timeline → Search tab** | Sub-view inside `/timeline` | Client-side filter on chronology entry content | **Weakest** — no entity grouping |
| **Life Log → Search facts** | Sub-layout inside `/events` | MemoryExplorer semantic/keyword | **Facts only** |
| **Life Log moment search** | Grid search input | resolved_events title/people/place keywords | **Moments only** |
| **⌘K shortcut** | App.tsx → navigates to `/search` | Universal search | Good shortcut, wrong default results for chronology |

### Problem

Chronology browse is split across **three entry points** (Omni Timeline, Life Log, Search) with **three different search implementations**. Users must know which surface to open.

### Recommendation: Search as primary navigation layer

**Yes — with constraints.**

Search should become the **entry point for finding**, not a separate silo:

1. **⌘K universal bar** at app level — grouped results (People, Moments, Patterns, Threads, Places, Timeline clusters) per `docs/search-v2.md`
2. **Life Timeline** (merged Omni + Life Log) becomes the **browse surface** — chronological, filterable
3. **Search resolves to timeline** — selecting a result opens the moment/arc in Life Timeline context, not a dead-end list
4. **Delete** Omni inline substring search tab — replace with link to ⌘K
5. **Demote** `/search` as standalone surface → embed search overlay accessible from every chronology view

Ideal layout:

```
Sidebar:
  Life Timeline    ← merged Omni + Life Log (one surface)
  Characters
  ...
  
⌘K → Universal Search overlay (grouped, lands in timeline on select)
```

---

## Phase 7 — KEEP / MERGE / DELETE summary

| Feature | Disposition |
|---|---|
| `resolved_events` + assembly | **KEEP** — merge into episodes/event nodes |
| `chronology_index` + V2 reads | **KEEP** — journal projection |
| Stitched timeline + calendar + user order | **KEEP** — canonical browse API |
| `life_arcs` + tracks | **KEEP** — merge into graph chapter/arc nodes |
| Episode segmentation | **KEEP** — becomes primary moment creator |
| Thread intelligence metadata | **KEEP** — container layer, not timeline store |
| Life Log + Omni Timeline UI | **MERGE** → single **Life Timeline** surface |
| Universal Search | **KEEP** — promote to ⌘K overlay |
| 9-layer timeline hierarchy UI | **DELETE** (unwired) — concepts → graph chapters |
| `timelines_v2` / `/api/timeline-v2` | **DELETE** |
| TimelinePage, OmniTimelinePanel, TimelineHierarchyPanel | **DELETE** |
| ColorCodedTimeline in Life Log (no props) | **DELETE or wire** to life_arcs |
| Life Saga screen | **MERGE** into Life Timeline Story mode |
| Omni inline search tab | **DELETE** |
| Duplicate TimelineSearch (`timeline-v2/`) | **DELETE** |
| Chronology V1 | **KEEP** — analysis worker only |
| Python chronology client | **DELETE or wire** |
| `character_timeline_events` table | **MERGE** → view over events + person edges |
| `event_candidates` | **KEEP** — Patterns layer |
| LifeArcPanel (broken route) | **FIX or DELETE** |
| `/api/life-arc/recent` | **WIRE or DELETE** |

---

## Appendix — Key file index

**Backend:** `services/chronology/`, `services/chronologyV2/`, `services/continuityRuntime/arcs/`, `services/eventCandidates/`, `services/conversationCentered/{eventAssemblyService,episodeSegmentationCore,characterTimelineBuilder,threadIntelligenceService}.ts`, `services/timelineManager.ts`, `services/timelinePageService.ts`, `services/timeline/universalSearchService.ts`

**Routes:** `routes/chronology.ts`, `routes/lifeArc.ts`, `routes/conversationCentered.ts`, `routes/timeline.ts`, `routes/timelineV2.ts`, `routes/timelineHierarchy.ts`, `routes/search.ts`

**UI:** `components/timeline/OmniTimeline.tsx`, `TimelineSwimlanes.tsx`, `TimelineStitchedView.tsx`, `TimelineCalendarView.tsx`, `TimelineStoryView.tsx`, `components/events/EventsBook.tsx`, `components/search/TimelineSearch.tsx`, `components/saga/SagaScreen.tsx`

**Docs:** `TEMPORAL_ARCHITECTURE.md`, `docs/graph-migration-plan.md`, `docs/autobiographical-memory-graph.md`, `docs/episode-experience.md`
