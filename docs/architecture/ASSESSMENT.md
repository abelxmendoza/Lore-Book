# Lorekeeper — Architectural Assessment

This is a candid architectural assessment of the current state of Lorekeeper. It is written for future architects, principal engineers, and anyone taking over a major subsystem. It is not a celebration of what was built. It is an honest accounting of what is strong, what is fragile, and what needs to happen next.

---

## Strongest Systems

### 1. The LNC Pipeline (Compiler Layer)

The decision to treat memory compilation as a compiler — with typed IR, an epistemic lattice, proof-carrying data, and a consolidation gate — is architecturally sound and forward-compatible. It creates a clean separation between *what was said* (entry_ir, immutable) and *what the system believes* (journal_entries, governed). This is the most important design decision in the repo.

The `entry_ir → journal_entry` promotion path with the canon gate, confidence gate, and review queue is exactly the right architecture. It prevents junk from becoming durable memory and gives the user a first-class path to review borderline entries.

### 2. The Epistemic Lattice

The lattice's absolute invariants (`FEELING → FACT` is forbidden, always) are a principled defense against a common failure mode in naive memory systems. Proof-carrying data in `compiler_flags.promotion_proof` creates an auditable upgrade history.

This is underutilized in the current UX — users cannot see the proof chain — but the infrastructure is right.

### 3. The Engine Registry Pattern

The `EngineOrchestrator` + `DependencyGraph` + engine registry is clean. Adding a new engine requires exactly one registration line. The dependency graph prevents cycles and enables safe parallelism. The `EngineContext` is read-only, preventing engines from corrupting each other's data.

The 40+ engine coverage is impressive breadth. The weakness is depth — most engines are analytical snapshots, not stateful reasoning agents. They observe and summarize but cannot act on their observations.

### 4. The cognition_mutations Audit System

Append-only, service-role-write, owner-read-only, with no UPDATE/DELETE policies. This is the right design for an epistemic audit log. The `before_state`/`after_state` JSONB columns capture full snapshots, not diffs — verbose but complete. The three indexes (artifact, timeline, type) cover the expected query patterns.

### 5. The Mode Attribution UX

Surfacing the mode decision to the user in emotional language ("writing this to memory", "holding space") rather than raw enum values is a strong product decision. It makes the system's cognition legible without being clinical.

---

## Biggest Risks

### Risk 1: The provenance edge store does not exist

`ProvenanceEdge` types are defined. `makeProvenanceEdge()` exists. The `cognition_mutations.provenance_edge_id` column exists. But there is no `provenance_edges` table. The causal chain between artifacts — the thing that makes the system's reasoning traversable — is not persisted.

**Impact:** The "governed autobiography" and "provenance-aware memory" promises are partially unfulfilled. You can see *what changed* via `cognition_mutations`, but you cannot traverse *why* — the causal chain from utterance → entry_ir → journal_entry → insight is not a queryable graph.

**Fix:** Implement `provenance_edges` table persistence. Add a `linkProvenance(source, target, relation)` call to the compiler and consolidation service. This is the next critical infrastructure piece.

### Risk 2: The ingestion pipeline has no transactional boundary

~30 extractors write independently. If extractor 12 throws, extractors 1-11 have already written. The idempotency check (`chatMessageId` dedup) prevents double-ingestion of complete runs but does not detect partial runs.

**Impact:** Under load or transient DB errors, a message can be partially ingested — some extractors fire, some don't. The user's memory is inconsistent in ways neither the user nor the system can detect.

**Fix:** Add a `pipeline_run` record before extraction starts. Mark it complete at the end. Add a reconciliation job that detects incomplete runs and re-queues them.

### Risk 3: The entry_ir table grows unboundedly

`entry_ir` rows are never deleted by design (correct — they are immutable compiler output). But there is no compaction, archival, or cold-storage strategy. At scale, this becomes:
- A major query bottleneck (full table scans for consolidation sweeps)
- A storage cost concern (every message produces a row)

**Fix:** Implement a `year_shard` strategy for `entry_ir` similar to the existing `year_shard` index on `journal_entries`. Add a background job that moves consolidated `entry_ir` rows to a separate `entry_ir_archive` table after 90 days. The active table remains small; the full history remains accessible.

### Risk 4: Engine runtime has no execution budget

40+ engines run until they finish. No per-engine timeout. No priority weighting. No budget for total runtime.

**Impact:** In production, a single slow engine (e.g., `chronology` processing 5 years of entries) can hold a worker for minutes. Under concurrent nightly sweeps for many users, this causes resource exhaustion.

**Fix:** Add a per-engine timeout (default 30s, configurable). Add engine priority weights so critical engines (identityCore, continuity) always run. Add a per-user runtime budget that terminates the sweep after N minutes and resumes on the next sweep.

