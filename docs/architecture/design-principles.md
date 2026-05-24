# Design Principles

> These principles are derived from what is **provably in the schema** —
> observable in `information_schema` on the live DB, not from aspirational documentation.
> Each principle names the tables or columns that implement it.

---

## 1. Epistemic Separation

Memory is typed by *what kind of thing it is*, not just *what it says*.

Two orthogonal dimensions are tracked separately:

**Knowledge type** (`knowledge_units.knowledge_type`, `journal_entries.content_type`):
```
EXPERIENCE | FEELING | BELIEF | FACT | DECISION | QUESTION
```

**Canon status** (`knowledge_units.canon_status`):
```
CANON | ROLEPLAY | HYPOTHETICAL | FICTIONAL
```

This means a FEELING can be CANON or HYPOTHETICAL. A FACT can be FICTIONAL (worldbuilding).
A DECISION can be ROLEPLAY. The two dimensions don't collapse into each other.

**Why it matters:** Most memory systems flatten everything into `text + embedding`.
Flattening makes it impossible to ask "what are my actual beliefs vs. what I was
speculating about?" or "what did I decide vs. what am I still considering?" Separate
epistemic types make those queries answerable without NLP heuristics at retrieval time.

---

## 2. Multi-Resolution Temporal Anchoring

A memory component is not forced to live at exactly one level of the narrative hierarchy.

`timeline_links` is a bridge table with **10 nullable FK columns** — one per temporal level:

```
mythos_id | epoch_id | era_id | saga_id | arc_id |
chapter_id | scene_id | action_id | micro_action_id | component_id
```

A single memory component can be simultaneously anchored at scene level, chapter level,
era level, and mythos level — because human memories are simultaneously meaningful at
multiple narrative resolutions.

**Why it matters:** A breakup is a scene, a chapter ending, an arc reversal, part of
an era, and part of a founding self-myth — all at once. Systems that force
`event → exactly one parent` lose all but one of those meanings. The nullable FK bridge
preserves all of them without duplication.

---

## 3. Claim Temporality

Facts about entities are not permanent. They have lifespans.

`omega_claims`:
```
start_time    timestamptz NOT NULL
end_time      timestamptz NULL        -- NULL = still true
is_active     boolean NOT NULL
```

`omega_relationships`:
```
start_time    timestamptz NOT NULL
end_time      timestamptz NULL
is_active     boolean NOT NULL
```

"She lives in New York" is not a timeless fact — it is a claim valid from time A
to time B. When she moves, `end_time` is set and `is_active` flips to false.
The old claim is not deleted; it becomes historical record.

**Why it matters:** The world changes. People move, relationships end, beliefs evolve.
A system without claim temporality either silently becomes wrong or requires deleting
true historical facts to make room for new ones. Temporal scoping lets both be true —
just at different times.

---

## 4. Narrative Multiplicity

The same event can be narrated multiple times from different perspectives and at
different points in time, without any narration being "the" authoritative account.

`narrative_accounts`: Each row is one telling of one `event_record`, with its own
`account_type`, `narrator_id`, and timestamp.

`retelling_groups`: Groups multiple journal entries that describe the same event,
tracking `first_telling_entry_id`, `retelling_count`, and `evolution_notes` — how
the story changed across retellings.

`perspectives`: Named perspectives (e.g., "from my mother's view") with a
`reliability_modifier` that adjusts confidence scores for claims made from that angle.

**Why it matters:** Memory is not a recording. The same event looks different at 25
than at 35. A friend tells it one way; you tell it another. Treating the first write
as canonical destroys the signal in how stories change. Multiplicity preserves it.

---

## 5. Memory Reliability as a Dimension

Memory confidence is not just a model score. It is a function of measurable factors
that degrade or reinforce it over time.

`memory_reliability_scores`:
```
reliability_score       double
temporal_distance_days  int     -- how long ago
emotional_state         text    -- emotional context at recording
retelling_count         int     -- how many times retold
consistency_score       double  -- agrees with other entries?
cross_references        uuid[]  -- corroborating entries
factors                 jsonb   -- full factor breakdown
```

`entity_confidence_snapshots`: Per-entity confidence at a point in time, with
`derived_from` and `reason` — an audit trail for why confidence is what it is.

**Why it matters:** Eyewitness memory degrades with time. Emotional state at
recording biases content. Frequently-retold memories drift. A memory written
yesterday by a calm person that is corroborated by three other entries should be
weighted differently from a memory written under stress, once, five years ago.
Tracking the factors lets retrieval weight evidence, not just find it.

---

## 6. Contradiction as State, Not Error

Contradictions between beliefs are not bugs to be silently resolved or overwritten.
They are named states that surface for user judgment.

`contradiction_alerts`:
```
belief_unit_id               uuid FK
belief_content               text
resolution_status            text     -- open | user_resolved | auto_resolved
contradicting_evidence_ids   uuid[]
supporting_evidence_ids      uuid[]
suggested_action             text
user_action                  text     -- what the user actually chose
dismissed_at                 timestamptz
```

`belief_resolutions`: Per-belief-unit resolution state, tracking which units support
and contradict each other with a `resolution_confidence` score.

`narrative_diffs`: A diff between two states of the same belief — tracking
`from_content`, `to_content`, knowledge type changes, and confidence evolution over time.

**Why it matters:** "I believe X" and "I believe not-X" are both real observations.
Silently picking one destroys evidence. Surfacing the contradiction lets the system
ask the user which is currently true — and lets the history of the contradiction be
studied as signal (when did the belief flip? under what circumstances?).

