# Story Architecture Report

Status: Arc Reconstruction Readiness Audit — Phase 5.
Companions: [arc-readiness-report.md](arc-readiness-report.md), [arc-signal-inventory.md](arc-signal-inventory.md).

Goal: express **Episode → Arc → Chapter → Life Story** using **existing tables only — no new systems.** Every layer below already has a deployed table (except `episodes`, whose migration exists but is unapplied).

## The model on existing architecture

```
LIFE STORY      life_arcs (arc_type='life', parent_id=NULL)      ← one per user, the root
   └ CHAPTER       chapters (parent_id → life story)              ← broad life eras
why        └ ARC          life_arcs (arc_type='career'|…, parent_id → chapter)
                └ EPISODE      episodes (linked via arc_memberships)   ← the atomic unit
                     └ (events/entities/locations the episode already references)
```

Hierarchy is carried by `parent_id` (present on `life_arcs`, `chapters`, `timeline_arcs`) — no new linking system needed.

## Layer-by-layer mapping

### Episode — `episodes` (migration `20260616180000_episodes.sql`, **pending**)
Already the right atom: `source_thread_id`, `episode_index`, `title`, `start_at`/`end_at`, `boundary_reason`, and arrays `source_event_ids`, `participant_ids`, `location_ids`, `source_message_ids`. Produced live by `episodeSegmentationCore.segmentEpisodes()` via `episodePersistenceService`. **Only blocker: apply the migration + backfill.**

### Arc — `life_arcs` (canonical; richest schema)
Has exactly what an arc needs: `arc_type`, `parent_id` (hierarchy), `start_date`/`end_date`, `summary`, `confidence`, `source`, `tags`, `track`, `dominant_emotion`, `emotional_arc`, `stability_score`, `is_active`. An arc = a confidence-scored, typed grouping of episodes with an emotional shape. Founder arc_types map directly: `career`, `lorebook`/`creative`, `family`, `community`, `relationship` (see signal inventory).

### Chapter — `chapters`
`title`, `start_date`/`end_date`, `summary`, `parent_id`. A chapter = a time-bounded era grouping several arcs (e.g. "Bootcamp → Amazon" chapter spanning Career + Financial arcs).

### Life Story — `life_arcs` root row
A single `life_arcs` row with `arc_type='life'`, `parent_id=NULL`, summarizing the whole — chapters hang off it via `chapters.parent_id`. No separate table required.

### Membership — `arc_memberships`
Links arc → member with `importance_score` + `role` + `metadata`. This is how an arc references its episodes/events.

## The wiring gaps (additive, no new systems)

These are the *only* schema/wiring deltas — all additive to existing tables:

1. **`arc_memberships` only references `event_candidate_id`.** To make episodes the atomic unit, it must also reference episodes (and ideally `resolved_events`). → add nullable `episode_id` / `resolved_event_id` columns (or a polymorphic `member_type` + `member_id`). Without this, arcs cannot contain episodes — the core of the model.
2. **Two arc tables: `life_arcs` vs `timeline_arcs`.** Split-brain (same disease as the [classification audit](classification-audit.md)). → pick `life_arcs` as canonical; treat `timeline_arcs` as a read-projection for the timeline UI or deprecate. Don't generate into both.
3. **`chapters` vs arc hierarchy order.** The requested order is Chapter *above* Arc. `chapters.parent_id` → life story, and `life_arcs.parent_id` → chapter. Confirm the arc generator writes `parent_id` consistently in that direction (today nothing populates it — all arc tables are empty for the founder).

## Generation flow (when ready — described, not built)

```
1. SEGMENT  episodes already exist (post-migration) per thread
2. SEED     cluster episodes by shared org/person/location/theme
            → use organizations + continuity_events (425!) as seeds
3. ARC      create life_arcs row {arc_type, confidence, emotional_arc from episode emotions}
            link episodes via arc_memberships (importance_score = salience)
4. CHAPTER  group arcs by era → chapters (parent_id → life story)
5. STORY    summarize chapters into the root life_arcs('life') row
```

Confidence + provenance flow upward: an arc's `confidence` derives from its episodes' provenance density; a chapter's from its arcs'. **This is why `provenance_edges = 0` is a Phase-4 blocker** — without it, every arc's confidence is ungrounded.

## What this proves
The story model the brief asks for **already exists in the schema** — `episodes`, `life_arcs` (typed, hierarchical, emotional), `chapters`, `arc_memberships`. LoreBook does not need new story systems; it needs to (a) deploy the episodes table, (b) populate provenance, and (c) close three additive wiring gaps in `arc_memberships`/arc-table-choice/`parent_id`. After that, arc generation is an algorithm over existing tables, not new architecture.
