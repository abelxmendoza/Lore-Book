# Timeline Consolidation Roadmap

Date: 2026-06-15

Purpose: ranked execution plan to collapse LoreBook's chronology sprawl into **one timeline, one hierarchy, one source of truth**. **No Timeline Intelligence implementation in this sprint** — foundation only.

Related:
- `docs/timeline-audit.md` — full inventory
- `docs/chronology-hierarchy.md` — canonical hierarchy
- `docs/graph-migration-plan.md` — long-term graph migration
- `docs/episode-experience.md` — moment UX
- `docs/search-v2.md` — search consolidation

---

## North star

```
ONE surface:  Life Timeline (browse)
ONE unit:     Moment (episode / resolved_event)
ONE stream:   Stitched timeline API (moments + events → unified)
ONE container: Chapter/Arc (life_arcs → graph nodes)
ONE search:   ⌘K universal overlay (grouped results → lands in timeline)
ONE analysis: Chronology V1 (async, not browse)
```

Architecture must **shrink**. Every phase deletes or merges more than it adds.

---

## Current state snapshot

| Metric | Count |
|---|---|
| Active browse surfaces | 3 (Omni Timeline, Life Log, Life Saga) + Search |
| Timeline APIs | 6+ route groups |
| Hierarchy models | 5 competing |
| Duplicate calendar views | 2 |
| Duplicate stitched views | 2 |
| Broken UX paths | 3 (ColorCodedTimeline empty, LifeArcPanel route, timelines_v2) |
| Dead UI components | 10+ under `components/timeline/` |

---

## Phase map

| Phase | Name | Outcome |
|---|---|---|
| **P0** | Stop the bleeding | Fix Mixed swimlanes, broken paths, terminology |
| **P1** | Surface merge | One Life Timeline UI over existing APIs |
| **P2** | API merge | One stitched stream; episode wiring |
| **P3** | Storage merge | Graph migration stages 1–4 |
| **P4** | Timeline Intelligence | Smart ranking, gaps, turning points (future sprint) |

---

## P0 — Trust + clarity (weeks 1–2)

**Goal:** Users aren't confused; swimlanes aren't all Mixed; nothing broken in primary paths.

| # | Task | Files / systems | Effort | Impact |
|---|---|---|---|---|
| P0-1 | **Fix swimlane Mixed flood** — primary-track scoring; dayOccasion default `inner` not `mixed`; expand lexicons | `arcInferenceService.ts`, `dayOccasionService.ts` | M | High |
| P0-2 | **Backfill arc tracks** — re-run inferTrack on existing life_arcs | Script + `life_arcs` | M | High |
| P0-3 | **Life Log terminology** (done) — Moments / Calendar / Patterns | `EventsBook.tsx` | S | High |
| P0-4 | **Remove or wire ColorCodedTimeline in Life Log** — either pass life_arcs + events or remove Timeline sub-layout | `EventsBook.tsx`, `ColorCodedTimeline.tsx` | S | Medium |
| P0-5 | **Delete or fix broken routes** — `/api/timeline-v2`, `/api/life-arc/recent` | `routes/timelineV2.ts`, `lifeArcService.ts`, `LifeArcPanel.tsx` | S | Medium |
| P0-6 | **Document canonical vocabulary** in UI empty states | Life Timeline surfaces | S | Medium |
| P0-7 | **Hide empty Mixed swimlane row** when count = 0 | `TimelineSwimlanes.tsx` | S | Low |

**Exit criteria:**
- <30% of arcs in `mixed` track (measure via diagnostic query)
- No empty timeline layout in Life Log
- Zero 404s from primary sidebar surfaces

---

## P1 — Surface consolidation (weeks 3–5)

**Goal:** One **Life Timeline** replaces Omni Timeline + Life Log as separate sidebar items.

| # | Task | Effort | Impact |
|---|---|---|---|
| P1-1 | **Design Life Timeline shell** — modes: Browse (stitched), Swimlanes, Calendar, Story, Patterns | L | High |
| P1-2 | **Merge sidebar entries** — "Life Timeline" replaces "Timeline" + "Life Log" | S | High |
| P1-3 | **Redirect routes** — `/timeline`, `/events`, `/memories` → `/life` | S | Medium |
| P1-4 | **Unify calendar** — one calendar component, one API hook | M | High |
| P1-5 | **Unify stitched browse** — one TimelineStitchedView config | M | High |
| P1-6 | **Merge SagaScreen into Story mode** — delete standalone `/saga` or redirect | M | Medium |
| P1-7 | **Promote ⌘K search overlay** — embed from all timeline modes; deprecate Omni search tab | M | High |
| P1-8 | **Canonical filter bar** — shared filters per timeline-audit Phase 5 model | L | High |
| P1-9 | **Delete legacy timeline components** not imported anywhere | M | Medium |

