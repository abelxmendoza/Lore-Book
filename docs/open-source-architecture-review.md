# Open-Source Architecture Review — Knowledge Systems Analysis

> **Scope.** A grounded architectural review of LoreBook against six open-source
> systems (TypeDB, Neo4j, Duckling, Dedupe, Zep, Logseq). This is written against
> the *actual* implementation in `apps/server`, `apps/web`, and `supabase/migrations`
> — not a feature brochure. The goal is long-term maintainability and product
> success, so the document is deliberately blunt about where LoreBook is
> **reinventing commodity infrastructure** versus where it is building **genuine
> differentiation**.

**Status:** Draft for engineering/product review · **Optimize for:** maintainability + product success, not novelty.

---

## 0. TL;DR

- **The moat is real and it is the epistemic layer**, not the plumbing. The Ontology Engine, Lexical Intelligence, Knowledge Authority / MRQ / truth-states / provenance, Family/Relationship intelligence, and the Life/Narrative Compiler are genuinely differentiated and should stay proprietary.
- **The biggest risk is store fragmentation**, not a missing database. LoreBook has **3 parallel person stores** and **5+ parallel relationship stores** in one Postgres instance. Adopting *another* database (Neo4j, TypeDB) before consolidating this would multiply the problem.
- **The clearest "stop reinventing" win is temporal parsing.** There are 4+ hand-rolled relative-date regex engines and two different temporal-scope enums. A single in-process library (**chrono-node**, not Duckling) consolidates this with near-zero ops cost.
- **The second clearest win is fuzzy matching consolidation.** Jaro-Winkler is hand-rolled and duplicated; thresholds are scattered. Centralize before considering probabilistic linkage (Dedupe/Splink).
- **Do not introduce a second database yet.** Consolidate the relationship edge tables into one graph table in Postgres and use **recursive CTEs / Apache AGE / `pg_trgm`** to close the documented multi-hop recall gap. Re-evaluate Neo4j/TypeDB only if graph traversal becomes a core, high-QPS product surface.
- **Zep and Logseq are inspiration only.** LoreBook is *ahead* of Zep on governance; it should borrow Zep/Graphiti's **bi-temporal edge model** and Logseq's **backlinks/linked-references UX**, nothing more.

---

## 1. LoreBook as it actually exists today

A short, honest baseline — everything below is verified in code.

### 1.1 Storage & runtime
- **Single primary store:** Supabase **Postgres** + **pgvector** (1536-dim embeddings on `journal_entries`, `characters`, `omega_entities`, `locations`, `memory_components`, …). 170+ migrations.
- **No graph database, no Redis.** Ingestion runs on an **in-process priority queue** (`apps/server/src/services/ingestion/ingestionQueue.ts`, concurrency 2, dead-letter to Postgres). Background work is **node-cron** jobs registered in `index.ts` (decay, continuity, insights, graph update, embedding reindex).
- **LLM:** OpenAI **direct** (`openai` client, `gpt-5.5` chat / `gpt-5.4-mini` extraction / `text-embedding-3-small`). No AI SDK / gateway / model router; OpenAI calls are scattered across 50+ services.

### 1.2 Entity & relationship model (the crux)
- **Three parallel person/entity stores**, bridged by maps rather than unified:
  - `characters` (canonical authority, `embedding`),
  - `people_places` (legacy discovery/mention store, still heavily read),
  - `omega_entities` (truth-seeking memory engine, `embedding`).
  - Bridge: `character_authority_map`, `entity_canonical_map`.
- **Five+ parallel relationship/edge stores:** `character_relationships`, `entity_relationships` (polymorphic), `omega_relationships`, `romantic_relationships`, `social_edges` (string-keyed nodes), plus `graph_edges` (on `memory_components`).
- **Graph traversal is minimal.** Only BFS on the memory-component `graph_edges` (`knowledgeGraphService.getPath`, depth 3) and an in-memory fabric. Chat recall does **1-hop** neighbor fetches in `workingMemoryAssembler.ts`. `docs/recall-benchmark.md` explicitly documents the missing family/household multi-hop traversal.

