# LoreBook — The Autobiographical Memory Graph (v2 data model)

**Status:** design, not implementation.
**Thesis:** LoreBook is already an autobiographical memory graph implemented implicitly across ~14 disconnected tables. v2 makes the graph **explicit and canonical**: one node table, one edge table, one episodic log, and a small set of derived projections. Everything else becomes a *view*.

> Companion docs: `lorebook-v2-architecture.md` (runtime: recall, working memory, reflection, trust), `graph-migration-plan.md` (keep/merge/rewrite/delete + scaling), `frontier-memory-capabilities.md` (Phase 9).

---

## 0. The one decision that determines everything: Postgres-native graph, not a graph DB

The instinct at "1M users" is Neo4j. **That is the wrong call here**, and it matters enough to settle first.

- LoreBook's graph is **per-user and isolated**. There are no cross-user edges. Each user's graph is small (hundreds → low thousands of nodes even after years). The scaling axis is **number of users**, not graph diameter.
- Per-user isolation means the system **shards trivially on `user_id`**. That is a horizontal-scaling dream and it is native to Postgres (Citus / app-level sharding / partitioning).
- We already depend on Postgres + `pgvector` + RLS + the existing ingestion. A graph DB adds a second stateful system, a second consistency model, a second backup story, and loses RLS/vector locality — for graphs that fit in a few KB.

**Decision:** model the graph as Postgres tables (`nodes`, `edges`, `episodes`) with composite `(user_id, …)` indexes; traverse with recursive CTEs and an **in-process per-user adjacency cache** for hot paths; use `pgvector` (HNSW) for semantic retrieval. Revisit a graph DB only if cross-user graph queries ever become a product (they shouldn't — that's a privacy boundary).

This single decision is what makes 1M users tractable: **1M isolated small graphs sharded by user**, not one giant graph.

---

## Phase 1 — Graph model

### Core tables (canonical)

Three tables replace the fourteen.

#### `nodes` — every thing in a life

```
nodes (
  id            uuid pk,
  user_id       uuid not null,           -- shard key
  type          node_type not null,      -- enum below
  label         text not null,           -- canonical display name ("Abuela", "Club Metro")
  norm_key      text not null,           -- normalized + phonetic key for resolution
  attrs         jsonb not null default '{}',  -- type-specific fields
  embedding     vector(1536),            -- label + salient attrs, for semantic match
  salience      real not null default 0, -- cached centrality/importance (derived, versioned)
  status        node_status not null default 'active',  -- active | merged | archived
  merged_into   uuid,                    -- tombstone pointer (never hard-delete)
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,
  version       int not null default 1,  -- bumps on attr change (cache key)
  created_at    timestamptz, updated_at timestamptz
)
```

`node_type` enum:
`person · place · organization · event · project · skill · object · group · chapter · arc · theme · goal · belief · value · life_period · identity_theme · relationship_state`

(Note: a **relationship** is both an edge *and* a node — see "reified relationships" below. `event` is the episodic anchor; `chapter`/`arc`/`theme`/`life_period`/`identity_theme` are the story layer; `belief`/`value`/`goal`/`identity_theme` are the reflective/semantic-self layer.)

**Indexes:**
- `(user_id, type, status)` — roster/Book queries.
- `(user_id, norm_key)` — entity resolution lookups.
- `(user_id, salience desc)` — "important people/things."
- HNSW on `embedding` **partitioned by user_id** (or filtered) — semantic match.
- GIN on `attrs` — typed field queries.

#### `edges` — every relationship, typed, directed, temporal, sourced

```
edges (
  id          uuid pk,
  user_id     uuid not null,            -- shard key (denormalized for locality)
  src         uuid not null,            -- nodes.id
  dst         uuid not null,            -- nodes.id
  type        edge_type not null,
  attrs       jsonb default '{}',       -- role, intensity, etc.
  weight      real default 1,           -- strength (derived; e.g. mention frequency)
  confidence  real default 0.5,         -- how sure are we (0..1)
  valid_from  timestamptz,              -- bi-temporal: when it became true in the life
  valid_to    timestamptz,              -- null = still true
  asserted_at timestamptz not null,     -- when WE learned it (transaction time)
  status      edge_status default 'active',  -- active | retracted | superseded
  superseded_by uuid,
  created_at  timestamptz
)
```