**Components to DELETE after merge:**
- `OmniTimelinePanel.tsx`
- `TimelinePage.tsx`, `TimelinePageV2.tsx`
- `TimelineV2.tsx`, `MemoryTimeline.tsx`
- `components/timeline-v2/TimelineSearch.tsx` (keep `search/TimelineSearch.tsx`)
- Duplicate search tab in OmniTimeline

**Exit criteria:**
- One sidebar item for chronology browse
- Calendar and stitched views identical regardless of entry route
- User never asks "Life Log vs Timeline?"

---

## P2 — API + moment layer (weeks 6–9)

**Goal:** One read API; episodes become the primary moment unit.

| # | Task | Effort | Impact |
|---|---|---|---|
| P2-1 | **Unify stitched kinds** — merge `moment` + `event` → single `moment` kind with `depth: basic\|deep` | M | High |
| P2-2 | **Expose episodes API** — persist + list episodes per thread | M | High |
| P2-3 | **Wire episode cards into Life Timeline browse** | M | High |
| P2-4 | **Thread moments rail** in chat + thread filter on timeline | M | High |
| P2-5 | **Fact → moment provenance** — every fact links to parent moment in API | M | High |
| P2-6 | **Consolidate search** — `/api/search/universal` returns Search V2 groups (people, moments, patterns, threads) | L | High |
| P2-7 | **Merge character_timeline_events read path** → filtered stitched query | M | Medium |
| P2-8 | **Track reassignment API** — user override for life_arcs.track | S | Medium |

**Exit criteria:**
- Stitched API returns unified moments with evidence counts
- Episodes visible in timeline within 1 release of segmentation landing
- Search returns grouped results landing in timeline

---

## P3 — Storage consolidation (weeks 10–16, aligns with graph migration)

**Goal:** Shrink tables and services per `graph-migration-plan.md`.

| # | Task | Effort | Impact |
|---|---|---|---|
| P3-1 | Stand up `nodes`, `edges`, `episodes` + dual-write | L | High |
| P3-2 | Backfill episodes from journal + chat history | L | High |
| P3-3 | Cut Life Timeline reads to graph (flagged) | L | High |
| P3-4 | DELETE `character_timeline_events`, `timelines_v2` | M | Medium |
| P3-5 | MERGE 9-layer hierarchy into life_arcs/chapters | L | Medium |
| P3-6 | DELETE duplicate recall/timeline routers | M | High |
| P3-7 | Chronology V1 → consolidation worker (not browse) | M | Medium |

**Exit criteria:**
- Graph-backed timeline matches legacy output on golden test set
- At least 3 legacy tables deleted
- Codebase line count decreases

---

## P4 — Timeline Intelligence (future sprint — NOT this sprint)

Prerequisites: P0–P2 complete.

| Capability | Depends on |
|---|---|
| Turning point detection | Graph arcs + significance scores |
| Gap narration ("nothing recorded Mar–May") | Chronology V1 gaps + chapter spans |
| "On this day" resurface | Unified moment index |
| Cross-thread moment linking | Episode graph |
| Life phase auto-proposal | Consolidation worker |
| Timeline-aware chat recall | Working Memory Assembler + unified index |

---

## Deletion plan (cumulative)

### DELETE (no replacement — redundant)

| Item | When |
|---|---|
| `/api/timeline-v2`, `timelines_v2` | P0 |
| `OmniTimelinePanel`, `TimelinePage`, `TimelinePageV2` | P1 |
| Omni inline search tab | P1 |
| `components/timeline-v2/TimelineSearch.tsx` | P1 |
| Standalone SagaScreen route (merged to Story mode) | P1 |
| Python chronology discarded output path | P0 or P3 |
| `character_timeline_events` table | P3 |
| 4 Sprint AM reconstruction services (separate track) | P3 |
| `ChronologyView` (unwired) | P1 |

### MERGE (into canonical system)

| Item | Into |
|---|---|
| Omni Timeline + Life Log | **Life Timeline** surface |
| Stitched `moment` + `event` kinds | **Moment** with depth |
| 9-layer saga/arc | **life_arcs** / graph chapter nodes |
| Universal Search surface | **⌘K overlay** |
| LifeArcPanel | Thread intelligence + recent moments |
| ColorCodedTimeline (memoir) | Chapter view inside MemoirEditor only |
| character_timeline_events reads | Filtered stitched API |
| event_candidates UI | **Patterns** mode in Life Timeline |

### KEEP (canonical)

| Item | Role |
|---|---|
| `resolved_events` (+ meaning layers) | Deep moment substrate until graph cutover |
| `chronology_index` | Journal read cache |
| Stitched + calendar + order APIs | **Timeline source of truth** (read path) |
| `life_arcs` + tracks | Chapter/arc containers + swimlanes |
| `event_candidates` | Patterns |
| `episodeSegmentationCore` | Moment creation |
| Chronology V1 | Async analysis |
| `user_chronology_order` | User preference |
| Universal search service | Search index (expanded) |
| Working Memory Assembler | Chat retrieval |