### Risk 5: The mode router is a single point of failure for memory writes

A misclassified `EMOTIONAL_EXISTENTIAL` for an `EXPERIENCE_INGESTION` means the user's lived experience is never compiled. There is no fallback, no user-visible correction path for mode misclassification, and no systematic way to detect mode errors in production.

**Impact:** Silent memory loss. The user told the system about something important; it decided not to listen.

**Fix 1:** Add a mode correction UI — let the user see the mode decision and tap "that's wrong" to re-route.
**Fix 2:** Add a `misclassification_report` endpoint that logs user-reported mode errors.
**Fix 3:** Log all mode decisions with their confidence and the full message (redacted by default) for offline analysis.

---

## Ontology Drift Concerns

### The four-table entity problem

`characters`, `omega_entities`, `people_places`, `entities` are four tables representing overlapping concepts. The `EntityRegistry` façade masks this fragmentation but does not resolve it. Over time:

- The same person may exist in multiple tables under different names
- Entity merges (`ENTITY_MERGE` mutation type) are logged but the merge logic is not centralized
- The "canonical" entity for a person is determined by table priority, not by semantic truth

**Recommendation:** Define an explicit entity ontology. Decide: is `omega_entity` the canonical long-term identity record? Is `entity` the transient per-conversation record? Make these roles explicit in schema naming and enforce them via constraints.

### The KnowledgeType / TruthState impedance mismatch

`KnowledgeType` (EXPERIENCE, FEELING, BELIEF, FACT, DECISION, QUESTION) lives on `entry_ir` and governs compiler behavior.
`TruthState` (CANONICAL, CONTEXTUAL, REVISED, DISPUTED, INFERRED, PENDING_VERIFICATION) lives on `journal_entries` and governs governance behavior.

These are different concepts, but they encode overlapping information. A `BELIEF`-type entry that consolidates with high confidence gets `PENDING_VERIFICATION` truth state — but it is epistemically weaker than a `FACT`-type entry at the same confidence. The RAG layer does not currently distinguish these — it retrieves by vector similarity without weighting by knowledge type or truth state.

**Recommendation:** Add `knowledge_type` and `truth_state` to the RAG context and weight retrieval accordingly. A `DISPUTED` entry should contribute less to the response context than a `CANONICAL` one.

### The canonical/non-canonical split is not enforced in retrieval

The `CanonStatus` on `entry_ir` (CANON, ROLEPLAY, HYPOTHETICAL, etc.) prevents non-canonical entries from consolidating. But if a non-canonical entry somehow reaches `journal_entries` (direct insert, migration error), the RAG layer will retrieve it without knowing it's fictional. There is no retrieval-time canon filter.

**Recommendation:** Add a `is_canonical` boolean to `journal_entries` populated from `entry_ir.canon.status`. Filter retrieval to `is_canonical = true` by default, with an explicit override for retrospective or hypothetical queries.

---

## Technical Debt

### High priority

1. **`optionalAuth` was duplicated in `routes/chat.ts`** — now fixed, but the pattern of duplicating middleware in route files is a recurring risk. Consider a middleware registry.

2. **The dead project reference in `config.ts`** (`cshtthzpgkmrbcsfghyq` → `mwtyckyguduigflpnqss`) — now fixed, but suggests the config has not been audited recently. Full config audit recommended.

3. **`workout_events` missing from cloud schema** — the universal RLS migration skipped this table because it doesn't exist on the cloud. Either backfill the migration or document the divergence.

### Medium priority

4. **100+ route files with no route versioning** — all routes are under `/api/` with no version prefix. Any breaking change requires coordinated client/server deployment. Consider `/api/v1/` prefix for new routes.

5. **The `conversationCentered/` directory has grown to ~40 files** — it is becoming a catch-all for ingestion-adjacent logic. A second decomposition pass (similar to what was done with `omegaChatService`) would improve maintainability.

6. **Engine results have TTL cache but no invalidation strategy** — if a user's data changes significantly (large ingestion, truth-state revision), stale engine results may be served. Add a `cache_invalidated_at` field to force recomputation on significant events.

### Low priority

7. **The `docs/archive/` directory** — contains superseded blueprints that may conflict with current architecture. Should be clearly marked as archived and not referenced in current docs.

8. **The `training_datasets` table** — exists in the schema and has RLS, but no service writes to it and no route exposes it. Either implement it or remove it from the schema.

---

## Infrastructure Gaps

### No provenance edge persistence
Described in Risk 1. The most critical missing piece.