`edge_type` enum (directed unless noted):
**Social:** `knows · related_to(undirected) · parent_of · child_of · sibling_of · married_to · dated · friends_with · mentors · works_with · reports_to`
**Spatial/affiliation:** `lives_in · lives_with · met_at · located_in · works_for · member_of · attended · founded · owns`
**Temporal/causal:** `happened_before · happened_after · during · caused · led_to · enabled · prevented`
**Compositional (story):** `part_of · belongs_to · instance_of · about · involves · references`
**Reflective:** `motivated_by · contradicts · supports · reinforces · evolved_into`

**Indexes:**
- `(user_id, src, type)` and `(user_id, dst, type)` — both-direction adjacency.
- `(user_id, type, valid_from)` — temporal queries ("who did I live with in 2023").
- partial index `where status='active'` — exclude retracted/superseded by default.

**Retrieval implication:** k-hop expansion from anchor nodes is `(user_id, src)` index lookups; with the in-process adjacency cache it's pointer-chasing. No JS-side joins, no `.or()` scans.

**Storage implication:** edges are append-mostly; retraction is a status flip + `superseded_by`, never a delete. Bi-temporal fields make "what did I believe then vs now" free.

#### `episodes` — the episodic log (event-sourced, immutable)

```
episodes (
  id           uuid pk,
  user_id      uuid not null,           -- shard key
  occurred_at  timestamptz,             -- when it happened in the life (nullable/fuzzy)
  occurred_precision text,              -- exact | day | month | year | approx
  ingested_at  timestamptz not null,    -- when we recorded it
  source       text not null,           -- chat_message | journal | import
  source_id    uuid,                    -- chat_messages.id etc. (provenance)
  raw_text     text not null,           -- verbatim, never edited (corrections supersede)
  summary      text,                    -- one-line distillation
  embedding    vector(1536),
  node_id      uuid,                    -- the `event` node this episode anchors (if promoted)
  importance   real default 0,          -- derived, versioned
  status       episode_status default 'active',  -- active | superseded (correction)
  superseded_by uuid,
  created_at   timestamptz
)
```

