# Arc Reconstruction Readiness Report

Status: Arc Reconstruction Readiness Audit. **Verdict: NOT READY** — pipelines are wired, but the persistence + provenance layer has hard blockers. Evidence below is from the live cloud DB (founder account `789bd607…`), not inference.

Companions: [arc-signal-inventory.md](arc-signal-inventory.md), [story-architecture-report.md](story-architecture-report.md).

## Verdict in one line

The **code path is live** (episodes/entities/relationships/events/threads all run on ingestion), but the **episodes table is not deployed, provenance is empty, and storage is split-brain** — so arcs built today would be thin, unexplainable, and read from the wrong tables. Three fixes unblock it; none require building arcs.

## Premise check (the audit's first job)

The brief asserts five systems are "active." Verified against code **and** data:

| System | Code wired live? | Producing data for founder? | Evidence |
| --- | --- | --- | --- |
| Entity resolution | ✅ | ✅ 97 omega + 52 people_places | `ingestionPipelineClass` calls `resolveAmbiguousEntity`/`entityRegistry`; `entityResolutionCore` still shadow (scattered resolvers do the live work) |
| Relationship recovery | ✅ (Integration Sprint) | ⚠️ 21 character + 4 romantic, **0 omega_relationships** | `graphRecoveryTrigger.schedule()` @ `ingestionPipelineClass.ts:165` → `relationshipFoundationService` |
| Event recovery | ✅ | ⚠️ 30 resolved_events + 7 candidates, **0 event_records** | same trigger → `eventRecoveryService` |
| Episodes | ✅ code | ❌ **0 — table missing** | `episodeSegmentationTrigger.schedule()` @ line 166 → `episodePersistenceService` → `.from('episodes').insert()` into a table that **does not exist** |
| Thread intelligence | ✅ | ✅ | `threadIntelligenceService` invoked from episode trigger + ingestion |

So the premise is **mostly true at the code layer and partly false at the data layer.** (This also corrects earlier audits: `episodeSegmentationCore` is **not** dead — it's imported by `episodePersistenceService` and live-triggered; it just can't persist.)

## Phase 1 — Data flow audit (Messages → Entities → Relationships → Events → Episodes)

Founder counts (live DB):

| Stage | Table(s) | Count | Read |
| --- | --- | --- | --- |
| Messages | `chat_messages` / `conversation_messages` | **102 / 11** | ⚠️ only ~11% of chat reached the conversation-centered pipeline that yields episodes/events |
| Entities | `omega_entities` / `people_places` | **97 / 52** | ✅ healthy, but dual-store (see split-brain) |
| Relationships | `character_relationships` / `romantic_relationships` / `omega_relationships` | **21 / 4 / 0** | ⚠️ live data in character_*, the omega mirror is empty |
| Events | `resolved_events` / `event_candidates` / `event_records` | **30 / 7 / 0** | ⚠️ live data in resolved_events, event_records empty |
| Episodes | `episodes` | **MISSING TABLE** | ❌ blocker |
| Provenance | `provenance_edges` | **0** | ❌ no lineage for any node |

**Coverage:** entities good; events/relationships modest but real; episodes zero. **Completeness:** the message→episode tail is broken (no episodes). **Provenance:** absent — every node is currently unattributable, which defeats *trustable* arcs.

## Phase 4 — Gap analysis (what must be true before arcs can be trusted)

### P0 — Blockers (arcs are impossible or untrustworthy without these)
1. **`episodes` table not deployed.** Migration `supabase/migrations/20260616180000_episodes.sql` exists (written 2026-06-16) but is **unapplied** — classic schema drift (see git: "Fix production schema drift"). Episode segmentation runs every turn and the insert silently fails (non-blocking catch). **Episodes are the atomic unit of an arc; with zero episodes there is nothing to group.** → *Apply the migration; backfill via `persistEpisodesForThread` over existing threads.*
2. **`provenance_edges = 0`.** Episodes are documented as persisted "with full provenance," but none exists for the founder. Without lineage, an arc cannot answer "why is this in my Career arc?" → arcs would be assertions, not evidence. → *Verify `provenanceEdgeService` writes on the live path; backfill.*

### P1 — Trust/quality gaps
3. **Split-brain storage.** `resolved_events`(30) vs `event_records`(0); `character_relationships`(21) vs `omega_relationships`(0); `omega_entities`(97) vs `people_places`(52). An arc generator must read the **populated** tables, and the dual-write drift must be reconciled or it will read empty mirrors. (Ties to the [classification sprint](classification-audit.md) vocabulary-fragmentation finding.)
4. **Ingestion coverage:** `conversation_messages`(11) ≪ `chat_messages`(102). Most history never flowed through the pipeline that produces episodes/events. → backfill ingestion before trusting arc completeness.
5. **Missing signal tables:** `goals`, `values`, `projects` are **MISSING** (goal migrations also unapplied). Goal/value/project arcs have no structured source today (see signal inventory).

### P2 — Noise (will pollute arcs if unaddressed)
6. **Classification noise** in the entity store: `Magic: The Gathering` typed `ORG`, `went for a run`/`job offer last week` typed `EVENT`-entities, four `Captured Conversation` event titles. Arc grouping inherits this noise → apply the classification-sprint confidence gates first.

## What IS ready
- A **rich, real life graph**: 97 entities, 25 relationships, 30 events, 6 orgs, 6 locations, 14 skills, **425 continuity_events** (strong thematic signal).
- **Arc infrastructure already exists**: `life_arcs`, `timeline_arcs`, `arc_memberships`, `arc_relationships`, `chapters` tables are deployed — the story model (Phase 5) can be built on existing architecture with **no new systems**.

## Readiness scorecard

| Dimension | State | Score |
| --- | --- | --- |
| Pipelines wired (code) | live | 9/10 |
| Entity coverage | good | 7/10 |
| Relationship/event coverage | modest, split-brain | 5/10 |
| **Episode coverage** | **zero (table missing)** | **0/10** |
| **Provenance** | **empty** | **0/10** |
| Signal richness | strong | 8/10 |
| Arc schema readiness | exists | 8/10 |
| **Overall arc-readiness** | **NOT READY** | **~4/10** |

## The shortest path to READY (no arc-building)
1. Apply `20260616180000_episodes.sql` (+ goal/value/project migrations); resolve schema drift.
2. Backfill episodes + provenance over existing threads (`persistEpisodesForThread` per thread).
3. Point the (future) arc reader at the populated tables: `resolved_events`, `character_relationships`, `omega_entities`, `continuity_events`.
4. Re-run this audit: target ≥1 episode per multi-turn thread and `provenance_edges > 0` before generating a single arc.