### 1.3 Deduplication / entity resolution
- **Almost entirely deterministic:** hand-rolled **Jaro-Winkler** (`utils/jaroWinkler.ts`, duplicated in `entities/fuzzyMatcher.ts`), token **Jaccard/containment** (`placeDuplicateScore`, `groupDuplicateScore`), and a **rule cascade** verdict engine (`entityAuthorityService.decideAuthority` → `MERGE | ALIAS | PARENT_CHILD | LINK | IGNORE`).
- **Thresholds scattered** but partly centralized in `config/aiThresholds.ts` (JW 0.85–0.97 depending on context).
- **The only probabilistic step** is the embedding cosine fallback (`match_omega_entities`, pgvector). `entityResolutionCore` (context-ranked, the intended "brain") runs in **shadow mode** by default (`ENTITY_RESOLUTION_CORE=shadow`).
- **Wiring gaps:** `entity_conflicts` has **no application writer**; the resolution dashboard may show empty conflicts.

### 1.4 Temporal intelligence
- **Fragmented.** `date-fns` is used for math/formatting only. Relative NL dates ("today/yesterday/last year/when I worked at Vanguard") are resolved by **4+ independent regex engines**: `utils/temporalAnchorResolver.ts` (solid, chat windows), `services/timeEngine.ts`, `knowledgeTypeEngineService.ts`, `semanticExtractionService.ts`, `essenceRefinementEngine.ts`, `ruleBasedFactExtraction.ts`.
- **Two temporal-scope enums** (`MOMENT|PERIOD|ONGOING|UNKNOWN` vs `PAST|PRESENT|FUTURE|ONGOING`). **No chrono-node / Duckling / Luxon.** Event extraction often relies on entry metadata dates, not text.

### 1.5 Memory lifecycle & retrieval
- **Governance-first and genuinely advanced:** Memory Review Queue (`memory_proposals`/`memory_decisions`, risk classification, auto-approve LOW), omega **truth states** (`CANONICAL|CONTEXTUAL|REVISED|DISPUTED|INFERRED|PENDING_VERIFICATION`), **provenance edges**, **knowledge crystallization** (recurring patterns → durable `crystallized_knowledge`), accessibility **decay** modulated by emotion.
- **Retrieval is dual-engine:** `WorkingMemoryAssembler` (structured SQL + heuristic ranking; the hot path) **plus** a full hybrid RAG stack (`memoryRetriever.ts`: BM25 + pgvector + MMR + LLM rerank + personalized PageRank). Internal audits note ~19 queries/turn.
- **Known wiring gaps:** ingestion **Step 11 MRQ is a TODO stub**; omega `storeClaim` writes **before** MRQ review (parallel-write tension).

### 1.6 Life compiler / narrative
- **Two compilers:** the epistemic **EntryIR / LNC** (`services/compiler/*`, utterance → `entry_ir`) and the **NarrativeIR / Life Compiler** (`narrative/narrativeCompilerService.ts` + `continuityRuntime/arcs/lifeArcSynthesisService.ts`). NarrativeIR is **computed at read time, not persisted**. Scene/turning-point detection is **regex-based**.

### 1.7 Timeline
- **4–6 parallel assembly models:** stitched chronology (newest, `chronologyV2/stitchedTimelineService.ts`), unified `timeline_events` sync, swimlane page service, character timeline events, flexible `timelines`, life-arc containers. Web still has a **dummy-data fallback** when APIs return empty.

---

## 2. Fit-score matrix

Fit = strategic value of the *idea* to LoreBook (1–5). Complexity = integration/operational cost. Recommendation is the headline action.

