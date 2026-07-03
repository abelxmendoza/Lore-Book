# LoreBook Architecture Consolidation Report

> **Purpose.** This is not a feature inventory. It is a grounded audit of *where LoreBook
> stores the same thing more than once, computes the same thing more than once, and claims
> authority over the same thing in more than one place* — and a plan to converge those down.
> Every table, service, and overlap below was verified against `apps/server/src`,
> `apps/web/src`, and `supabase/migrations`. Companion document:
> [`docs/open-source-architecture-review.md`](./open-source-architecture-review.md).

**Optimize for:** simplicity, maintainability, correctness — **not** feature count.
**Status:** Draft for engineering review.

> **Pre-deletion gate (2026-06-18):** See
> [`docs/pre-deletion-salvage-audit.md`](./pre-deletion-salvage-audit.md). Phase 0 drops done.
> **`timelines_v2`** → `life_arcs`. **`people_places`** chat hot path fully redirected (Phase 1a+1b);
> ingestion/verification helpers still use legacy table.

---

## 0. Executive summary

LoreBook's intelligence (ontology, lexical extraction, knowledge authority/MRQ, relationship
and narrative reasoning) is genuinely differentiated and should be protected. The liability is
**structural fragmentation in the storage and assembly layers**:

| Dimension | Count today | Target |
|---|---:|---:|
| Person/entity stores | **4** (`characters`, `omega_entities`, `people_places`, `entities`) | **1 canonical + mention log** |
| Relationship/edge stores | **8** (`character_relationships`, `entity_relationships`, `omega_relationships`, `romantic_relationships`, `social_edges`, `graph_edges`, `temporal_edges`, `relationship_snapshots`) | **1 typed bi-temporal edge table + derived projections** |
| Event stores | **3** (`resolved_events`, `timeline_events`, `character_timeline_events`) | **1 canonical event + per-entity projection** |
| "Arc" namespaces | **3** (`life_arcs`, `timeline_arcs`, analytics `arcs`) | **1** |
| Timeline assembly paths (read-time) | **~14** | **1 stitched read model** |
| Retrieval paths | **~10** (2–4 run per chat turn) | **1 budgeted assembler** |
| Relationship-detection write paths | **6** | **1 ER dispatcher** |
| Standalone classifiers | **6+** | **2** (chat-mode + extraction-cost) |
| Relative-date parsers | **3–4** | **1 resolver** |

**The single most important finding:** there is no one place that answers "who is this person,
what are they to me, and when was that true." That question is currently answered by 4 entity
stores, 8 edge stores, and 3 event stores, reconciled by bridge maps — one of which
(`entity_canonical_map`) has **zero application writers**. Almost every "the AI forgot / the AI
duplicated someone / the timeline is wrong" class of bug is downstream of this.

**Strategy:** *consolidate before you import.* Do not add a graph database, a second runtime,
or new features until the entity/edge/event/timeline models are unified in the Postgres you
already run. The end state has **fewer moving parts carrying the same intelligence**.

---

## 1. Current Architecture Map

### 1.1 Layered view

