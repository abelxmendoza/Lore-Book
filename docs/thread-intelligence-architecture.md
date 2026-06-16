# Thread Intelligence Architecture

Transforms a thread from a *message container* into a *structured memory container*: living summaries + episodes + resolved entities, reinforcing **Episodes → Entities → Threads → Life Graph**. Built to **reduce** architecture (see the deletion plan in `episodes-to-life-graph.md`), not add a parallel retrieval stack.

> Anti-sprawl principle (enforced this sprint): there are already 6 entity resolvers and 3 segmenters. We add **one** deterministic resolution core and **one** segmentation core that the rest collapse into — never a 7th/4th.

---

## Phase 1 — Canonical thread metadata

One row per thread (extend `conversation_sessions.metadata`, do not add a table):

```
thread_id
title                 -- existing (conversationTitleService + threadTitleUtils)
summary_short         -- 1 sentence
summary_medium        -- 1 paragraph
summary_long          -- retrieval context
summary_version       -- bumps when summaries regenerate
summary_message_count -- message count the summaries were built from (staleness)
key_people[]          -- entity ids (resolved, not raw strings)
key_places[]
key_projects[]
key_events[]          -- episode ids
key_themes[]
first_message_at
last_message_at
memory_count          -- chat_messages count (canonical)
episode_count
embedding             -- of summary_long, for thread-first search
```

**Update rules (incremental, never full regen unless necessary):**
- On each persisted assistant turn, append the turn's resolved entities to `key_*` (set-union) and bump `last_message_at` + `memory_count`. O(1).
- Summaries regenerate **only when stale**: `memory_count − summary_message_count ≥ N` (e.g. 4) *or* an episode boundary closed. Otherwise reuse.
- `summary_version` increments on regen so consumers can cache.

## Phase 2 — Thread Summarization Engine (`threadSummaryService`)

Three living summaries, incrementally maintained:

| Level | Form | Use | Cost control |
|---|---|---|---|
| SHORT | 1 sentence | sidebar/hover | regen only when stale |
| MEDIUM | 1 paragraph | thread header / continuity | regen on staleness threshold |
| LONG | retrieval context | feeds the Working Memory Assembler | regen on episode close |

- **Incremental:** new turns extend a rolling summary input (reuse `compactionService`); the LLM is asked to *update* the prior summary with the new turns, not re-read the whole thread.
- **Version tracking + staleness:** `summary_version` + `summary_message_count` as above. A reader can tell instantly whether the summary reflects the latest messages.
- Determinism floor: if the LLM is unavailable, `deriveTitleFromMessages` + key-entity list gives a usable deterministic SHORT summary (never empty).

## Phase 3 — Episodes (`episodeSegmentationCore`, implemented)

`segmentEpisodes(messages)` splits a thread deterministically by **time gaps, entity shifts, location shifts, topic shifts** (weighted boundary score). Each episode → `{messageIds, participants, locations, startAt, endAt, boundaryReason}`. The thin wrapper persists episodes and (optionally) LLM-titles them ("Costco With Abuela", "Club Metro Night"). This is the unit the Life Graph consumes (`episodes-to-life-graph.md`).

## Phase 6 — Thread-first retrieval

The Working Memory Assembler stays the single retrieval entry; we change its **candidate generation** order, not add a router:

```
Question
  ↓  threadIndexService: embedding/keyword over thread summary_long  → relevant THREADS
  ↓  episode index within those threads                              → relevant EPISODES
  ↓  messages within those episodes                                  → relevant MESSAGES
  ↓  Working Memory Assembler (existing ranking/budget)
```

**Benchmark design:** compare current (message-vector-first) vs thread-first on a labeled query set — measure recall@k of the *correct episode/message*, candidate-set size (smaller = cheaper), and latency. Thread-first wins when the answer lives in a coherent past conversation (most recall queries) because it prunes the message space to a few relevant threads before vector search, cutting candidates from O(all messages) to O(messages in top-k threads).

## Phase 7 — Thread continuity (deterministic, no hallucination)

On thread open, render from **stored metadata only** (no generation):

```
Last time in this thread (3 days ago):
  People:    Abuela, Tío Juan
  Places:    Costco
  Projects:  LoreBook
  Episodes:  Costco With Abuela · LoreBook Memory Testing
  Open loops: (a user turn with no assistant reply, or an unresolved question)
```

Every line is a field read from `key_*` / episodes / `countMissingAssistantTurns` — **deterministic, evidence-only**. "Open loops" reuses the durability check (`countMissingAssistantTurns`) + unanswered-question detection. If a field is empty, omit it (never fabricate).

## Phase 9 — Diagnostics (`/api/diagnostics/thread-intelligence`)

Per user/thread: summaries (+version/staleness), episodes (+boundaryReason), entity resolutions (resolve/disambiguate/create with reasons from `entityResolutionCore`), continuity state, index statistics, coverage (% threads with summaries/episodes). Pairs with the existing `/api/diagnostics/working-memory` (chat-trace) and `/api/diagnostics/thread-health` so any recall/threading failure is explainable in one call.

---

## Lore-aware parsing + ambiguity (Phases 4+5, implemented as one core)

`entityResolutionCore.resolveMention(mention, candidates, context)`:
- **Lore-aware:** "grandma" → resolves to the existing **Abuela** via kinship/alias equivalence → returns `resolve`, so no duplicate is created. `wouldCreateCharacter()` is the guard the creation paths call.
- **Context-aware disambiguation:** among same-name candidates ("Juan"), ranks by **thread co-occurrence > recent episodes > relationship overlap > recency > importance** — not string distance. Returns `disambiguate` only when the top two are within a confidence margin (otherwise it resolves silently). This is the deterministic fix for the "wrong Juan" / "grandma became a new person" failures.

These replace the ad-hoc logic scattered across the 6 resolvers — the call sites route through this one core (deletion plan).

---

## Success criteria → mechanism
- Living summaries → `threadSummaryService` (incremental, versioned).
- Every thread has episodes → `episodeSegmentationCore`.
- Lore improves parsing / no duplicate entities → `entityResolutionCore` (lore-aware resolve-before-create).
- Thread-first → episode-first retrieval → WMA candidate-generation reorder.
- Episodes primary, messages evidence → `episodes-to-life-graph.md`.
- Simpler architecture → the deletion plan (6 resolvers→1, 3 segmenters→1).