| System   | Purpose | Fit (1–5) | Integration complexity | Recommendation |
|----------|---------|:---------:|:----------------------:|----------------|
| **Duckling** | Temporal NL parsing | 4 | **High** (Haskell service) → but the *capability* fit is 5 | **Integrate the capability via `chrono-node`** (in-process JS); Duckling itself = Avoid |
| **Dedupe / Splink** | Probabilistic record linkage | 3 | Medium–High (Python / training data) | **Inspiration now; consolidate JW first; Splink later** if cross-store linkage becomes core |
| **TypeDB** | Entity-role DB + rule inference | 4 (concept) / 2 (adopt now) | **High** (second DB, TypeQL, polyglot persistence) | **Inspiration only** — adopt the *role + rule inference* model in Postgres first |
| **Neo4j** | Graph database | 3 | **High** (second source of truth, sync) | **Defer** — consolidate edges in Postgres + recursive CTEs / Apache AGE first |
| **Zep / Graphiti** | Memory infrastructure | 2 (LoreBook is ahead) | Medium | **Inspiration only** — borrow bi-temporal edge model + lifecycle API shape |
| **Logseq** | PKM / backlinks UX | 3 (UX) | Low (UX patterns) / N/A (engine) | **Inspiration only** — adopt backlinks/linked-references; avoid manual-linking + outliner model |

---

## 3. System-by-system deep dive

### 3.1 TypeDB — entity-relation-role database with inference

**What it is.** A strongly-typed database where the schema is a *conceptual model*: entities, **relations**, and **roles** that entities play within relations, plus a **rule engine** that infers new facts at query time (e.g., "if X is parent of Y and Y is parent of Z, infer X is grandparent of Z"). TypeQL is its query language.

**Where it overlaps LoreBook.** This is the single closest conceptual match to LoreBook's *documented gaps*:
- LoreBook's `entity_relationships` is already "polymorphic + role-ish" (`works_for`, `recruits_for`) but has **no inference** — every derived relationship (grandparent, in-law, "lives with", co-member) must be hand-written or extracted.
- The **family/household reasoning** and **community membership** features are exactly the "role + rule inference" use case TypeDB exists for. `docs/family-graph-audit.md` / `docs/recall-benchmark.md` describe traversal/inference gaps that TypeDB rules would solve declaratively.

**Would adopting it simplify things?** *Conceptually yes, operationally no — not yet.* TypeDB would become a **second source of truth** alongside Postgres, requiring dual-write/sync, a new query language across the team, and a less mature operational ecosystem than Postgres. LoreBook's identity data is already fragmented; routing relationships to a separate engine before unifying the existing five edge tables would deepen the split-brain problem.

**Which services could be replaced?** In principle: the hand-rolled relationship-derivation logic and the missing multi-hop traversal. In practice, **none should be replaced now** — the prerequisite (one canonical entity + edge model) doesn't exist yet.

**Which should remain custom?** Extraction (lexical/LLM), authority/merge verdicts, and governance (MRQ) — TypeDB doesn't do these.

**Recommendation: Inspiration only (now).** Steal the **role-based relation model** and **declarative rule inference** idea and implement a *first pass* in Postgres: a single typed `edges` table + **recursive CTEs** for transitive inference (grandparent, household co-residence, community membership) + materialized "inferred edge" rows with provenance. Re-open the TypeDB question only if (a) edges are unified, and (b) rule-based inference becomes a core, performance-sensitive product surface.

- **Fit:** 4 concept / 2 adopt-now · **Complexity:** High · **Verdict:** Inspiration → maybe a derived inference store later, never the primary store.

---

### 3.2 Neo4j — graph database

**What it is.** A mature property-graph database with Cypher, optimized for deep traversal and pathfinding.

**Where it overlaps LoreBook.** Directly addresses the **documented multi-hop recall gap**: family-tree traversal, "who lives with me", connected-memory recall, social-graph queries. Today these are flat edge fetches or 1-hop neighbor loads in `workingMemoryAssembler.ts`.