```
┌─────────────────────────────────────────────────────────────────────────┐
│  INGESTION (ConversationIngestionPipeline)                                │
│  normalize → split → classify → extract → resolve → persist → schedule    │
└─────────────────────────────────────────────────────────────────────────┘
        │ writes                          │ writes                  │ schedules
        ▼                                 ▼                         ▼
┌───────────────────────┐   ┌──────────────────────────┐   ┌──────────────────┐
│  ENTITY STORES (4)     │   │ RELATIONSHIP STORES (8)  │   │ INFERENCE (T0-T2) │
│  characters  ◄canonical│   │ character_relationships  │   │ graph recovery,   │
│  omega_entities        │   │ entity_relationships     │   │ normalization,    │
│  people_places (legacy)│   │ romantic_relationships   │   │ public figures,   │
│  entities (generic)    │   │ omega_relationships(dead)│   │ standing,         │
│  + bridges:            │   │ social_edges (names)     │   │ importance        │
│   character_authority  │   │ graph_edges (mem-comp)   │   └──────────────────┘
│   entity_canonical(✗)  │   │ temporal_edges (derived) │
└───────────────────────┘   │ relationship_snapshots   │
        │                    └──────────────────────────┘
        │                                 │
        ▼                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  EVENT / TIMELINE STORES                                                    │
│  journal_entries (raw moments, authoritative)                              │
│  resolved_events │ timeline_events │ character_timeline_events  (3 events) │
│  life_arcs │ timeline_arcs │ analytics arcs  (3 "arc" namespaces)          │
│  episodes (chat scenes) │ entry_ir (LNC) │ chronology_index (derived)      │
└───────────────────────────────────────────────────────────────────────────┘
        │ read-time assembly (~14 paths)
        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  RETRIEVAL (~10 paths; 2–4 per chat turn via buildRAGPacket)              │
│  WorkingMemoryAssembler ◄primary │ MemoryRetriever+RAG │ entityScoped      │
│  contextAware │ explicitRecall→MRE │ storyRecall │ contractAware │ HQI     │
└───────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  INTELLIGENCE (cross-cutting)                                              │
│  Ontology (glossary→RootType→classifier) │ Lexical Intelligence           │
│  Query/Mode classification │ Relationship/Family/Romantic detection        │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.2 The two parallel interpretation pipelines

There are **two** message-interpretation pipelines, not one:

- **Ingestion pipeline** — `services/conversationCentered/ingestionPipelineClass.ts`: normalize →
  hybrid extract → resolve entities → ER/relationship/romantic/kinship hooks → events.
- **Lore interpretation pipeline** — `services/pipeline/loreInterpretationPipeline.ts`: lexical →
  meaning → ontology enrichment → lexical relationship persistence. Runs inside `omegaChatService`
  and the `/routes/lexical` + `/routes/meaning` surfaces.

They overlap heavily (both classify, both extract entities, both persist relationships) but neither
is a strict superset of the other.

---

## 2. Subsystem audit

Each card answers the six required questions: **Responsibility · Owns · Overlaps · Authoritative or derived · Can merge? · Verdict (remain / merge / retire)**.

### 2.A ENTITIES

#### `characters`
- **Responsibility:** Rich person/character profile cards (names, aliases, pronouns, importance, proximity, biography metadata, self/protagonist identity, 1536-dim embedding).
- **Owns:** Canonical person identity. `supabase/migrations/20240101000001_setup_all_tables.sql`.
- **Overlaps:** `omega_entities` (PERSON type), `people_places`, `entities` — same humans stored 2–4×.
- **Authoritative or derived:** **Authoritative.** `characterAuthorityService.ts` header literally declares *"Authority = characters.id"*. Single creation gate is `characterRegistry.ts`.
- **Can merge?** It is the merge *target*, not a merge source.
- **Verdict:** **REMAIN — promote to the single canonical entity store** (typed by RootType, not just "character").

#### `omega_entities`
- **Responsibility:** Omega Memory Engine nodes; anchors `omega_claims`/`omega_evidence`; stores LOCATION/ORG/EVENT and mention-tracked PERSON nodes (embedding, mention_count/status).
- **Owns:** Non-person entity types (LOCATION/ORG/EVENT) + the omega claim graph. `20250102000009_omega_memory_engine.sql`.
- **Overlaps:** `characters` for PERSON (split-brain: profile card vs truth node).
- **Authoritative or derived:** **Authoritative for non-person types**; non-canonical for persons.
- **Can merge?** Yes — fold non-person types into the canonical `entities` model; route person nodes to `characters` via authority map.
- **Verdict:** **MERGE** into the canonical entity model (keep the claims/evidence graph, retire the parallel person identity).

#### `people_places`
- **Responsibility:** Legacy mention-frequency discovery index (co-occurrence counts, `total_mentions`, `related_entries`, `corrected_names`). Migration comment says *"legacy support"*.
- **Owns:** Discovery/mention statistics — *not* rich profiles.
- **Overlaps:** `characters` (discovery → promotion), `entity_mentions`.
- **Authoritative or derived:** **Derived/legacy.** `characterAuthorityService.ts`: *"people_places is a legacy discovery source, not authority."* Still written by `peoplePlacesService.ts` and read in WMA, recall, biography.
- **Can merge?** Its *signal* (mention counts) should become columns/rows hanging off the canonical entity, not a parallel table.
- **Verdict:** **RETIRE** after migrating mention stats onto the canonical entity + a unified mention log.

#### `entities` (4th, generic)
- **Responsibility:** Generic entity-resolution table (`canonical_name`, `type`, `aliases`). `20250223000079_entities.sql`. Lowest priority in `EntityRegistry.ts` resolution order (`characters → omega_entities → people_places → entities`).
- **Authoritative or derived:** Derived/secondary; read/written via `entityFactsService.ts`.
- **Verdict:** **MERGE/RETIRE** into the canonical entity model.

#### Bridges
- `character_authority_map` (`20260616140000_…`) — **actively maintained** map of every person-like row → `characters.id`. **REMAIN** during migration; becomes unnecessary once stores unify.
- `entity_canonical_map` (`20260529000008_…`) — anchored on `omega_entities.id`, **migration-seed only, zero application writers, zero readers**. **RETIRE** (it is a dead alternate bridge that competes with `character_authority_map`).

> **Entity verdict:** Four person/entity stores collapse to **one canonical `entities` table (typed by RootType) + one mention log**. `characters` is the spine; `omega_entities` non-person types and `people_places`/`entities` fold in; `entity_canonical_map` is dead and should be dropped.

---

### 2.B RELATIONSHIPS

#### `character_relationships`
- **Responsibility:** Person↔person social/family/romantic edges between `characters.id` UUIDs.
- **Owns:** Inter-person edges. `20240101000001_setup_all_tables.sql`.
- **Overlaps:** `romantic_relationships` (romance), `social_edges` (name-keyed), `temporal_edges` (derived mirror).
- **Authoritative or derived:** **Authoritative** for person↔person edges via the ER dispatcher (`er/writeRelationship.ts`, contract `er/erSchema.ts`).
- **Verdict:** **REMAIN as the basis of the unified edge table** (rename concept to `edges`, typed + polymorphic).

#### `entity_relationships`
- **Responsibility:** Scoped polymorphic cross-type edges (`works_for`, `vendor_for`, `part_of`) between characters and omega entities, with scope/evidence/validity. `20250121000034_entity_scopes_relationships.sql`.
- **Authoritative or derived:** **Authoritative** for scoped cross-type edges.
- **Overlaps:** `character_relationships` (both written by `writeRelationship.ts`), `temporal_edges`.
- **Verdict:** **MERGE** with `character_relationships` into one typed, polymorphic edge table (they already share a writer).

#### `omega_relationships`
- **Responsibility:** Intended omega graph edges between `omega_entities`. `20250102000009_…`.
- **Authoritative or derived:** **Designed authoritative but DEAD** — no insert/upsert anywhere in app code; only rewired on merge. LLM extraction builds in-memory `Relationship[]` and never persists here.
- **Verdict:** **RETIRE** (schema-only dead weight).

#### `romantic_relationships`
- **Responsibility:** Rich romance/dating domain model (type, love_status, affection/compatibility/health scores, situationship fields) + child tables (`romantic_dates`, `romantic_interactions`, `relationship_breakups`).
- **Owns:** The Dating & Romance book. `20250126000043_…`, reshaped `20260611200000_…`.
- **Overlaps:** `character_relationships` (`ROMANTIC_INTEREST`, `SPOUSE_OF`, `DATED` exist in `er/erSchema.ts`). Written by a **separate path** (`romanticRelationshipDetector.ts`, `romanticLexicalIngestionService.ts`) that bypasses `writeRelationship.ts`.
- **Authoritative or derived:** Authoritative for the romance domain.
- **Can merge?** Partially: the *edge* ("X is my girlfriend, valid 2024–now") belongs in the unified edge table; the *rich analytics* (affection scores, dates, breakups) stay in a domain extension keyed by edge id.
- **Verdict:** **MERGE the edge, KEEP the domain extension.** Route the core relationship through the ER dispatcher; hang romance-specific columns/children off the canonical edge.

#### `social_edges`
- **Responsibility:** Derived co-mention social-network analytics, keyed by **person name strings** (not UUIDs), with weight/sentiment/interactions. `20250223000095_social_network_engine.sql`. Written by `social/socialStorage.ts` from enrichment jobs.
- **Authoritative or derived:** **Derived analytics.**
- **Overlaps:** `character_relationships` (string-keyed shadow of the same graph).
- **Verdict:** **RETIRE or rebuild as a derived view** over the unified edge table (string keys are a correctness liability; they don't survive merges/renames).

#### `graph_edges`
- **Responsibility:** Memory-component knowledge graph (`memory_components` ↔ `memory_components`), BFS depth 3 in `knowledgeGraphService.ts`. **Not a person graph.** `20250126000042_…`.
- **Authoritative or derived:** Derived from memory analysis.
- **Verdict:** **REMAIN** (different domain) — but document clearly that it is *not* the entity graph, to stop confusion.

#### `temporal_edges` + `relationship_snapshots`
- **Responsibility:** Derived temporal projection of `character_relationships` + `entity_relationships` (validity intervals, episodic closure, phase/confidence). `20260124000147_…`. Written by `er/temporalEdgeService.ts` on every ER write.
- **Authoritative or derived:** **Derived projection.**
- **Verdict:** **MERGE the concept INTO the unified edge table** as native bi-temporal columns (`valid_at`/`invalid_at`), eliminating the separate projection. This is the Graphiti bi-temporal model applied in place.

> **Relationship verdict:** Eight edge stores collapse to **one typed, polymorphic, bi-temporal `edges` table** (basis: `character_relationships` + `entity_relationships` + temporal columns) **+ domain extensions** (romance analytics) **+ derived views** (social analytics). `omega_relationships` is dead → drop. `graph_edges` is a different (memory-component) domain → keep but rename/document.

---

### 2.C TIMELINES / STORY

#### Event stores — `resolved_events` / `timeline_events` / `character_timeline_events`
- **Responsibility:** `resolved_events` (`20250223000097_temporal_events.sql`) = unified WHO/WHERE/WHAT/WHEN; `timeline_events` (`20250325000134_…`) = task/normalizer-sourced events; `character_timeline_events` (`20250127000044_…`) = per-character projection (FK → `resolved_events`).
- **Overlaps:** All three represent "an event" and surface in different assembly/retrieval paths.
- **Authoritative or derived:** `resolved_events` authoritative (written by `timelineFoundationService.ts`); `character_timeline_events` derived projection; `timeline_events` authoritative-but-parallel for task events.
- **Verdict:** **MERGE on `resolved_events`** as the one canonical event; keep `character_timeline_events` as a derived per-entity index; fold `timeline_events` task sources into `resolved_events` via a source_type.

#### `chronology_index` + chronology engines (V1 + V2)
- **Responsibility:** `chronology_index` (`20250201000053_…`) = derived temporal index over `journal_entries`. `chronologyV2/chronologyService.ts` (ordering, gaps, buckets) supersedes V1 `chronology/chronologyEngine.ts` (causal chains, ephemeral), but both are still mounted on the same router.
- **Authoritative or derived:** `journal_entries` authoritative; index derived.
- **Verdict:** **REMAIN (V2) / RETIRE (V1).** Keep `chronology_index` as the derived ordering source; retire ChronologyEngine V1.

#### `episodes` (conversation segmentation)
- **Responsibility:** Deterministic chat-message → scene boundaries. `20260616180000_episodes.sql`, `episodeSegmentationCore.ts` (pure) + persistence + trigger.
- **Critical bug/overlap:** **Naming collision.** `WorkingMemoryAssembler` labels `journal_entries` as `type: 'episode'` and `lifeArcSynthesisService` provenance "episodes" both mean *journal entries*, **not** the `episodes` table — which **no retrieval path consumes.**
- **Authoritative or derived:** Authoritative for conversation episodes (but currently orphaned from retrieval).
- **Verdict:** **REMAIN + WIRE IN** (or retire if the segmentation isn't used). Rename the WMA/synthesis "episode" label to avoid the collision either way.

#### `life_arcs` vs `timeline_arcs` vs analytics `arcs`
- **Responsibility:** Three separate "arc" namespaces: `life_arcs` (`20260527000001_…`, continuity runtime, user-created + inferred), `timeline_arcs` (part of the 9-layer hierarchy `20250120000033_…`), analytics `arcs` (`20250201000052_…`, read by `ragBuilderService`).
- **Overlaps:** Three tables, three meanings of the same word; `ragBuilder` uses analytics arcs while `timelineManager` uses hierarchy arcs and continuity uses `life_arcs`.
- **Verdict:** **MERGE to one arc model** (`life_arcs`), with the hierarchy as an optional layer on top; retire analytics `arcs`/`eras`/`sagas` as a parallel hierarchy.

#### Narrative outputs — `lifeArcSynthesisService` / `lifeArcService` / `narrativeCompilerService` / LNC `entry_ir`
- **Responsibility:** Three narrative-over-events generators (synthesis projection, LLM "recent arc", NarrativeIR compiler) + the epistemic EntryIR/LNC compiler (`services/compiler/*`, persisted to `entry_ir`).
- **Persistence:** Synthesis + NarrativeIR are **ephemeral** (30s cache); `entry_ir` is **persisted but isolated** from timeline/WMA.
- **Overlaps:** Three paths produce "current chapter / arcs / turning points."
- **Verdict:** **MERGE the three narrative generators** into one narrative service over the canonical event/arc model. **Keep `entry_ir`** but decide its role: either wire it into retrieval or scope it explicitly as the epistemic audit layer.

#### `timelines_v2` (broken)
- **Responsibility:** Intended v2 timeline CRUD (`timelineV2.ts`, `TimelinePageV2.tsx`). **No migration exists** for `timelines_v2`/`timeline_v2_memberships`; web falls back to mocks.
- **Verdict:** **RETIRE** (dead code referencing non-existent tables).

> **Timeline verdict:** ~14 read-time assembly paths converge to **one stitched read model** (`stitchedTimelineService` is the only path already merging moments + events + user order). One canonical event (`resolved_events`), one arc model (`life_arcs`), one narrative generator, V1 chronology + `timelines_v2` retired, `episodes` either wired in or retired, and the "episode" mislabel fixed.

---

### 2.D RETRIEVAL

#### `WorkingMemoryAssembler` (primary)
- **Responsibility:** Intent classify → resolve entities → load candidates from ~20 tables → budgeted rank → `WorkingMemoryPacket`. `chat/workingMemoryAssembler.ts`. Now the single authoritative packet (`routeRecallQuery` was removed from normal LLM context).
- **Authoritative or derived:** Derived (ephemeral assembly).
- **Verdict:** **REMAIN — become the one retrieval orchestrator.**

#### `MemoryRetriever` + RAG (`services/rag/*`, 9 modules)
- **Responsibility:** Hybrid semantic retrieval (BM25 + pgvector + MMR + rerank + PPR boost) over `journal_entries`. Still the default `relatedEntries` provider in `ragBuilderService`.
- **Overlaps:** Duplicates WMA journal/event reads.
- **Verdict:** **MERGE into WMA** as its semantic-recall stage (keep the RAG modules as internal stages, not a parallel engine).

#### `entityScopedRetriever` / `contextAwareMemoryRetrieval` / `explicitRecall→MemoryRecallEngine` / `storyRecall` / `contractAwareMemoryRetriever` / HQI / orchestrator lore
- **Responsibility:** Six more retrieval paths, each specialized (entity arc, thread/timeline context, explicit recall fallback, scene/person reconstruction, contract/epistemic, keyword, tag-summary).
- **Overlaps:** All re-read `journal_entries`/`resolved_events`/person tables that WMA already loads; `MemoryRecallEngine` is a subset of `MemoryRetriever`; story recall overlaps entity-scoped + WMA person loaders.
- **Verdict:** **MERGE the recall-style paths into WMA stages**; keep only genuinely distinct *modes* (e.g., contract/epistemic) behind one orchestrator with an explicit query budget. Target: **≤1 assembler, capped queries/turn** (audits note ~19 queries/turn today).

> **Retrieval verdict:** ~10 paths → **one budgeted assembler (WMA)** with pluggable internal stages (semantic, entity-scoped, thread-context, story). Hard cap on queries/turn.

---

### 2.E INTELLIGENCE

#### Ontology Engine
- **Responsibility:** Governed vocabulary + deterministic typing. `ontology/canonical/rootType.ts` (root vocab), `ontology/glossary.ts` (keyword source of truth), `entities/entityClassifier.ts` (PERSON-requires-evidence anti-pollution classifier), `placeIntelligence`/`groupIntelligence` (subtyping), `classificationService` (persisted subcategories).
- **Owns:** RootType vocabulary, classification rules, `classifications` table.
- **Overlaps:** Kinship duplicated with `kinship/kinshipGlossary.ts`; typing overlaps `entityMentionClassifier` + `lexicalIntelligence.discoverEntities`.
- **Authoritative or derived:** **Authoritative** for entity typing + vocabulary; place/group classifiers advisory.
- **Verdict:** **REMAIN — this is the moat.** Consolidate the duplicated kinship dictionary into the glossary (the glossary comment already claims it does this, but both still exist).

#### Lexical Intelligence
- **Responsibility:** Deterministic pre-LLM signal/candidate extraction. Two stacks: `ontology/lexicalIntelligence.ts` (phases) and `services/lexical/*` (detector modules) + `extractionSignals.ts` (LLM gating).
- **Authoritative or derived:** **Advisory** until a downstream writer persists.
- **Overlaps:** Two lexical stacks; romantic lexical rules duplicated between `ontology/romanticIntelligence.ts` and glossary verbs.
- **Verdict:** **REMAIN (protect) but UNIFY the two stacks** into one lexical service with one glossary.

#### Query / Mode Classification
- **Responsibility:** Routing. `modeRouter/modeRouterService.ts` (chat macro-mode), `conversationCentered/patternClassifier.ts` (extraction cost), `chat/questionIntentClassifier.ts` (recall sub-intent), `lexicalIntelligence.classifyQueryType`, `entityMentionClassifier`, plus an unrelated personal-strategy ML classifier.
- **Authoritative or derived:** Advisory (no canonical facts).
- **Overlaps:** **6+ classifiers**; query-typing duplicated across three of them.
- **Verdict:** **MERGE to two** — one chat-mode/intent classifier and one extraction-cost classifier; everything else delegates to those.

#### Relationship Detection
- **Responsibility:** Turn text into edges. **6 write paths**: `entityRelationshipDetector` (LLM, called *twice* per message — directly and via `unifiedErIngestion`), `relationshipPersistenceService` (lexical), `relationshipFoundationService` (batch/kinship), `familyGraphInferenceService` (protagonist kinship), romantic detectors, `relationshipPeripheralService`.
- **Overlaps:** Same LLM detector saves through two code paths (duplicate-edge risk on one message); three edge stores targeted.
- **Authoritative or derived:** Several claim authority over the same edges.
- **Verdict:** **MERGE behind the single ER dispatcher** (`er/writeRelationship.ts`) so every detector is a *source* feeding one validated, deduped write path. Fix the double-call in the ingestion pipeline.

#### Family Intelligence
- **Responsibility:** Kinship + household inference. `kinship/familyGraphInferenceService.ts` (writes `character_relationships` + family `organizations`), `householdInferenceService.ts` (household orgs), read models `familyGraphService`/`householdService`/`familyTreeService`.
- **Overlaps:** Kinship represented in ~5 places; household in ~4.
- **Authoritative or derived:** Authoritative for protagonist↔kin edges + inferred household orgs; rest derived.
- **Verdict:** **REMAIN (domain moat) but route writes through the ER dispatcher** and source kinship terms from the single glossary.

#### Romantic Intelligence
- **Responsibility:** The Love book. Lexical (`romanticLexicalIngestionService` + `ontology/romanticIntelligence`) + LLM (`romanticRelationshipDetector`) + breakup/drift/cycle + vicarious periphery + scoring/analytics.
- **Overlaps:** Lexical + LLM both write `romantic_relationships` on the same turn (reinforce/duplicate); romantic types also appear in the general relationship detectors; vicarious logic duplicated (`vicariousRomanticIntelligence` nested in `vicariousRelationshipIntelligence`); 3 paths to "ended/ghosted".
- **Authoritative or derived:** Authoritative for romance; periphery advisory; scoring derived.
- **Verdict:** **REMAIN (domain moat) but converge the write path** (lexical proposes → one persist), route the core edge through ER, and de-duplicate the vicarious modules.

---

## 3. Authority Matrix

Who is the **system of record** for each concept (vs. who else writes/derives it).

| Concept | Authoritative store/service | Parallel / derived writers (the problem) | Target authority |
|---|---|---|---|
| Person identity | `characters` (`characterRegistry`, `characterAuthorityService`) | `omega_entities` (PERSON), `people_places`, `entities` | **`characters` = canonical `entities`** |
| Non-person entity (LOC/ORG/EVENT) | `omega_entities` | `entities`, `people_places` (places) | **canonical `entities` (typed)** |
| Person↔person edges | `character_relationships` via `er/writeRelationship` | `relationshipFoundationService`, `relationshipPersistenceService`, `familyGraphInferenceService`, lexical | **unified `edges` via ER dispatcher** |
| Scoped cross-type edges | `entity_relationships` via ER | `entityRelationshipDetector` (direct save), `relationshipPersistenceService` | **unified `edges`** |
| Romance edges | `romantic_relationships` | lexical + LLM both write; ER has romantic types too | **unified `edges` + romance extension** |
| Edge temporal validity | `temporal_edges` (derived) | — | **bi-temporal columns on `edges`** |
| Omega claim graph | `omega_entities` + `omega_claims` | — | **keep (claims), drop `omega_relationships`** |
| Social analytics graph | `social_edges` (name-keyed, derived) | — | **derived view over `edges`** |
| Memory-component graph | `graph_edges` | — | **keep (distinct domain)** |
| Raw moments | `journal_entries` | — | **keep** |
| Structured events | `resolved_events` (`timelineFoundationService`) | `timeline_events`, `character_timeline_events` | **`resolved_events` canonical** |
| Per-character event view | `character_timeline_events` (derived) | — | **keep as projection** |
| Chronological order | `chronology_index` + `user_chronology_order` | chronology V1, `memoryService.getTimeline` | **`chronology_index` (+ user order)** |
| Arcs | `life_arcs` | `timeline_arcs`, analytics `arcs` | **`life_arcs` canonical** |
| Conversation episodes | `episodes` (orphaned from retrieval) | WMA mislabels journals as "episode" | **`episodes` (wired or retired)** |
| Epistemic representation | `entry_ir` (LNC) | — | **keep (audit layer)** |
| Entity typing | `entityClassifier` + RootType | `entityMentionClassifier`, lexical discovery | **ontology engine (canonical)** |
| Chat routing | `modeRouterService` | `questionIntentClassifier`, `patternClassifier`, lexical query-type | **2 classifiers** |
| Cross-store identity bridge | `character_authority_map` (active) | `entity_canonical_map` (**dead**) | **drop both after unification** |

**Authority smells (fix first):**
1. `entity_canonical_map` claims to be the canonical bridge but has no writers/readers — **delete**.
2. `omega_relationships` claims to be the omega graph but has no writers — **delete**.
3. `romantic_relationships` is written by two independent paths that bypass the ER dispatcher — **route through ER**.
4. `entityRelationshipDetector.saveRelationship` is called twice per message (direct + `unifiedErIngestion`) — **dedupe**.
5. WMA/synthesis call `journal_entries` "episodes" while the real `episodes` table goes unread — **rename + wire**.

---

## 4. Duplication Matrix

| # | Duplicated capability | Concrete instances | Impact | Action |
|---|---|---|---|---|
| 1 | **Person store** | `characters`, `omega_entities`, `people_places`, `entities` | Merge complexity, "duplicate person" bugs, recall gaps | Unify on `characters`→canonical `entities` |
| 2 | **Edge store** | `character_relationships`, `entity_relationships`, `omega_relationships`, `romantic_relationships`, `social_edges`, `temporal_edges`(+snapshots), `graph_edges` | No single graph to traverse | One bi-temporal `edges` + extensions/views |
| 3 | **Event store** | `resolved_events`, `timeline_events`, `character_timeline_events` | Triple event semantics in assembly | Canonical `resolved_events` |
| 4 | **"Arc" namespace** | `life_arcs`, `timeline_arcs`, analytics `arcs` | Same word, 3 tables | One arc model |
| 5 | **Timeline assembly** | ~14 read-time paths (chapter-month, multi-lane, chronology V1/V2, stitched, calendar, hierarchy, narrative, synthesis, recent-arc, character, broken v2…) | Hard to reason about; fake data risk | Converge on stitched read model |
| 6 | **Retrieval** | ~10 paths (WMA, MemoryRetriever, entity-scoped, context-aware, explicit recall, MRE, story recall, contract, HQI, orchestrator) | ~19 queries/turn, latency/cost | One budgeted assembler |
| 7 | **Relationship-detection writers** | 6 (LLM ×2 call sites, lexical, batch/kinship, family, romantic, peripheral) | Duplicate/competing edges | One ER dispatcher; detectors as sources |
| 8 | **Classifiers** | 6+ (mode, pattern, question-intent, entity, mention, lexical query-type) | Inconsistent routing | 2 classifiers |
| 9 | **Romantic write path** | lexical + LLM on same turn + batch rescan + periphery | Duplicate romance rows | Lexical proposes → one persist via ER |
| 10 | **Kinship dictionary** | `glossary.ts` FAMILY, `kinshipGlossary.ts`, `lexicalIntelligence.scoreKinshipInContext`, detector family types | Drift between dictionaries | One glossary |
| 11 | **Temporal parsing** | `temporalAnchorResolver`, `services/timeEngine`, (+ `services/time/timeEngine` analytics), regex in extractors | Inconsistent date semantics | One `temporalResolver` (chrono-node + anchors) |
| 12 | **Interpretation pipeline** | ingestion pipeline + lore interpretation pipeline | Two ways to interpret a message | Define one primary; other delegates |
| 13 | **Dead schema** | `omega_relationships`, `entity_canonical_map`, `timelines_v2` (no migration) | Confusion, false authority | Drop |
| 14 | **Web dummy/fallback data** | 11 mock/fallback sites for timelines/arcs/chronology | Masks empty backends; risk of shipping fake data | Gate behind explicit demo flag; remove silent fallbacks |

---

## 5. Consolidation Opportunities (ranked & sequenced)

Sequenced so each step de-risks the next. **No second database. No new features until Phase 3.**

### Phase 0 — Delete dead weight & fix authority smells (days)
*Zero-risk wins that shrink the surface immediately.*
- Drop `omega_relationships`, `entity_canonical_map`, and the `timelines_v2`/`TimelinePageV2` code path (no backing migration).
- Fix the double `entityRelationshipDetector.saveRelationship` call in the ingestion pipeline.
- Rename the WMA/synthesis "episode" label (journal entries) to stop the collision with the `episodes` table; decide wire-in vs retire for `episodes`.
- Put all web timeline mock/fallback behind one explicit demo flag; remove silent "API empty → dummy data" paths.

### Phase 1 — Collapse the obviously-derived layers (1–2 weeks)
- Retire chronology V1 (`ChronologyEngine`) in favor of V2; unmount the old route.
- Make `stitchedTimelineService` the single timeline read model; route all timeline UIs through it; retire chapter-month, multi-lane-from-analytics, and ad-hoc assemblers.
- Collapse the 3 narrative generators (`lifeArcSynthesisService`, `lifeArcService`, `narrativeCompilerService`) into one narrative service.
- Unify the 6+ classifiers to 2; unify the two lexical stacks and the kinship dictionaries to one glossary.

### Phase 2 — Unify events & arcs (2–4 weeks)
- Canonicalize on `resolved_events`; fold `timeline_events` task sources in via `source_type`; keep `character_timeline_events` as a derived projection.
- Collapse `life_arcs` / `timeline_arcs` / analytics `arcs` to one arc model.

### Phase 3 — Unify the edge model (the big one) (4–8 weeks)
- One typed, polymorphic, **bi-temporal** `edges` table (basis: `character_relationships` + `entity_relationships` + `valid_at`/`invalid_at` from `temporal_edges`). Romance/social become an extension + a derived view.
- **Every** detector writes through `er/writeRelationship.ts` (validation + dedupe). No direct saves.
- Rebuild `social_edges` as a view; drop the name-keyed table.

### Phase 4 — Unify the entity model (4–8 weeks)
- One canonical `entities` table typed by RootType; `characters` is the spine. Backfill non-person `omega_entities` + `people_places` + `entities` via `character_authority_map`; migrate mention stats to a single mention log. Flip `entityResolutionCore` from `shadow` → `on` once metrics confirm parity. Drop `character_authority_map` when sources are gone.

### Phase 5 — Unify retrieval & temporal (2–4 weeks)
- One budgeted assembler (WMA) with internal stages (semantic = former MemoryRetriever, entity-scoped, thread-context, story). Hard cap queries/turn. Retire MRE/standalone recall paths.
- One `temporalResolver` (chrono-node + LoreBook anchors); one temporal-scope enum; delete duplicated regex.

### Deferred (revisit only with data)
- Graph DB (Neo4j/TypeDB) or Apache AGE — only if, after Phases 3–4, multi-hop traversal/inference is a proven, high-QPS surface Postgres + recursive CTEs can't serve. Derived store only, never the system of record.

---

## 6. Recommended Future Architecture

```
                         ┌──────────────────────────────────┐
                         │      ONE INGESTION PIPELINE        │
                         │ normalize → classify → extract →   │
                         │ resolve → ER dispatch → schedule   │
                         └──────────────────────────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              ▼                         ▼                          ▼
   ┌────────────────────┐   ┌──────────────────────┐   ┌────────────────────┐
   │  entities          │   │  edges               │   │  events            │
   │  (typed by RootType)│  │  (typed, polymorphic, │  │  resolved_events    │
   │  + mention log      │  │   bi-temporal)        │  │  + per-entity view  │
   │  + omega claims     │  │  + romance extension  │  │  + arcs (one model) │
   │                     │  │  + social view        │  │  + episodes (wired) │
   └────────────────────┘   └──────────────────────┘   └────────────────────┘
              │                         │                          │
              └─────────────────────────┴──────────────────────────┘
                                        │
                         ┌──────────────────────────────────┐
                         │   ONE TIMELINE READ MODEL          │
                         │   (stitched: moments+events+order) │
                         └──────────────────────────────────┘
                                        │
                         ┌──────────────────────────────────┐
                         │   ONE BUDGETED RETRIEVAL ASSEMBLER │
                         │   (WMA: semantic+entity+thread+story stages, capped) │
                         └──────────────────────────────────┘
                                        │
                         ┌──────────────────────────────────┐
                         │   INTELLIGENCE (the moat, intact)  │
                         │   Ontology · Lexical · 2 classifiers│
                         │   Relationship/Family/Romantic (→ER)│
                         │   Narrative compiler (one) · LNC    │
                         └──────────────────────────────────┘
                                        │
                         ┌──────────────────────────────────┐
                         │   ONE temporalResolver · ONE glossary │
                         └──────────────────────────────────┘
```

**Principles:**
- **One store per concept.** One entity model, one edge model, one event model, one arc model, one timeline read model, one retrieval assembler.
- **Authority is singular and explicit.** Exactly one writer-of-record per concept; everything else is a *source* feeding it or a *derived* view reading it.
- **Bi-temporal by default.** Edges/events carry event-time and validity-time; "true then, revised now" is data, not bespoke logic.
- **Intelligence stays proprietary.** Ontology, lexical, MRQ/authority, relationship/family/romantic reasoning, narrative compiler — unchanged in capability, just feeding unified stores.
- **Postgres only.** pgvector for vectors, `pg_trgm` for fuzzy, recursive CTEs for traversal. New infrastructure only against a measured limit.

---

## 7. LoreBook one year from now (if consolidation succeeds)

**The shape:**
- **One graph.** A single canonical `entities` table (typed by RootType) and a single typed, bi-temporal `edges` table. "Who is this person, what are they to me, and when was that true" is answered by *one* query, not by reconciling four entity stores and eight edge tables. The "duplicate person" and "the AI forgot X" bug classes are largely gone because there is only one place for X to live.
- **One timeline, one event.** Every event is a `resolved_events` row; every timeline UI reads the stitched model; arcs are one model. No dummy-data fallbacks masking empty backends — empty looks empty.
- **One retrieval path.** Chat builds context through a single budgeted assembler with a hard query cap. Latency and OpenAI cost are predictable; there is one place to tune recall quality instead of ten.
- **The intelligence is unchanged — and now trustworthy.** The ontology, lexical engine, knowledge authority/MRQ, family/romantic reasoning, and narrative compiler are the same moat, but every fact they produce lands in one governed place, through one validated write path, with provenance and bi-temporal validity. The product can finally *prove* why it believes something.
- **Fewer, deeper systems.** Roughly: 4 entity stores → 1; 8 edge stores → 1 (+2 satellites); 3 event stores → 1; 3 arc namespaces → 1; ~14 timeline paths → 1; ~10 retrieval paths → 1; 6+ classifiers → 2; 3–4 temporal parsers → 1; dead schema → 0.

**What it feels like to work on:** a new engineer can draw the data model on a whiteboard. Adding a relationship type, a new entity kind, or a timeline surface touches *one* store and *one* assembler, not five. Correctness bugs have one place to be fixed. The team spends its time on meaning (ontology, narrative, relationships) instead of plumbing (sync, bridges, fallbacks).

**The one-sentence vision:** *In a year, LoreBook is the same intelligence on a third of the moving parts — one entity graph, one timeline, one retrieval path, one temporal resolver — so that every memory has exactly one home and the product can be trusted about what it knows.*

---

## 8. Migration risk summary

| Move | Risk | Mitigation |
|---|---|---|
| Drop dead schema (`omega_relationships`, `entity_canonical_map`, `timelines_v2`) | Low | Confirm zero readers (verified); drop behind a migration |
| Remove web dummy fallbacks | Low | Gate behind explicit demo flag; show empty states |
| Collapse classifiers / lexical stacks | Low–Med | One at a time; shadow-compare routing decisions |
| Unify events & arcs | Medium | Backfill + dual-read behind a flag |
| Unify edges (bi-temporal) | **High** — touches every ingestion/recall path | ER dispatcher already exists; route all detectors through it first, then migrate stores; dual-read |
| Unify entities | **High** | `character_authority_map` already maps sources; backfill + `entityResolutionCore` shadow metrics before flip |
| Merge retrieval paths | Medium | Fold engines into WMA stages behind a flag; cap queries; compare packets |
| Temporal consolidation | Low | chrono-node shadow-compare; keep anchors |
| Graph DB | **High** | Deferred; derived store only, never source of truth |

---

### Appendix — exploration provenance

This report synthesizes three grounded codebase explorations (entity/relationship stores; timeline/retrieval systems; intelligence subsystems) plus
[`docs/open-source-architecture-review.md`](./open-source-architecture-review.md). All tables were verified against `supabase/migrations`; all services against `apps/server/src`. Where a table or path is called "dead/broken," it was confirmed to have no application writers/readers or no backing migration at the time of writing.
