# Timeline Audit — Independent Principal Engineer Review

Date: 2026-06-15
Reviewer role: Principal Engineer / Systems Architect (verification, **not** implementation)
Subject: `docs/timeline-audit.md`, `docs/chronology-hierarchy.md`, `docs/timeline-consolidation-roadmap.md` (Cursor Composer 2.5)
Method: every major claim re-checked against the actual codebase. **Code over documents.**

---

## TL;DR

The Composer audit is **mostly accurate and unusually well-grounded** — the Phase 4 root-cause analysis is correct to the line, the dead-code/DELETE list is largely provable, and the consolidation thesis (3 browse surfaces + buried search → one Life Timeline) is real.

But it contains **one load-bearing factual error** that undermines its own target architecture:

> **`episodeSegmentationCore` is dead code — zero importers — not "backend active."**

The entire proposed hierarchy ("Episode = primary moment unit") and the P2/P3 plan rest on a substrate that **does not run today**. Same for `entityResolutionCore` (also zero importers). The audit treats both as live. They are not.

Two smaller misses: `chronology_snapshots` is upserted in code but **has no migration**; and a couple of component paths in the inventory are wrong.

**Verdict: trust the audit's diagnosis and P0. Do not trust its readiness assumptions for episodes/graph.**

---

## Phase 1 — Audit the audit (claim / evidence / verdict)