**Is it worth introducing now? No.** The problem LoreBook has is not "Postgres can't traverse" — it's "there are five different edge tables and three person stores, so there is no single graph to traverse." Adding Neo4j now means:
- A **second source of truth** to keep in sync with Postgres (the system of record for governance, RLS, billing, everything else).
- Dual-write complexity on every ingestion path (already 12+ steps).
- Operational burden (new DB, backups, RLS-equivalent tenant isolation, ops expertise).

**Which PostgreSQL structures would benefit / migration shape.** The right sequencing:
1. **Unify edges** into one table (`docs/graph-migration-plan.md` already proposes merging `character_relationships` → a unified `edges` table). One `nodes` view over the three entity stores.
2. Use **recursive CTEs** for bounded multi-hop (family/household) and **`pg_trgm`** for fuzzy joins.
3. If traversal depth/QPS outgrows Postgres, adopt **Apache AGE** (Cypher *inside* Postgres — no second DB) before reaching for standalone Neo4j.
4. Standalone Neo4j only if graph becomes a first-class, high-traffic product (e.g., an interactive relationship explorer at scale).

- **Fit:** 3 · **Complexity:** High · **Verdict:** Defer. Consolidate-in-Postgres first; AGE before Neo4j.

---

### 3.3 Duckling — temporal & natural-language date parsing

**What it is.** Facebook's probabilistic NL parser (Haskell) for dates, times, durations, ranges, numbers. Runs as a **separate service**.

**Where it overlaps LoreBook.** Squarely on a real, painful gap: LoreBook resolves "today / yesterday / last year / when I worked at Vanguard" across **4+ duplicated regex engines** with **two incompatible scope enums** and no shared library. This is textbook reinvention.

**Should LoreBook integrate Duckling, or keep building internally?** *Neither extreme.* Keep building the **domain-specific** parts internally (entity-anchored windows like "when Sol and I…", employment-era resolution) — Duckling can't do those. But **stop hand-rolling generic relative-date parsing**.

**The right tool is `chrono-node`, not Duckling.** Duckling is a Haskell service → a new runtime, deployment, and network hop, for a problem that doesn't need a microservice. `chrono-node` is pure JS, in-process, zero new infra, and covers the generic cases (relative dates, ranges, durations, casual phrasing) that the 4+ regex engines approximate today.

**Plan:**
1. Introduce a single `temporalResolver` module wrapping `chrono-node` for generic NL dates.
2. Keep `temporalAnchorResolver` for LoreBook-specific anchors, layered *on top of* chrono output.
3. Collapse the two scope enums into one.
4. Migrate `timeEngine`, `knowledgeTypeEngineService`, `essenceRefinementEngine`, `ruleBasedFactExtraction` callers onto it; delete the duplicated regex.

- **Fit:** 4 (capability 5) · **Complexity:** Low (chrono) / High (Duckling) · **Verdict:** Integrate `chrono-node`; Duckling = Avoid (over-engineered for the need).

---

### 3.4 Dedupe — probabilistic entity matching

**What it is.** `dedupe` (Python) and the more modern **Splink** implement **probabilistic record linkage** (Fellegi–Sunter), with blocking, learned field weights, and active-learning labeling. Splink runs on DuckDB/Spark via SQL — far easier to operate than python-`dedupe`.

**Where it overlaps LoreBook.** `entityAuthorityService` + the per-domain `*DuplicateScore` functions + `characterDeduplicationService` are LoreBook's record-linkage layer. Today they are **deterministic** (JW + Jaccard + rules), **scattered**, and the JW implementation is **duplicated**.

**Could it improve `entityAuthorityService` plans? Yes, but not first.** The immediate wins are cheaper and lower-risk than introducing a probabilistic linkage engine + training-data workflow:
1. **Consolidate** the duplicated Jaro-Winkler into one util; centralize all thresholds (extend `config/aiThresholds.ts`).
2. Add **blocking** (candidate generation) explicitly — `pg_trgm` indexes in Postgres give cheap, fast blocking and trigram similarity.
3. *Then* evaluate **Splink** for the hard, high-value case: **cross-store identity resolution** (`characters` ↔ `people_places` ↔ `omega_entities`), where probabilistic field-weighted matching genuinely beats hand-tuned thresholds.

