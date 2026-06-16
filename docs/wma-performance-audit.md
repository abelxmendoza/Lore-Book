# Working Memory Assembler — Performance Audit & Optimization Plan

Date: 2026-06-16 · Plan only. `workingMemoryAssembler.ts` (772 LOC) runs on the **chat retrieval path, once per user message** — so its cost multiplies by total message volume.

## Phase 2 — Query map

`assembleWorkingMemory()` issues queries in **3 sequential stages**, each a `Promise.all` batch:

| Stage | Function | Queries | Filtered? |
|---|---|---|---|
| 1 | `resolveTargetEntities` | **5** — `characters`, `locations`, `organizations`, `people_places`, `projects` | ⚠️ `characters` + `people_places` have **NO filter** (full-table scan); locations/orgs/projects use `ilike(name, target)` |
| 2 | `loadPersonCandidates` *(primary entity only, conditional)* | **5** — `character_memories`, `character_timeline_events`, `character_relationships`, `entity_facts`, `characters` | ✅ filtered by entity id |
| 2-alt | `loadProtagonistRelationshipCandidates` *("who lives with me")* | 2 — `characters`, `character_relationships` | ✅ |
| 3 | `loadTextualCandidates` | **6** — `journal_entries`, `chat_messages`×2, `character_timeline_events`×2, `projects`, `narrative_accounts` | ✅ target/thread filtered |

**Per-message query count:** worst case **16** (5 + 5 + 6), best case **11** (5 + 0 + 6). 3 network round-trips (one per stage).

**The real problem is not count — it's two unbounded scans.** `loadPersonCandidates` is NOT looped over all entities (only the primary), so there is **no per-entity N+1**. But `resolveTargetEntities` reads **every character and every people_places row for the user, on every message**, regardless of the target. For a user with 500 entities that's a 1000-row scan per message; it grows with the user's history.

## Phase 2 — Query volume projection

Assume ~50 messages/user/day, ~14 queries/message average.

| Scale | Queries/day | Notes |
|---|---|---|
| **current, 100 users** | ~70k/day | + 2 full-table scans/message growing with each user's entity count |
| **1,000 users** | ~700k/day | the unfiltered `characters`/`people_places` scans dominate cost as histories grow |
| **10,000 users** | ~7M/day | full scans × message volume = the wall; connection-pool + egress pressure |

The danger isn't 14 queries/message (fine) — it's that **2 of them are O(user's entity count)** and run every message. A power user with thousands of entities makes every one of their messages expensive.

## Phase 3 — Optimization plan (target: >50% query reduction + remove scans)

| # | Optimization | Effect |
|---|---|---|
| 1 | **Filter `characters` + `people_places` by `target`** (ilike/trigram) like locations/orgs/projects already do; skip entirely when `target` is null | Turns 2 full-table scans into indexed lookups (or zero queries). **Biggest win.** |
| 2 | **Run stage 1 (`resolveTargetEntities`) and stage 3 (`loadTextualCandidates`) in parallel** — stage 3 doesn't depend on resolved entities | 3 round-trips → 2 |
| 3 | **Request-memoize the entity roster** — when `target` is null and we must load the roster, cache it per `(userId, thread)` for the turn (and short TTL across turns in a thread) | Removes repeat roster loads within a conversation |
| 4 | **Consolidate the 2 `chat_messages` and 2 `character_timeline_events` queries** in `loadTextualCandidates` into one each with an `OR`/`IN` clause | 6 → 4 in stage 3 |
| 5 | **Index recommendations** | ensure `characters(user_id)` + trigram on `characters.name`/`people_places.name` for the new `ilike` filters; confirm `entity_facts(entity_id)`, `character_memories(character_id)` indexed for stage 2 |

**Projected per-message queries:** 16 → **~6–8** (filter + consolidate + parallelize), and the two unbounded scans become bounded lookups. That is **>50% count reduction** *and* removes the scale wall.

| Scale | Current | Optimized |
|---|---|---|
| per message | 11–16, incl. 2 unbounded scans | 6–8, all bounded |
| 1,000 users | ~700k/day + growing scans | ~350k/day, flat |
| 10,000 users | ~7M/day + scans | ~3.5M/day, flat |

## Risk / sequence
- Hot path → change behind verification. Add a query-count log first (instrument `assembleWorkingMemory`), then apply #1 (filter scans) — measure recall unchanged — then #2/#4 (parallelize/consolidate), then #3 (memoize).
- #1 + #5 are the safe, highest-ROI first steps. #3 (memoization) needs care to not serve stale rosters mid-conversation — short TTL, thread-scoped.
- No new feature; purely fewer/cheaper queries for identical output.