| # | Claim | Evidence (code) | Verdict |
|---|---|---|---|
| 1 | Mixed flood root cause: `if (signals > 1) return 'mixed'` | [arcInferenceService.ts:97-98](apps/server/src/services/continuityRuntime/arcs/arcInferenceService.ts#L97) — verbatim | **PROVEN** |
| 2 | dayOccasion `inferTrack` defaults to `mixed` after narrow regexes | [dayOccasionService.ts:101-112](apps/server/src/services/continuityRuntime/arcs/dayOccasionService.ts#L101) — only relationships/career/creative, else `return 'mixed'` | **PROVEN** |
| 3 | `useLifeArcs` maps null track → `inner` | [useLifeArcs.ts:131](apps/web/src/hooks/useLifeArcs.ts#L131) `arc.track ?? 'inner'` | **PROVEN** |
| 4 | Swimlanes render a fixed `mixed` lane | [TimelineSwimlanes.tsx:40](apps/web/src/components/timeline/TimelineSwimlanes.tsx#L40) `TRACK_ORDER = [...,'mixed']` | **PROVEN** |
| 5 | ColorCodedTimeline in Life Log gets no data | [EventsBook.tsx:1232](apps/web/src/components/events/EventsBook.tsx#L1232) `<ColorCodedTimeline />` — no props | **PROVEN** |
| 6 | `timelines_v2` has no migration → broken | No `CREATE TABLE timelines_v2` in any `.sql`; referenced by [services/timelineV2.ts](apps/server/src/services/timelineV2.ts); route mounted at `/api/timeline-v2` ([routeRegistry.ts:474](apps/server/src/routes/routeRegistry.ts#L474)) | **PROVEN — DELETE justified** |
| 7 | `/api/life-arc/recent` missing → LifeArcPanel broken | Frontend [useLifeArc.ts:77](apps/web/src/hooks/useLifeArc.ts#L77) calls `/api/life-arc/recent`; server mounts only `/api/life-arcs` (plural, [routeRegistry.ts:524](apps/server/src/routes/routeRegistry.ts#L524)), no `/recent` handler → 404 | **PROVEN** |
| 8 | `OmniTimelinePanel`, `TimelinePage`, `ChronologyView` are dead | All exist; **0 importers** each (grep) | **PROVEN — DELETE justified** |
| 9 | 3 live browse surfaces + buried search | [pages/App.tsx](apps/web/src/pages/App.tsx): OmniTimeline (313), EventsBook (342), SagaScreen (398), TimelineSearch (197) all rendered | **PROVEN** |
| 10 | `episodeSegmentationCore` is "backend active" | **0 importers** of `episodeSegmentationCore`/`segmentEpisodes` anywhere | **INCORRECT — it is dead code** |
| 11 | `chronology_snapshots` is an "active cache" | Code upserts it ([chronology/storageService.ts:110](apps/server/src/services/chronology/storageService.ts#L110)) but **no migration exists** | **PARTIALLY TRUE / UNVERIFIED** |
| 12 | Universal search via `/api/search/universal` | [routes/search.ts:23](apps/server/src/routes/search.ts#L23) `POST /universal` → `UniversalSearchService` | **PROVEN** |

---

## Phase 2 — Independent codebase reality check

Built without reference to the audit, then compared.

**Tables that actually exist (migrations found):** `resolved_events`, `chronology_index`, `timelines`, `timeline_memberships`, `life_arcs`, `arc_memberships`, `arc_relationships`, `character_timeline_events`, `event_candidates`, `timeline_mythos…timeline_microactions` (+`timeline_scenes`), `chapters`, `user_chronology_order`, `timeline_events` (task-linked).
**Referenced in code but NO migration:** `timelines_v2` (broken), `chronology_snapshots` (V1 snapshot persistence — provenance unknown).

**Backend services (live vs dead):**
- LIVE: `arcInferenceService`, `dayOccasionService` (imported by ingestion pipeline, enrichmentJob, chronology route, arcStabilityService — so the Mixed flood is genuinely reachable), `eventAssemblyService`/`resolved_events` writers, `chronology/*`, `universalSearchService` + `timelineEngine`, `lifeArcService`.
- **DEAD (zero importers): `episodeSegmentationCore`, `entityResolutionCore`.** Both were added in commit `ad9fd1d` ("two consolidating cores + plan") and never wired.

**UI surfaces (routed):** OmniTimeline `/timeline`, EventsBook `/events`, SagaScreen `/saga`, TimelineSearch `/search` — all live. Dead/unwired: `OmniTimelinePanel`, `TimelinePage`, `ChronologyView` (0 importers); `TimelineHierarchyPanel` (1 importer, memoir-adjacent).

**My independent conclusion matches the audit's sprawl thesis** — with the critical correction that the *episodic substrate the plan depends on is not running*.

---

## Phase 3 — Composer vs reality (discrepancies)

**What Composer got right:** Phase 4 root cause (exact), the dead-component DELETE list, `timelines_v2` and `/api/life-arc/recent` as broken, the duplicate-browse-surface premise, search being buried, the table inventory (~90% correct).

**What Composer got wrong:**
- `episodeSegmentationCore` labelled "Backend active" and drawn as a live step in the data-flow diagram — it is **dead code**. (Repeated in the hierarchy doc and roadmap, which "KEEP — Moment creation" without noting it never runs.)
- `chronology_snapshots` labelled "Active cache" — **no migration**; persistence may be silently failing.
- Component paths: `ChronologyView` is under `components/chronology/`, `TimelineHierarchyPanel` under `components/timeline-hierarchy/` — not `components/timeline/` as listed.

**What Composer missed:**
- `entityResolutionCore` is also dead — relevant because the target flow shows `episode → entity resolution` as if active.
- The `chronology_snapshots` migration gap.
- That thread intelligence was wired only on 2026-06-15 (same day); `threadMeta` now populates from the ingestion pipeline and feeds chat continuity — slightly ahead of the doc's "weak UX" framing, but episode linkage still pending.

**What changed since the audit:** essentially nothing in timeline code (audit is hours old). The thread-intelligence activation is adjacent, not timeline-core.

---

## Phase 4 — Swimlane root cause: verified end to end

Traced classification → storage → retrieval → rendering:

1. **Classify:** `arcInferenceService.inferTrack` — any 2 domains → `mixed` ([:97-98](apps/server/src/services/continuityRuntime/arcs/arcInferenceService.ts#L97)); zero-signal life_era/custom → `inner` ([:103]). `dayOccasionService.inferTrack` — anything outside 3 regexes → `mixed` ([:112](apps/server/src/services/continuityRuntime/arcs/dayOccasionService.ts#L112)).
2. **Store:** `life_arcs.track`.
3. **Retrieve:** `useLifeArcs` → `arcsByTrack`, null → `inner` ([:131](apps/web/src/hooks/useLifeArcs.ts#L131)).
4. **Render:** `TimelineSwimlanes` fixed `TRACK_ORDER` incl. `mixed`; memory dots use `entryTrack()`.

**Is `life_arcs.track = mixed` truly why everything lands in Mixed? Yes — and there are two distinct causes, not one:**
- **(a)** Multi-domain → `mixed` (binary `signals > 1`). Real life spans domains, so most multi-activity arcs collapse to mixed. *Primary cause for inferred era/custom arcs.*
- **(b)** `dayOccasionService` **defaults** to `mixed` (no health/inner lexicon). *Primary cause for occasion arcs* — and a different code path than (a), which the audit correctly separates.

Additional contributing causes the audit names and I confirm: sparse `recurring_activities`/`dominant_entity_names` signal, no user override path, dot-vs-bar track inconsistency. **Composer's Phase 4 is the strongest part of the audit — accept it.**

---

## Phase 5 — Hierarchy review (would it survive 2 years?)

Proposed: `Life → Life Period → Chapter → Arc → Theme → Moment → Fact` (episodic beats narrative; one browse unit = Moment).

**Architecturally sound and 2-year-durable in shape** — it matches `life-graph-ontology.md` / `autobiographical-memory-graph.md`, and "narrative is derived from episodic evidence" (Rule 1) is the right invariant.

**But it is not buildable as written today**, because the declared canonical unit (`episodes`) is dead code with no table and no UX. **The honest canonical unit right now is `resolved_events`.** Recommendation: keep the *target* hierarchy, but stage it — `resolved_events` is the moment substrate **until** `episodeSegmentationCore` is wired + backfilled, at which point episodes supersede. Declaring episodes canonical before they run will produce empty browse surfaces. Everything else (Moment = episode-or-event-with-depth, Facts inside moments, Tracks as projections, Threads as containers) is reasonable and should be adopted as vocabulary now.

---

## Phase 6 — KEEP / MERGE / DELETE review (proven, not assumed)

| Disposition | Verdict |
|---|---|
| DELETE `timelines_v2` / `/api/timeline-v2` | **Confirmed** — no migration, broken |
| DELETE `OmniTimelinePanel`, `TimelinePage`, `ChronologyView` | **Confirmed** — 0 importers |
| DELETE Omni inline search tab | Reasonable (substring-only) — verify no deep-link before removal |
| KEEP `resolved_events`, `chronology_index`, stitched/calendar/order APIs, `event_candidates`, `life_arcs` | **Confirmed** — all live, migration-backed |
| KEEP `episodeSegmentationCore` "Moment creation" | **Reframe: WIRE then keep.** It is currently dead — keeping it as-is keeps dead code |
| MERGE Omni + Life Log → Life Timeline | Premise valid; **sequence after P0 + substrate truth** |
| MERGE SagaScreen → Story mode | Reasonable (live, redundant with Story view) |
| MERGE `character_timeline_events` → view | Defer to P3 — it's a real migration-backed projection table, not free |
| "Active cache" `chronology_snapshots` | **Re-verify table exists** before relying on it |

No deletion in the list is *wrong*; the risk is **sequencing** (below), not correctness.

---

## Phase 7 — Search UX review

Confirmed three search implementations: Universal (`/api/search/universal`, best grouping, buried at `/search`), Omni inline (client substring), Life Log MemoryExplorer (facts). `⌘K` already navigates to `/search` ([App.tsx:150](apps/web/src/pages/App.tsx#L150)).

Promoting `⌘K` to a grouped overlay **would** improve usability and simplify navigation — the backend grouping already exists. **One caveat:** the recommendation that results "land in the Life Timeline" presupposes a surface that doesn't exist yet. Ship the overlay landing in *current* surfaces first; rewire to Life Timeline when it lands. Don't block the search win on the surface merge.

---

## Phase 8 — Principal Engineer feedback

### 1. What Composer got right
Phase 4 root cause (line-exact), the dead-code DELETE list, the two proven broken paths (`timelines_v2`, `/api/life-arc/recent`), the empty `ColorCodedTimeline`, the sprawl thesis, ~90% of the table inventory, and the strategic instinct to **sequence consolidation before intelligence**.

### 2. What Composer got wrong
`episodeSegmentationCore` is **dead, not active** — the single most consequential error, because the target hierarchy and P2/P3 depend on it. `chronology_snapshots` is **not a verified active cache** (no migration). Minor component-path inaccuracies.

### 3. What Composer missed
`entityResolutionCore` is also dead; the `chronology_snapshots` migration gap; and that the audit's own "Target flow" diagram chains two dead cores as if live.

### 4. Highest-risk recommendations
- **Declaring episodes the canonical moment unit (hierarchy Rule 1, roadmap P2-2/P2-3) while the segmenter is dead code.** Building UX/graph on a non-running substrate.
- **P3 graph dual-write (`nodes`/`edges`/`episodes`)** — large, and depends on the dead cores.
- **P1 surface merge before substrate truth** — risks fusing two partly-broken surfaces into one larger surface.

### 5. Recommendations I strongly agree with
- **P0-1** Mixed swimlane fix (proven root cause, low risk, high trust payoff).
- Delete `timelines_v2` + the 3 zero-importer panels (proven dead).
- Fix `/api/life-arc/recent` 404 and the empty `ColorCodedTimeline` (proven broken).
- Consolidate search entry to a grouped `⌘K` overlay (backend already supports it).

### 6. Recommendations I would reject / defer
- "KEEP `episodeSegmentationCore` as Moment creation" → **change to "wire it first."**
- Surface merge (P1) **before** P0 + wiring the two dead cores.
- Relying on `chronology_snapshots` as a cache → **verify the table exists first.**
- Aggressive P3 table deletes (`character_timeline_events`) until graph parity is proven on a golden set.

### 7. What should actually happen next (my sequencing)
1. **P0-1** Mixed fix: primary-track scoring; `dayOccasionService` default `inner` (or dominant `event.type`); expand lexicons; add `track_source` + override. *Verified-safe, highest trust ROI.*
2. **Wire the two dead cores** (`episodeSegmentationCore`, `entityResolutionCore`) **before** any hierarchy/graph work — the whole plan is theoretical until they run. (`ThreadTurn.episodeId` is already plumbed for the episode fold.)
3. **Resolve `chronology_snapshots`** — add the missing migration or remove the upsert path.
4. Fix the two proven broken UX paths (`/api/life-arc/recent`, empty `ColorCodedTimeline`).
5. **Then** P1 surface merge and the `⌘K` overlay, on a substrate that is finally real.

---

## Verdict

Composer delivered a genuinely strong audit — accept its diagnosis, its P0, and its deletion list. **Reject its implicit premise that the episodic/graph substrate is ready.** It is not: `episodeSegmentationCore` and `entityResolutionCore` are dead code. Fix Mixed, wire the cores, verify `chronology_snapshots`, then consolidate surfaces. Consolidating onto a substrate that doesn't run would multiply the very sprawl this sprint set out to remove.