**Which duplicate classes benefit most?**
- **Highest:** cross-store person identity (the bridging-map problem) — probabilistic linkage shines when matching across heterogeneous schemas.
- **Medium:** places/venues (already decent with canonical-name + Jaccard; `pg_trgm` would help).
- **Lowest:** projects/orgs (lower volume; rules suffice).

**Recommendation: Inspiration now, Splink later.** Borrow the *concepts* (blocking → pairwise scoring → learned thresholds), consolidate the deterministic layer first, and reserve probabilistic linkage for cross-store identity once entities are unified.

- **Fit:** 3 · **Complexity:** Medium–High · **Verdict:** Inspiration → Splink as a later, targeted addition for cross-store linkage.

---

### 3.5 Zep — memory infrastructure

**What it is.** A memory layer for LLM apps: sessions, message history, automatic summarization, fact extraction, and (via **Graphiti**) a **bi-temporal knowledge graph** of facts with validity intervals.

**Where it overlaps LoreBook.** Memory promotion, recall, user profiles, long-term memory — but here **LoreBook is the more advanced system on the dimensions that matter most**:
- LoreBook has **explicit epistemic governance** (MRQ, risk classification, truth states, provenance edges, contradiction handling, crystallization) that commodity memory libs do not.
- LoreBook has a **domain ontology** (characters-as-authority, romantic intelligence, kinship glossary) that Zep is deliberately domain-agnostic about.

**Memory-lifecycle concepts worth borrowing:**
1. **Bi-temporal edges (from Graphiti):** every fact/edge carries both *event time* and *ingestion/validity time* (`valid_at` / `invalid_at`). LoreBook already has `temporal_edges` + `relationship_snapshots` — formalizing the bi-temporal model would clean up "this was true then, revised now" without bespoke logic.
2. **A clean, small memory-lifecycle API surface.** LoreBook's lifecycle is powerful but sprawls across `omegaMemoryService`, MRQ, crystallization, semanticConversion, and a stubbed Step 11. A single documented `MemoryLifecycle` facade (observe → propose → review → promote → decay) would reduce the wiring-gap risk.
3. **Session/summary primitives** as a first-class abstraction (LoreBook reconstructs this per-thread).

**Which LoreBook systems are already more advanced?** Governance (MRQ), truth-state machine, provenance graph, crystallization, character authority, and emotion-modulated decay. Adopting Zep wholesale would be a **downgrade** on these.

- **Fit:** 2 · **Complexity:** Medium · **Verdict:** Inspiration only — adopt the bi-temporal edge model + a lifecycle facade; do not replace the governance layer.

---

### 3.6 Logseq — personal knowledge graph

**What it is.** A local-first PKM tool: outliner blocks, `[[wiki-links]]`, **backlinks / linked & unlinked references**, daily journals, and a local graph view.

**Where it overlaps LoreBook.** Linked thinking, journaling, graph exploration. But the philosophies differ fundamentally: **Logseq is manual-first** (the user creates links), **LoreBook is automatic-first** (extraction creates links). That difference dictates what to borrow.

**UX concepts worth adopting:**
1. **Backlinks / linked references** on every entity page — "everywhere this character/place/project is mentioned." LoreBook has the data (`character_memories`, `*_mentions`, provenance edges); it lacks the *unified backlink surface*.
2. **Unlinked references** — "mentions we detected but haven't linked yet." This maps perfectly onto LoreBook's candidate/review model and would make the MRQ feel native.
3. **Daily journal as a first-class spine** for navigation.
4. **Local graph view** for a single entity's neighborhood (pairs well with the edge-consolidation work).

**What to avoid:**
1. **Forcing manual `[[wiki-link]]` syntax** — it contradicts LoreBook's core value (automatic extraction). Offer links as *confirmations*, not authoring.
2. **Outliner-everything** block model — wrong fit for narrative/biographical content.
3. **File-based / local-first storage** — incompatible with LoreBook's multi-tenant Postgres + RLS + governance.