Episodes are the **immutable substrate**. Everything else (nodes' semantic attrs, edges, scores, stories, reflections) is **derived** from episodes and can be rebuilt. This is the event-sourcing backbone of the trust architecture.

### Reified relationships (why a relationship is also a node)

A romantic relationship ("Summer with Alex") has its own arc, start/end, episodes, and trajectory. Modeling it only as an `edge` loses that. So: significant relationships are **reified** — a `relationship_state` node connected by `involves` edges to the two people, with episodes `about` it and a trajectory time-series. Ephemeral acquaintance is just an edge. **This kills the `romantic_relationships` vs `character_relationships` split** — one model, promoted to a node when it earns narrative weight.

---

## Phase 3 — Episodic vs Semantic memory

This separation is the spine of the whole system.

| | **Episodic** | **Semantic** |
|---|---|---|
| What | specific experiences | stable truths |
| Examples | Costco trip; Club Metro night; Kelly onboarding call | Abuela is my grandmother; I founded LoreBook; I work at Amazon |
| Table | `episodes` (+ `event` nodes) | `nodes.attrs` + `edges` (facts) |
| Mutability | **immutable** (append-only; corrections supersede) | **mutable, versioned** |
| Time model | single timestamp (when it happened) | validity interval (`valid_from`/`valid_to`) |
| Source | direct ingest | **consolidated** from episodes |
| Confidence | high (it was said) | accrues with evidence |

**Storage:** episodic = `episodes` (event-sourced). Semantic = facts expressed as `edges` (e.g. `parent_of`) and stable `nodes.attrs` (e.g. `person.occupation`), each carrying `confidence`, `valid_from/to`, and provenance back to the episodes that support them.

**Retrieval:**
- "When did I go to Costco?" → **episodic** (vector + time over `episodes`).
- "Who is Abuela?" → **semantic** (the `person` node + its `edges`) **plus** a few supporting episodes for color.
- The recall planner (v2 doc, Phase 2) always assembles *both*: semantic gives the stable answer, episodic gives the evidence/texture.

**Update rules (consolidation):** a background "consolidation" worker reads new episodes and updates semantic memory — extract facts → upsert edges/attrs → raise confidence on repetition → set `valid_to` when something ends ("we broke up" closes `dated`). This is the *only* writer of semantic memory. Episodes are never edited by it.

**Conflict handling (bi-temporal):** new evidence that contradicts a semantic fact does **not** overwrite. It:
1. opens a new fact version (`valid_from = now`), 2. closes the old one (`valid_to = now`, status `superseded`), 3. records a `contradicts` edge for the audit trail, 4. if confidence is close, raises a **contradiction** for the reflection layer / user ("you mentioned two jobs — which is current?"). "I moved to Austin" doesn't delete "lived in Dallas" — it ends it. The graph remembers the whole life, not just the latest state.

---

## Phase 5 — Story system (first-class objects, never text blobs)

Today stories are generated text in `narrative_accounts` and reconstructed on the fly by four Sprint-AM services. v2 makes narrative structure **graph objects** that are queried, updated incrementally, and *rendered* on demand — the text is a projection, the structure is canonical.

### Story node types & how they form

| Node type | Is | Formed by | Example |
|-----------|-----|-----------|---------|
| `chapter` | a bounded time span of life | temporal clustering of episodes + transitions | "Career Rebuild (2024)" |
| `arc` | a narrative thread spanning chapters | linking causally-related events around a goal/conflict | "LoreBook Creation" |
| `theme` | a recurring pattern | clustering episodes/edges by motif | "Family Responsibility" |
| `life_period` | a coarse era | top-level temporal segmentation | "Post-college" |
| `relationship_state` | a relationship's lifecycle | reified relationship + trajectory | "Summer Heartbreak" |
| `turning_point` (event subtype) | a high-significance pivot | significance + causal centrality | "the layoff" |

### Edges that make them real

- `chapter` `–part_of→` `life_period`; `episode`/`event` `–part_of→` `chapter`.
- `arc` `–involves→` people/projects; events in an arc are chained by `caused`/`led_to`.
- `theme` `–about→` recurring nodes; episodes `–instance_of→` `theme`.
- `relationship_state` `–involves→` two `person` nodes; carries a **trajectory** (closeness sampled over time).

### Why objects beat blobs

- **Updatable:** a new event extends the "Career Rebuild" chapter incrementally; you don't regenerate a blob.
- **Queryable:** "show me the turning points in the LoreBook arc" is a graph walk.
- **Consistent:** the same chapter renders in Life Log, Character Book ("Ashley, during the Career Rebuild"), and chat from one source.
- **Trustworthy:** every chapter/arc/theme has `part_of`/`about` edges to its evidence — it can cite itself, and it invalidates when its evidence changes.

**Turning points & themes are derived, not authored:** a consolidation job proposes chapters (change-point detection over episode density + emotional shifts), arcs (causal subgraphs around goals), and themes (community detection / embedding clusters over episodes). These are **proposed with confidence** and can be user-confirmed — never asserted as fact until evidenced.

---

## How this collapses the 14 systems (preview; full mapping in migration doc)

| Today | v2 |
|---|---|
| `characters`, `people_places` | `nodes` (type=person/place/...) |
| `character_memories`, `journal_entries`, `extracted_units`, `utterances` | `episodes` (+ `event` nodes) |
| `character_relationships`, `romantic_relationships` | `edges` (+ reified `relationship_state` nodes) |
| `resolved_events`, `character_timeline_events`, `event_candidates` | `event` nodes + `episodes` |
| `timelines`, `chronologyV2` | `chapter`/`life_period` nodes + temporal edges (a *view*) |
| `biographies`, `narrative_accounts` | rendered from `chapter`/`arc`/`theme` nodes (a *projection*) |
| `importance scores`, `significance scores` | `nodes.salience` / `episodes.importance` (derived, versioned) |
| `meaning cache` | `reflection` nodes (v2 doc Phase 6) |
| `crystallized_knowledge`, `entity_facts`, `omega_claims` | semantic `edges`/`attrs` with confidence |
| `provenance_edges` | first-class: every derived thing has provenance edges to episodes |

Three canonical tables + a handful of derived projections, replacing fourteen parallel stores.

**The rule that keeps it honest:** *episodes are truth; everything else is a function of episodes and must be able to rebuild itself.* That property is what makes recall trustworthy and scores un-stale — developed in `lorebook-v2-architecture.md`.