---

## Migration path (user-visible)

```
Today                          P1                           P2                          P3
─────────────────────────────────────────────────────────────────────────────────────────
Sidebar:                       Sidebar:                     Sidebar:                    Sidebar:
  Life Log                       Life Timeline                Life Timeline               Life Timeline
  Timeline                       (merged)                     + episode cards             (graph-backed)
  Life Saga
  Search

Browse:                        Browse:                      Browse:
  resolved_events                stitched stream              unified moments
  chronology_index               + swimlanes                  + episodes
  (duplicate calendars)          + patterns                   + facts linked
                                                               + ⌘K search

Swimlanes:                     Swimlanes:
  mostly Mixed                   fixed track inference          user override
```

**No big-bang migration.** Each phase ships standalone value. Flags guard graph read cutover.

---

## Ranked priority matrix

| ID | Task | Priority | Trust | User impact | Effort | Deletes code? |
|---|---|---|---|---|---|---|
| P0-1 | Fix Mixed swimlane inference | **P0** | Medium | High | M | No |
| P0-3 | Life Log terminology | **P0** | High | High | S | No |
| P0-4 | Fix empty ColorCodedTimeline | **P0** | High | Medium | S | Possible |
| P0-5 | Fix broken API routes | **P0** | High | Medium | S | Possible |
| P1-2 | Merge sidebar to Life Timeline | **P1** | Medium | **Very high** | S | Yes |
| P1-4 | Unify calendar | **P1** | Medium | High | M | Yes |
| P1-5 | Unify stitched browse | **P1** | Medium | High | M | Yes |
| P1-7 | ⌘K search overlay | **P1** | Medium | High | M | Yes |
| P1-8 | Canonical filter bar | **P1** | Low | High | L | No |
| P2-1 | Unify stitched moment kind | **P2** | Medium | High | M | Yes |
| P2-2 | Episodes API + cards | **P2** | High | **Very high** | M | No |
| P2-6 | Search V2 API | **P2** | Medium | High | L | Yes |
| P3-1 | Graph dual-write | **P3** | High | Low (invisible) | L | No |
| P3-4 | Delete legacy tables | **P3** | Medium | Low | M | **Yes** |

---

## Diagnostic queries (run before/after P0-1)

```sql
-- Arc track distribution (should not be >50% mixed after fix)
SELECT track, COUNT(*) FROM life_arcs GROUP BY track ORDER BY COUNT DESC;

-- Orphan facts without event links (coverage gap)
-- See memoryCoverageAudit endpoint

-- Duplicate calendar data sources (manual check)
-- Compare /api/chronology/calendar vs EventsBook local merge counts for same month
```

---

## Risks

| Risk | Mitigation |
|---|---|
| Merging Omni + Life Log regressions | Golden snapshot tests on stitched output before sidebar merge |
| Episode segmentation not ready blocks P2-3 | Ship P1 surface merge without episode cards; wire when ready |
| Graph migration delays P3 | P1–P2 deliver 80% of user value without graph |
| MemoirEditor depends on 9-layer hierarchy | Keep hierarchy for memoir only; don't expose globally |
| Users attached to "Life Saga" name | Redirect + "Story mode" label |

---

## Success criteria (this audit sprint)

- [x] `docs/timeline-audit.md` — full inventory
- [x] `docs/chronology-hierarchy.md` — one proposed hierarchy
- [x] `docs/timeline-consolidation-roadmap.md` — ranked plan
- [ ] One canonical chronology model — **documented** (implementation in P1–P3)
- [ ] One timeline source of truth — **stitched API designated** (merge in P2-1)
- [ ] Clear deletion plan — **above**
- [ ] Reduced complexity — **begins P0, measurable at P1 merge**

---

## Immediate next steps (when implementation resumes)

1. **P0-1** — Fix `inferTrack` in `arcInferenceService.ts` + `dayOccasionService.ts`
2. **P0-4** — Remove broken Timeline sub-layout from Life Log OR wire to stitched API
3. **P1-2** — Sidebar merge design mock (Life Timeline replaces two items)
4. **Do not start Timeline Intelligence** until P1 surface merge ships

---

## Relationship to other sprints

| Sprint | Relationship |
|---|---|
| Episode UX / productization | P2-2, P2-3 — moment cards in Life Timeline |
| Thread intelligence | P2-4 — thread filter + moments rail |
| Working Memory Assembler | P4 — timeline-aware recall uses unified index |
| Graph migration | P3 — storage consolidation |
| Search V2 | P1-7, P2-6 — search overlay + API |

This roadmap intentionally **sequences consolidation before intelligence**. Smarter timeline features on fragmented data multiply the confusion.