- **Fit:** 3 (UX) · **Complexity:** Low (UX) · **Verdict:** Inspiration only — backlinks/linked-references + unlinked-references-as-MRQ; avoid manual linking and the outliner/file model.

---

## 4. LoreBook-specific answers

### 4.1 Biggest architectural risks today

Ranked by long-term impact on maintainability and product success:

1. **Entity & relationship store fragmentation (CRITICAL).** Three person stores (`characters`, `people_places`, `omega_entities`) + five+ edge stores, bridged by maps. This is the root cause of merge complexity, recall gaps, and most "the AI forgot / duplicated someone" bugs. **Everything else is downstream of this.**
2. **Wiring gaps in the memory pipeline (HIGH).** Ingestion **Step 11 MRQ is a stub**; omega `storeClaim` persists **before** MRQ review; `entity_conflicts` has no writer. The governance system is excellent in design but **not fully connected** — review proposals can pile up or be bypassed.
3. **Temporal logic duplication (HIGH).** 4+ relative-date parsers + 2 scope enums → inconsistent date semantics across features. Cheap to fix, high blast radius if left.
4. **Timeline/narrative model sprawl (MEDIUM-HIGH).** 4–6 timeline assembly paths, two "compilers", ephemeral (unpersisted) NarrativeIR, three "current chapter" sources, and a **dummy-data fallback masking empty backends** (`useTimelineData`). Hard to reason about; risk of shipping fake data.
5. **Dual retrieval engines & query fan-out (MEDIUM).** WMA + MemoryRetriever (~19 queries/turn) — powerful but a latency/cost and maintenance liability.
6. **Operational single points of failure (MEDIUM).** In-process ingestion queue (work lost on crash/restart), and OpenAI calls scattered across 50+ services with no model router (provider lock-in, no fallback, hard cost control — see `docs/openai-cost-audit.md`).

### 4.2 Which systems should remain proprietary and core

These are the differentiation. **Keep, invest, do not outsource:**
- **Ontology Engine** (glossary → canonical RootType → classifier). The anti-pollution classifier ("PERSON requires evidence") and glossary-driven hierarchy are a genuine moat.
- **Lexical Intelligence Engine** (deterministic pre-LLM signal extraction). Fast, cheap, explainable; nothing open-source replicates this domain layer.
- **Knowledge Authority / MRQ / truth-states / provenance.** This governance layer is *ahead* of commodity memory infra and is the trust backbone of the product.
- **Family / Relationship Intelligence** (domain rules, romantic/vicarious intelligence, kinship reasoning).
- **Life / Narrative Compiler** (arc synthesis, chapters, turning points) — the storytelling output is the product's soul.

### 4.3 Best used as inspiration only
- **TypeDB** — role + rule-inference model (implement in Postgres first).
- **Zep / Graphiti** — bi-temporal edges + lifecycle API shape.
- **Logseq** — backlinks / linked & unlinked references UX.
- **Neo4j** — graph thinking (apply via AGE/CTEs short-term).
- **Dedupe** — blocking + probabilistic scoring concepts.

### 4.4 Worth integrating directly
- **`chrono-node`** — now. Highest ROI, lowest cost. Consolidates temporal parsing.
- **`pg_trgm`** (already in Postgres) — for blocking/fuzzy joins in dedupe.
- **Apache AGE** (Cypher in Postgres) — *if/when* multi-hop traversal is needed, before any standalone graph DB.
- **Splink** — later, narrowly, for cross-store identity linkage once entities are unified.

### 4.5 If designing LoreBook from scratch today

Keep the moat; replace the fragmented plumbing. Concretely:

- **One canonical entity model:** a single `entities` table (typed by RootType) + a single typed, **bi-temporal** `edges` table with roles and provenance. No parallel person stores; discovery/mention data hangs off the canonical entity, not beside it.
- **One database:** Postgres + pgvector for vectors, **`pg_trgm`** for fuzzy, **recursive CTEs / Apache AGE** for traversal. Add a specialized DB only when a measured limit is hit.
- **One ingestion pipeline** with a **durable** queue (Postgres-backed or Redis/BullMQ), idempotent steps, and MRQ fully wired (no stubs, no write-before-review).
- **One temporal resolver** (`chrono-node` + LoreBook anchors, single scope enum).
- **One retrieval orchestrator** (merge WMA + hybrid RAG into a single budgeted assembler) with an explicit query budget.
- **One model router** in front of OpenAI (centralized cost/fallback/observability; AI Gateway-style).
- **Unchanged:** Ontology, Lexical Intelligence, Knowledge Authority/MRQ, Family Intelligence, Life Compiler. These are the product.

The headline: **a from-scratch LoreBook would have *fewer* moving parts, not more** — one entity graph, one pipeline, one temporal resolver, one retrieval path — with the same (proprietary) intelligence on top.

---

## 5. Reinvention vs. differentiation

The most important section.

### 5.1 Where LoreBook is reinventing things that already exist (stop or consolidate)

| Area | Current (hand-rolled) | Commodity alternative | Action |
|------|----------------------|----------------------|--------|
| **Relative-date NL parsing** | 4+ regex engines, 2 enums | `chrono-node` | **Replace generic parsing**, keep domain anchors |
| **String similarity** | Duplicated Jaro-Winkler, scattered thresholds | One util + `pg_trgm`; Splink later | **Consolidate** |
| **Candidate blocking for dedupe** | Implicit / O(n²) scans | `pg_trgm` GIN indexes | **Add blocking** |
| **Graph traversal** | Ad-hoc BFS in one service | Recursive CTEs / Apache AGE | **Adopt CTEs/AGE** before any graph DB |
| **Ingestion queue** | In-process, lost on crash | Postgres queue / BullMQ | **Make durable** |
| **LLM access** | OpenAI scattered across 50+ services | Model router / gateway | **Centralize** |
| **Hybrid RAG vs WMA** | Two parallel retrieval stacks | One budgeted assembler | **Merge** |
| **Multiple timeline models** | 4–6 assembly paths | One canonical timeline read model | **Converge on stitched chronology** |

### 5.2 Where LoreBook is building genuine differentiation (protect & invest)

| Area | Why it's a moat |
|------|-----------------|
| **Ontology + anti-pollution classifier** | Deterministic, explainable typing that prevents junk→character pollution. No OSS equivalent for this domain. |
| **Lexical Intelligence** | Pre-LLM, deterministic signal extraction — fast, cheap, auditable. A real architectural advantage. |
| **MRQ + truth states + provenance + crystallization** | Epistemic governance that is *ahead* of Zep-class memory infra. The trust layer. |
| **Family / romantic / relationship intelligence** | Domain reasoning (kinship, vicarious relationships, households) that generic graph/memory tools don't provide. |
| **Life / Narrative Compiler** | Arc synthesis → chapters → turning points: the storytelling that makes LoreBook a *product*, not a database. |
| **Emotion-modulated decay & salience** | A nuanced memory-salience model most systems lack. |

**Rule of thumb:** if it's *plumbing* (parsing, similarity, queues, traversal, model access, retrieval mechanics), prefer the boring commodity solution. If it's *meaning* (ontology, epistemics, narrative, relationships), keep it proprietary and invest.

---

## 6. Recommended roadmap

Sequenced so each phase de-risks the next. No phase introduces a second database; that decision is deferred until the foundation is consolidated.

### Phase 0 — Consolidation & wiring (weeks, not months) — *do these regardless*
- **Wire MRQ end-to-end:** finish ingestion Step 11; resolve the omega `storeClaim`-before-review tension; decide `entity_conflicts` writer or remove dead UI.
- **Consolidate Jaro-Winkler** into one util; centralize all thresholds in `config/aiThresholds.ts`.
- **Remove the timeline dummy-data fallback** (`useTimelineData`) so empty backends are visible, not masked.
- **Add `pg_trgm`** indexes for blocking on entity name columns.