---

## 7. Correction Propagation with Snapshot Audit

When the user corrects something, the correction is tracked as a first-class event
with before/after snapshots, not as a silent overwrite.

`user_corrections`:
```
correction_type   text    -- entity_name | date | relationship | belief | ...
original_value    text
corrected_value   text
source_unit_id    text    -- what was corrected
used_for_training boolean -- whether it fed back into the model
```

`correction_records`:
```
target_type       text
before_snapshot   jsonb
after_snapshot    jsonb
reason            text
reversible        boolean
```

`reversal_logs`: Full before/after snapshots for any reversed continuity event,
with `reversed_by` and `reason`.

**Why it matters:** Corrections are learning signals. If the system misclassified
"I heard she moved" as EXPERIENCE instead of BELIEF 40 times before the user
corrected it, those 40 corrections are a training signal pattern. Auditing them
(with `used_for_training` tracking) closes the feedback loop.

---

## 8. Three-Layer Identity Model

Identity is computed at three distinct levels of abstraction that are
kept separate, not merged:

```
Layer 1 — Signals       identity_signals          Raw, weighted evidence from individual entries
Layer 2 — Profile       identity_core_profiles    Aggregated view: dimensions, conflicts, stability
Layer 3 — Essence       essence_profiles          Soul-level synthesis: drives, fears, gifts
```

Each layer is computed separately by a different engine. Layer 1 writes continuously
as entries arrive. Layer 2 is recomputed periodically from Layer 1. Layer 3 is a
slower distillation from Layer 2.

**Why it matters:** Conflating raw signal with compiled profile creates noisy identity
models that thrash on every new entry. The three-layer model lets fast observations
accumulate at Layer 1 without destabilizing the slower, more stable views at Layer 2
and 3. You can be having a bad week without your essence profile changing.

---

## 9. Graceful Cognitive Degradation

The system is designed to remain operationally useful even when key subsystems
(AI provider, database schema, vector search) are unavailable.

Observable in three places:

**Schema guard** (`middleware/schemaGuard.ts` + `db/schemaVerification.ts`):
Returns HTTP 503 with a migration instructions message when required tables are
missing — instead of crashing or returning cryptic 500s from PostgREST.

**Dev AI fallback** (`services/devFallbackService.ts`):
When OpenAI is unreachable (429, invalid key, network error), the system returns a
clearly-labelled fallback SSE response that preserves the full pipeline structure
(mode routing, metadata event, chunk event, done event) — so the frontend continues
to function and pipeline code continues to run.

**Embedding model registry** (`embedding_model_registry`):
Tracks model deployment and retirement with `is_current`, `deployed_at`,
`retired_at`. Columns `journal_entries.embedding_model` and `.embedding_version`
tag every stored embedding with its model version — so a model migration doesn't
silently invalidate retrieval quality.

**Why it matters:** A system that crashes on any single failure is not a cognitive
substrate — it's a service. A cognitive substrate needs to degrade gracefully, 
preserve state, and resume when conditions improve. The ingestion history survives
an OpenAI outage. The schema guard prevents a partial migration from causing a
cascade of confusing errors.

---

## 10. Symbolic + Semantic Hybrid Memory

The system operates on both vector (semantic) and structured symbolic representations
of the same underlying content — not just one.

**Semantic (vector) layer:**
- `journal_entries.embedding` (vector(1536), model-versioned)
- `memory_components.embedding`
- `omega_entities.embedding`, `omega_claims.embedding`
- `identity_signals.embedding`
- `conversation_sessions.embeddings`
- `engine_embeddings.embedding`

**Symbolic (structured) layer:**
- `knowledge_units` — typed epistemic atoms
- `omega_entities` + `omega_claims` — subject-predicate-object with confidence
- `fact_claims` — subject-attribute-value triples
- `timeline_links` — multi-resolution temporal placement
- `contradiction_alerts` — named logical conflicts
- `value_rankings` — ordered preference structure

Retrieval uses both: vector similarity for associative recall, structured filters
for precise epistemic queries ("show me all BELIEF-type claims about relationships
made in the last year that are still active").

**Why it matters:** Pure vector search retrieves the semantically closest chunk —
but can't answer "did I decide this or was I speculating?" Pure symbolic systems
can answer structured queries but miss associative, fuzzy recall. The hybrid
makes both classes of query possible without compromise.

---

## Summary

| Principle | Key tables |
|---|---|
| Epistemic separation | `knowledge_units.knowledge_type`, `knowledge_units.canon_status` |
| Multi-resolution temporal anchoring | `timeline_links` (10 nullable FKs) |
| Claim temporality | `omega_claims.{start_time,end_time,is_active}` |
| Narrative multiplicity | `narrative_accounts`, `retelling_groups`, `perspectives` |
| Memory reliability as dimension | `memory_reliability_scores`, `entity_confidence_snapshots` |
| Contradiction as state | `contradiction_alerts`, `belief_resolutions`, `narrative_diffs` |
| Correction propagation with audit | `user_corrections`, `correction_records`, `reversal_logs` |
| Three-layer identity | `identity_signals` → `identity_core_profiles` → `essence_profiles` |
| Graceful cognitive degradation | schema guard, dev fallback, `embedding_model_registry` |
| Symbolic + semantic hybrid | vector columns + `knowledge_units` + `omega_claims` |