### No memory review queue UI
`QUEUED_FOR_REVIEW` entries pile up in `memoryReviewQueue` but there is no user-facing UI to review, accept, or reject them. Users are losing information without knowing it.

### No consolidation health metrics in production
`/api/admin/memory-health` exists but is admin-only. Users and operators cannot see consolidation rates, queue depths, or engine health in production.

### No engine-level observability
Which engines are slow? Which are failing silently? Which users have the highest failure rates? The scheduler logs failures as warnings but there is no aggregated engine health dashboard.

### No multi-tenancy governance
The system is designed for individual users. There is no concept of organizations, shared memory, or team cognition. The `actor_id` column is forward-compatible with delegation but the auth model for multi-actor governance does not exist.

---

## Recommended Next Phase: Provenance Graph + Cognition Scheduler

The system's next architectural phase should complete the provenance infrastructure and add runtime governance to the engine layer.

### Phase: Provenance Graph

**Goal:** Make the causal chain from utterance to insight traversable.

1. **Implement `provenance_edges` table** — persist `ProvenanceEdge` records. Schema:
   ```sql
   CREATE TABLE provenance_edges (
     id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id      uuid  NOT NULL REFERENCES auth.users(id),
     source_id    uuid  NOT NULL,
     source_type  text  NOT NULL,
     target_id    uuid  NOT NULL,
     target_type  text  NOT NULL,
     relation     text  NOT NULL,
     confidence   float NOT NULL,
     created_at   timestamptz NOT NULL DEFAULT now()
   );
   ```

2. **Wire edge creation into the compiler** — `irCompiler` writes `EXTRACTED_FROM` and `COMPILED_INTO` edges. `memoryConsolidationService` writes `COMPILED_INTO` edges. `CorrectionAuthority.applyRevision()` writes `REVISED_BY` edges.

3. **Build provenance traversal API** — `GET /api/identity/provenance/:artifactId/chain` returns the full causal chain as a DAG. Frontend can render this as a timeline or graph.

4. **Surface provenance in WhatAIKnows** — Show the user: "This memory was derived from 3 conversations over 2 weeks. It was first inferred, then you confirmed it."

### Phase: Cognition Scheduler

**Goal:** Give the engine runtime production-grade execution governance.

1. **Per-engine timeout** — Wrap each engine call in a `Promise.race()` with a configurable timeout. Log timeouts distinctly from failures.

2. **Engine priority tiers** — Tag each engine as `CRITICAL` (always runs), `STANDARD` (runs when budget allows), or `DEFERRED` (best-effort only). The orchestrator respects these tiers.

3. **Per-user runtime budget** — Track wall-clock time per user sweep. If budget is exceeded, flush current results, mark remaining engines as `SKIPPED`, and resume on next sweep.

4. **Engine health dashboard** — Aggregate per-engine success rates, p50/p95 latencies, and last-run timestamps. Expose via `/api/admin/engine-health` and optionally the cognition panel.

5. **Incremental compilation** — The `IncrementalCompiler` file exists (`compiler/incrementalCompiler.ts`). Wire it into the nightly sweep so only entries modified since last run are recompiled.

### Also worth considering

- **Canonical memory graph** — A read-optimized, pre-joined view of CANONICAL-state entries across all domains, designed for fast RAG retrieval and narrative synthesis. Currently retrieval queries join multiple tables. A materialized view would reduce latency.

- **Confidence propagation** — When a journal entry's truth state changes, downstream insights derived from it should be reconsidered. Add a dependency graph over the artifact store that can propagate confidence changes.

- **Ontology registry** — A formal schema for the entity taxonomy and relationship types, versioned, with migration paths. Currently the entity ontology is implicit in table structure. Making it explicit would enable semantic querying ("find all entities of type FRIEND that appeared in CANONICAL entries in the last 90 days").

---

## Assessment Summary

Lorekeeper has crossed the threshold from prototype to serious infrastructure. The compiler metaphor is right. The epistemic contracts are right. The governance model is right.

The gaps are real but tractable:
- The provenance edge store is missing — implement it
- The ingestion pipeline is not transactional — add pipeline run tracking
- The engine runtime has no budget — add execution governance
- The entity ontology is fragmented — consolidate it

The philosophical direction is clear: this system is building toward a point where a user can ask "why does the system believe this about me" and get a traversable, explainable answer. The trust primitives are in place. The graph that would make that answer traversable is the next thing to build.

The biggest risk is not technical — it is ontology drift. As features are added, the knowledge type taxonomy, truth state vocabulary, and entity model will be pulled in different directions by different features. Governance of the ontology itself — treating the schema of memory as a first-class design concern — is what separates a coherent cognition system from an impressive but internally inconsistent one.

**Build the provenance graph. Govern the ontology. The rest follows.**