### Phase 1 — Temporal consolidation (high ROI, low risk)
- Introduce `temporalResolver` wrapping **`chrono-node`**; layer LoreBook anchors on top.
- Collapse the two temporal-scope enums into one; migrate callers; delete duplicated regex.

### Phase 2 — Entity & edge unification (the big one)
- Define **one canonical `entities` model** and **one typed, bi-temporal `edges` table** (per `docs/graph-migration-plan.md`). Backfill from `characters`/`people_places`/`omega_entities` via `character_authority_map`/`entity_canonical_map`.
- Flip `entityResolutionCore` from `shadow` → `on` once shadow metrics confirm parity.
- Borrow **Graphiti's bi-temporal** validity model for edges.

### Phase 3 — Traversal & inference in Postgres
- Add **recursive-CTE** family/household/community traversal to close the documented recall gap (no new DB).
- Implement **rule-based inference** (grandparent, in-law, co-residence, membership) as materialized inferred edges with provenance — the *TypeDB idea*, in Postgres.
- Evaluate **Apache AGE** if CTEs hit limits.

### Phase 4 — Retrieval & ops hardening
- Merge **WMA + hybrid RAG** into a single budgeted assembler; cap queries/turn.
- Make the ingestion queue **durable**; add a **model router** in front of OpenAI (cost, fallback, observability).

### Phase 5 — Selective probabilistic linkage & UX
- Pilot **Splink** for **cross-store person identity** only.
- Ship **backlinks / linked & unlinked references** (Logseq-inspired); render unlinked references *as* MRQ candidates.

### Deferred (revisit with data, not now)
- **Neo4j / TypeDB as primary stores.** Only if, after Phases 2–3, graph traversal/inference is demonstrably a core, high-QPS surface that Postgres+AGE can't serve. Treat as a *derived* store if adopted at all — never the system of record.

---

## 7. Migration-risk summary

| Move | Risk | Mitigation |
|------|------|-----------|
| Adopt `chrono-node` | Low — behavior diffs on edge phrasing | Shadow-compare against existing regex; keep anchors |
| Unify entity/edge stores | **High** — touches every ingestion/recall path | Backfill + dual-read behind a flag; `entityResolutionCore` shadow metrics first |
| Recursive CTE traversal | Medium — query performance at depth | Bound depth; index; cache inferred edges |
| Durable queue swap | Medium — ingestion is hot path | Run dual; drain old in-process queue first |
| Model router | Low–Medium — 50+ call sites | Introduce as a thin client wrapper; migrate incrementally |
| Splink (cross-store) | Medium — needs labels + Python/DuckDB | Offline batch first; human-in-the-loop via existing authority apply flow |
| Neo4j / TypeDB | **High** — second source of truth | Don't, until Phases 2–3 prove the need; derived store only |

---

## 8. One-paragraph executive summary

LoreBook's genuine differentiation is its **epistemic and narrative intelligence** — ontology, lexical extraction, knowledge authority/MRQ, relationship reasoning, and the life compiler — and those should stay proprietary and get investment. Its biggest risk is **internal fragmentation** (three person stores, five+ edge tables, four+ temporal parsers, multiple timeline models, partially-wired governance), not a missing piece of open-source tech. The correct strategy is therefore **consolidate before you import**: adopt `chrono-node` to kill the temporal duplication, unify the entity/edge model in Postgres (with `pg_trgm`, recursive CTEs, and bi-temporal edges borrowed from Graphiti), wire MRQ end-to-end, and centralize model access — *then*, and only if measured need appears, evaluate Splink for cross-store linkage and AGE/Neo4j/TypeDB for graph inference as **derived** stores. Use TypeDB, Neo4j, Zep, Logseq, and Dedupe as **inspiration**; integrate only `chrono-node` directly now. Optimize for fewer moving parts carrying the same intelligence.
