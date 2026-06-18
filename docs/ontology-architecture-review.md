# Ontology & Lexical Intelligence Architecture Review — Phase 2

> **Companion to** `docs/open-source-architecture-review.md` (Phase 1). Phase 1
> concluded that LoreBook's differentiation is its *epistemic/meaning* layer and
> its biggest risk is *internal fragmentation*. This phase goes one level deeper:
> it evaluates the newly-built **Ontology Engine** and **Lexical Intelligence
> Engine** and asks whether they should become the **foundation of all future
> intelligence** — and what has to be consolidated for that to be true.

**Verdict up front:** Yes — the `glossary → ontology → RootType` spine is the single
cleanest, most reusable abstraction in the codebase and *should* become the primary
intelligence layer. But today it is a **well-designed core surrounded by parallel
taxonomies**: kinship is independently re-implemented in at least **4 places**, and
`EntityType` is re-declared in **~10 files**. Making the ontology the foundation is
less about building more and more about **deleting duplicates and routing everything
through the glossary**.

---

## 0. What actually exists today (grounded)

Read directly from source:

### The clean spine (keep, promote)
- **`ontology/canonical/rootType.ts`** — the governed vocabulary: a stable `RootType` union (~20: `PERSON, FAMILY, GROUP, ORGANIZATION, LOCATION, EVENT, PROJECT, PRODUCT, APP, BRAND, MEDIA, SKILL, PET, VEHICLE, FOODDRINK, POSSESSION, CONCEPT, GOAL, TIME, UNKNOWN`) + `CHARACTER_ELIGIBLE_ROOTS = {PERSON}`. This is the join key every layer *should* share.
- **`ontology/glossary.ts`** — the keyword source of truth. `GLOSSARY: GlossaryEntry[]` maps keyword + aliases → `domain: RootType`, `category`, `subcategory`, `weight`, `confidence`, and optional `relationshipHint`/`queryHint`/`actionHint`/`surfaceTarget`/`generation`. ~90 entries spanning kinship, venues, events, groups, relationship verbs, nav verbs, essence/shadow/identity signals. `lookupKeyword()` + `glossaryAliases()` give longest-alias-first lookup.
- **`ontology/ontology.ts`** — derives the `ROOT → CATEGORY → SUBCATEGORY → KEYWORDS → ALIASES` tree *from the glossary* (`buildOntology()`), so adding a keyword extends the tree automatically. Holds root metadata + surface maps (`DISCOVERY_SURFACES`, `BOOK_SURFACES`, `ONTOLOGY_LAYER_LABELS`).
- **`ontology/lexicalIntelligence.ts`** — deterministic, pre-LLM understanding built *entirely on the glossary*: `discoverEntities()`, `discoverRelationshipHints()`, `classifyQueryType()`, `classifyActionIntent()`, `classifyDiscoverySurface()`, `discoverInsightSignals()`, `enrichEntity()`, plus context-aware `scoreKinshipInContext()`.
- **`ontology/canonical/mappers.ts`** — the convergence adapter: maps `LexicalEntityType`, `EntityClass`, and `LlmEntityType` → `RootType` (totality-tested). This is the *mechanism* by which fragmentation could be eliminated — it's underused.

### The intended unified resolver (built, not yet authoritative)
- **`entities/entityResolutionCore.ts`** — a pure, deterministic `resolveMention(mention, candidates, context)` that resolves by **context** (thread co-occurrence +0.4, recent episodes +0.22, relationship overlap, recency, importance), not string distance, and only disambiguates below a 0.18 margin. Its own header says it exists to collapse "characterRegistry, entityResolutionService, entityResolver, EntityRegistry, certifiedEntityIndexService, peoplePlacesService dedup" into one brain. **Phase 1 found it runs in `shadow` mode by default** (`ENTITY_RESOLUTION_CORE=shadow`) — built, wired, but not yet trusted as authority.

### The kinship/household/family layer (parallel, duplicated)
- **`kinship/kinshipGlossary.ts`** — its **own** `KinshipRole` union (15 roles incl. `SPOUSE, CHILD, STEPMOTHER, STEPFATHER, NIECE, NEPHEW, IN_LAW`), its **own** `TITLE_ONLY` / `TITLED_PERSON` regex tables, and its **own** confidences — entirely independent of `glossary.ts`'s FAMILY entries.
- **`kinship/familyGraphInferenceService.ts`** — after promotion, asserts protagonist kinship edges (`relationshipFoundationService.assertProtagonistKinship`) and auto-creates a "family" `organizations` row when ≥2 kin co-occur.
- **`kinship/householdInferenceService.ts`** — infers a household (also stored as a `type='family'` organization) from residence/"lives with" language, assigns `head_of_household`/`resident`/`visitor` roles.

### Identity bridges
- **`character_authority_map`** (`characterAuthorityService.ts`) — maps `people_places`/`omega_entities`/`characters` → canonical `characters.id`.
- **`entity_canonical_map`** — bridge across omega ↔ people_places ↔ entities.

**The shape of the problem:** the glossary spine is excellent and centralized. Everything *downstream* of it (kinship, places, groups, entity types, relationship types) still carries its **own** copy of the taxonomy.

---

## 1. Is the ontology + lexical layer becoming LoreBook's primary intelligence layer?

**Yes — and it should be made so explicitly.** It already is the de-facto primary layer for *understanding* (typing, discovery, query classification, kinship-in-context, surface routing), and it has the three properties a foundation needs:

1. **Single source of truth that fans out by construction** — `ontology.ts` builds its tree from `glossary.ts`; add a keyword and classification, search, and the explorer all gain it. No other subsystem has this property.
2. **Deterministic, explainable, cheap** — pre-LLM, regex/lookup based, every output carries a `reason`. This is the opposite of the LLM-extraction layers and is exactly what you want as the *first* pass.
3. **Anti-pollution by design** — `CHARACTER_ELIGIBLE_ROOTS = {PERSON}`, `HINT_ONLY_CATEGORIES`, scene/handle guards in `scoreKinshipInContext`. This is the trust backbone.

**But it is not yet the *primary* layer in the operational sense**, because:
- Several services still classify entities with their **own** enums instead of resolving to `RootType` (see §4).
- `entityResolutionCore` — the piece that would make ontology-driven resolution authoritative — is in **shadow mode**.
- Kinship, the highest-value domain, is reasoned about by **four** independent code paths, only one of which is the glossary.

**Recommendation:** Declare the ontology/lexical layer the **canonical Stage 1** of all ingestion and query handling, set an explicit invariant ("no service may define an entity/relationship/kinship taxonomy; all classification resolves to `RootType` via `mappers.ts`"), and flip `entityResolutionCore` to `on` once shadow metrics confirm parity. That converts "de-facto" into "by contract."

---

## 2. Should all ingestion flow through the proposed pipeline?

Proposed:

```
Text → Lexical Intelligence → Ontology → Entity Resolution → Relationship Resolution
     → Temporal Resolution → Memory Review → Storage
```

**Yes — this is the right canonical pipeline, with three refinements.** It matches the grain of the existing code (lexical is already pre-LLM and deterministic) and it fixes the Phase 1 risks (parallel writes, MRQ bypass) by making **Memory Review the single gate before Storage**.

Refinements grounded in what exists:

1. **Lexical + Ontology are one stage, not two.** In code they're already fused (`lexicalIntelligence.ts` imports the glossary directly; `ontology.ts` is derived from it). Treat them as **Stage 1: Deterministic Understanding** producing typed candidates (`{surface, RootType, category, confidence, hints}`) — which is exactly what `discoverEntities()`/`enrichEntity()` already emit.

2. **Add an explicit LLM-extraction stage *after* lexical, feeding the same shape.** Today the LLM extractors (`omegaMemoryService.extractEntities`, hybrid extractor) run somewhat in parallel. They should be **Stage 1b**, normalized through `mappers.ts` into the *same* `RootType` candidate shape, so resolution sees one merged candidate set regardless of origin. Deterministic lexical results should **seed and constrain** the LLM, not compete with it.

3. **Make the gate real.** Phase 1 found ingestion **Step 11 MRQ is a stubbed TODO** and omega `storeClaim` writes **before** review. The proposed pipeline only delivers value if **nothing reaches `Storage` except through `Memory Review`**. This is the single most important wiring change.

Target shape:

```
Text
 → Stage 1  Deterministic Understanding   (glossary + lexicalIntelligence → typed candidates)
 → Stage 1b LLM Extraction (constrained)   (normalized via mappers.ts → same shape)
 → Stage 2  Entity Resolution              (entityResolutionCore, context-ranked, ON)
 → Stage 3  Relationship Resolution        (one relationship resolver; see §3/§4)
 → Stage 4  Temporal Resolution            (one resolver: chrono-node + anchors, per Phase 1)
 → Stage 5  Memory Review (MRQ)            ← the ONLY path to write
 → Storage                                 (unified entity + edge model; see §6)
```

Caveat: queries and ingestion share **Stages 1–2** but diverge after (queries hit retrieval, not MRQ). The lexical layer's `classifyQueryType`/`classifyActionIntent` already serve the query side — keep that symmetry explicit.

---

## 3. Which existing services should be refactored to consume `glossary.ts` as the single source of truth?

These services currently embed their own lexicons/regex/keyword tables that duplicate the glossary. Priority order:

| Priority | Service | Today | Refactor to |
|:--------:|---------|-------|-------------|
| **P0** | `kinship/kinshipGlossary.ts` | Own `KinshipRole` + regex tables | Derive roles/aliases/generation from `GLOSSARY` FAMILY entries; keep only the *extraction regex* that the glossary can't express, sourced from glossary aliases |
| **P0** | `entities/entityResolutionCore.ts` (`KINSHIP_ROLE`) | Own kinship regex array | Use glossary FAMILY aliases for kinship-role equivalence |
| **P0** | `ontology/lexicalIntelligence.ts` (`inferRelationshipRole`, `FAMILY_CONTEXT`) | Hard-coded family regex | Generate from glossary FAMILY aliases (it already uses `lookupKeyword`; finish the job) |
| **P1** | `ontology/placeIntelligence.ts` (`classifyPlace`) + `constants/placeTypes.ts` | Own place category table | Resolve place categories from glossary `LOCATION` categories/subcategories |
| **P1** | `ontology/groupIntelligence.ts` (`classifyGroup`) + `constants/groupTypes.ts` | Own group/social category table | Resolve from glossary `GROUP`/`ORGANIZATION` categories |
| **P1** | `entityClassifier.ts` | Deterministic classifier w/ its own keyword guards | Back its keyword logic with glossary lookups; keep anti-pollution rules |
| **P2** | `conversationCentered/entityRelationshipDetector.ts` | Own `RelationshipType` | Resolve relationship kinds from glossary `relationshipHint` taxonomy |
| **P2** | `meaning/meaningResolutionTypes.ts` (`RelationshipRole`) | Parallel relationship roles | Consume one shared relationship taxonomy |
| **P2** | `omegaChatService` / hybrid extractor LLM prompts | Free-form entity/relationship labels | Constrain prompts to `RootType` + glossary categories; normalize outputs via `mappers.ts` |
| **P3** | `routes/lexical.ts`, `routes/ontology.ts` | Already glossary-backed | Keep; expose glossary version/hash for cache busting |

**Guiding rule:** a service may keep **algorithmic** code (regex matching, scoring, DB I/O) but must not own a **vocabulary**. Vocabularies (entity types, kinship roles, place/group categories, relationship kinds, query intents) come from the glossary / `RootType`.

---

## 4. Which duplicated taxonomies still exist?

This is the core fragmentation finding. Verified by grepping type definitions and classifiers.

### 4.1 `EntityType` is redefined in ~10 files
Each of these declares its **own** entity-type union, mostly overlapping, none of them `RootType`:

| File | Definition |
|------|-----------|
| `ontology/canonical/rootType.ts` | `RootType` (~20) — **the canonical one** |
| `ontology/canonical/mappers.ts` | `EntityClass`, `LlmEntityType` |
| `lexical/lexicalTypes.ts` | `LexicalEntityType` |
| `types/omegaMemory.ts` | `EntityType` (omega) |
| `entityFactsService.ts` | `EntityType = 'character'\|'organization'\|'location'` |
| `er/erSchema.ts` | `EntityType` |
| `compiler/symbolTable.ts` | `EntityType = 'PERSON'\|'CHARACTER'\|'LOCATION'\|'ORG'\|'EVENT'\|'CONCEPT'` |
| `entityResolutionService.ts` | `EntityType = 'CHARACTER'\|'LOCATION'\|'ENTITY'\|'ORG'\|'CONCEPT'\|'PERSON'` |
| `entities/types.ts` | `EntityType = 'person'\|'place'\|'org'\|'event'\|'thing'\|'unknown'` |
| `ingestion/types/unifiedExtraction.ts` | `EntityType = LlmEntityType` |

Note the casing chaos alone (`PERSON` vs `person` vs `CHARACTER`), which forces ad-hoc translation at every boundary.

### 4.2 Relationship taxonomies (≥6)
- `glossary.ts` `RelationshipHint` (7: FAMILY/SOCIAL/ROMANTIC/WORK/MENTOR/ADVERSARIAL/CREATIVE)
- `lexical/lexicalTypes.ts` `RelationshipRole`
- `meaning/meaningResolutionTypes.ts` `RelationshipRole`
- `conversationCentered/entityRelationshipDetector.ts` `RelationshipType`
- `er/erSchema.ts` `RelationshipType`
- `continuityRuntime/arcs/arcRelationshipService.ts` `RelationshipType`

### 4.3 Kinship taxonomies (4 independent implementations)
- `glossary.ts` FAMILY entries (8 roles, `generation` offsets, aliases) — the canonical one
- `kinship/kinshipGlossary.ts` `KinshipRole` (15 roles, own regex tables, own confidences)
- `entities/entityResolutionCore.ts` `KINSHIP_ROLE` (own regex array)
- `ontology/lexicalIntelligence.ts` `inferRelationshipRole` + `FAMILY_CONTEXT` (own regex)

Four sources for the **highest-value** domain in the product (family). They already drift (`kinshipGlossary` has STEP*/IN_LAW/NIECE/NEPHEW; the glossary does not).

### 4.4 Place & group/social categories (≥3 each)
- Places: `constants/placeTypes.ts`, `ontology/placeIntelligence.ts` (`classifyPlace`), `lexical/lexicalTypes.ts` `PlaceCategory`, glossary `LOCATION` categories.
- Groups/social: `constants/groupTypes.ts`, `ontology/groupIntelligence.ts`, `society/societyResolver.ts` + `societyMapper.ts`, glossary `GROUP` categories.

### 4.5 Temporal (carried from Phase 1)
- Two scope enums (`MOMENT|PERIOD|ONGOING|UNKNOWN` vs `PAST|PRESENT|FUTURE|ONGOING`) + 4 relative-date regex engines.

**The good news:** `mappers.ts` already exists to collapse `LexicalEntityType`/`EntityClass`/`LlmEntityType` → `RootType`, and it's totality-tested. The fix is largely *deletion + re-pointing*, not new design.

---

## 5. Which systems should be replaced by ontology-driven classification?

"Replace" = delete the bespoke vocabulary/classifier and route through the glossary/`RootType`. Ranked by ROI:

| System | Action | Why |
|--------|:------:|-----|
| The 10 ad-hoc `EntityType` unions (§4.1) | **Replace** | Collapse to `RootType` at the boundaries via `mappers.ts`; keep narrow storage-type aliases only where a table column truly differs |
| `kinshipGlossary.ts` role table | **Replace (extend glossary)** | Move STEP*/IN_LAW/NIECE/NEPHEW/SPOUSE/CHILD into `GLOSSARY` as FAMILY entries with `generation`; delete the parallel table |
| `entityResolutionCore` `KINSHIP_ROLE` + `lexicalIntelligence` family regex | **Replace** | Generate from glossary FAMILY aliases |
| `placeIntelligence.classifyPlace` category source | **Replace vocabulary** | Categories come from glossary `LOCATION`; keep the *scoring/dedupe* algorithm |
| `groupIntelligence.classifyGroup` / `society*` category source | **Replace vocabulary** | Categories from glossary `GROUP`/`ORGANIZATION` |
| LLM extractor entity/relationship labels | **Constrain, then normalize** | Prompt with `RootType`; map outputs via `mappers.ts` |
| Query-intent guessing scattered in chat routing | **Replace** | `classifyQueryType`/`classifyActionIntent` already do this deterministically |
| Multiple resolvers (characterRegistry, entityResolutionService, peoplePlaces dedup, …) | **Collapse into `entityResolutionCore`** | Already the stated plan; finish the cutover |

**Do NOT replace** (these are algorithms, not vocabularies, and are differentiation): the anti-pollution **rules** in `entityClassifier`, the **scoring** in place/group intelligence, `entityAuthorityService.decideAuthority`, MRQ governance, family/household *inference* logic, narrative compiler. Keep the brains; centralize the words.

---

## 6. Unified LoreBook Knowledge Graph — without Neo4j or TypeDB

The goal: one graph over **Characters, Locations, Organizations, Projects, Skills, Communities, Goals, Events, Households, Family Trees, Relationships** — in Postgres, ontology-typed, with inference. This directly answers Phase 1's "consolidate before you import."

### 6.1 Two tables, ontology-typed

**`graph_nodes`** — one row per entity, regardless of book:

```
graph_nodes
  id            uuid pk
  user_id       uuid            -- RLS tenant
  root_type     text            -- RootType (PERSON, LOCATION, ORGANIZATION, PROJECT,
                                 --   SKILL, GROUP, EVENT, GOAL, ...) — the join key
  category      text            -- glossary category (FAMILY, VENUE, COMPANY, ...)
  subcategory   text            -- glossary subcategory
  canonical_name text
  aliases       text[]
  embedding     vector(1536)
  attributes    jsonb           -- book-specific fields (closeness_score, status, ...)
  confidence    numeric
  source        text            -- LEXICAL | LLM | USER
  created_at / updated_at
```

The eleven "books" become **views over `graph_nodes` filtered by `root_type`** (Characters = `root_type='PERSON' AND character_eligible`, Locations = `LOCATION`, Communities/Households = `GROUP` + category, Family Tree = the FAMILY edges, etc.). One write path, eleven read surfaces. This is the inverse of today's 3 person stores + 5 edge tables.

**`graph_edges`** — one typed, bi-temporal edge table (replaces `character_relationships`, `entity_relationships`, `omega_relationships`, `romantic_relationships`, `social_edges`):

```
graph_edges
  id            uuid pk
  user_id       uuid
  src_id        uuid -> graph_nodes
  dst_id        uuid -> graph_nodes
  rel_type      text            -- ONE relationship taxonomy from glossary RelationshipHint
  rel_subtype   text            -- e.g. GRANDMOTHER, WORKS_FOR, MEMBER_OF, RESIDES_AT
  role_src      text            -- role the src plays (TypeDB-style roles, in Postgres)
  role_dst      text
  weight        numeric
  valid_at      timestamptz     -- event time   (bi-temporal, borrowed from Graphiti)
  invalid_at    timestamptz     -- when it stopped being true
  inferred      boolean         -- derived vs asserted
  provenance    jsonb           -- source message/edge ids
  confidence    numeric
```

### 6.2 Inference without TypeDB — Postgres recursive CTEs + materialized edges

TypeDB's value is **roles + rule inference**. Reproduce it in Postgres:

- **Roles** live in `role_src`/`role_dst` on `graph_edges` (the "entity plays a role in a relation" model).
- **Rule inference** = SQL rules that read base edges and **materialize `inferred=true` edges** with provenance. Examples that close Phase 1's recall gaps:
  - *Grandparent*: `parent(a,b) ∧ parent(b,c) ⇒ grandparent(a,c)` — a recursive CTE over FAMILY edges. The glossary `generation` offsets make this trivial to validate.
  - *Household co-residence*: `resides_at(a,h) ∧ resides_at(b,h) ⇒ lives_with(a,b)`.
  - *Community membership*: `member_of(a,g) ∧ member_of(b,g) ⇒ co_member(a,b)`.
  - *In-law*: `married_to(a,b) ∧ sibling(b,c) ⇒ sibling_in_law(a,c)`.
- Run inference as a **node-cron job** (the same pattern the codebase already uses for decay/continuity) or incrementally on ingest. Cache inferred edges; recompute on base-edge change.
- **Traversal** (family tree, "who lives with me", connected recall) = bounded recursive CTEs. If depth/QPS ever outgrows CTEs, adopt **Apache AGE** (Cypher *inside* Postgres) — still no second database. (Per Phase 1, defer Neo4j/TypeDB unless a measured limit forces it.)

### 6.3 How the eleven domains map

| Domain | `root_type` (+category) | Notes |
|--------|------------------------|-------|
| Characters | `PERSON` (character-eligible) | `characters` becomes a view + authority flags |
| Locations | `LOCATION` | venue/dwelling/outdoor from glossary categories |
| Organizations | `ORGANIZATION` | |
| Communities | `GROUP` (COMMUNITY/FRIEND_GROUP) | |
| Households | `GROUP` (HOUSEHOLD) + `RESIDES_AT` edges | stop storing households as `type='family'` orgs (current hack in `householdInferenceService`) |
| Family Trees | FAMILY-typed `graph_edges` + inference | grandparent/in-law inferred, not stored raw |
| Projects | `PROJECT` | |
| Skills | `SKILL` | |
| Goals | `GOAL` | |
| Events | `EVENT` | links to timeline tables from Phase 1 |
| Relationships | `graph_edges` | one table, one taxonomy, bi-temporal |

### 6.4 Migration sequence (non-destructive)
1. Create `graph_nodes`/`graph_edges`; **dual-write** behind a flag while keeping the existing tables.
2. Backfill via `character_authority_map` / `entity_canonical_map` (the bridges already exist).
3. Re-point reads to views one book at a time; verify against current surfaces.
4. Add recursive-CTE inference for family/household/community.
5. Flip `entityResolutionCore` to `on`; retire the parallel resolvers.
6. Drop legacy tables once parity holds.

This is the Phase 1 roadmap's "Phase 2 (entity & edge unification) + Phase 3 (traversal & inference)" made concrete and ontology-typed.

---

## 7. Reducing fragmentation — the consolidation backlog

Ordered for impact-per-effort. Items marked **(deletion)** reduce code.

1. **One entity taxonomy.** Re-point the 10 `EntityType` unions to `RootType` via `mappers.ts`; keep only thin storage aliases. **(deletion)**
2. **One kinship taxonomy.** Fold `kinshipGlossary` roles into `GLOSSARY`; generate `entityResolutionCore.KINSHIP_ROLE` and `lexicalIntelligence` family regex from glossary aliases. **(deletion)**
3. **One relationship taxonomy.** Standardize on glossary `RelationshipHint`; map the 5 other relationship enums onto it. **(deletion)**
4. **One place/group vocabulary.** `classifyPlace`/`classifyGroup` keep their scoring but read categories from the glossary; retire `constants/placeTypes.ts`/`constants/groupTypes.ts` as *vocabularies*. **(deletion)**
5. **One resolver.** Flip `entityResolutionCore` to `on`; collapse the parallel resolvers it names in its header. **(deletion)**
6. **One gate.** Wire MRQ as the sole write path (fixes Phase 1 Step 11 stub + store-before-review).
7. **One temporal resolver.** (Phase 1) chrono-node + anchors, single scope enum. **(deletion)**
8. **One graph.** `graph_nodes` + `graph_edges` (§6); books become views. **(deletion of 3 person + 5 edge tables over time)**
9. **Glossary governance.** Version/hash the glossary; treat `RootType` changes as governance events (already implied by `rootType.ts`); add a CI check that fails if a new file declares an entity/relationship/kinship vocabulary outside the ontology package.

---

## 8. Answers in one line each

1. **Primary layer?** Yes — make it explicit (contract + flip resolver to `on`); it already has SSOT, determinism, and anti-pollution.
2. **Pipeline?** Yes — fuse Lexical+Ontology as Stage 1, add a constrained LLM Stage 1b normalized via `mappers.ts`, and make **MRQ the only write gate**.
3. **Refactor to consume `glossary.ts`?** Kinship (P0), entity-resolution core regex (P0), place/group classifiers + entityClassifier (P1), relationship detectors + LLM prompts (P2).
4. **Duplicated taxonomies?** ~10 `EntityType` unions, ≥6 relationship enums, **4 kinship implementations**, ≥3 place + ≥3 group category sources, 2 temporal-scope enums.
5. **Replace with ontology-driven classification?** All ad-hoc *vocabularies* and scattered resolvers; **keep** the *algorithms* (anti-pollution rules, scoring, authority, inference, narrative).
6. **Unified KG without Neo4j/TypeDB?** `graph_nodes` + bi-temporal `graph_edges` typed by `RootType`, books as views, **roles + recursive-CTE rule inference** in Postgres (Apache AGE only if traversal outgrows CTEs).

---

## 9. Bottom line

The ontology + lexical engine is **the right foundation and is already most of the way there** — it is the one place in LoreBook with a true single source of truth that fans out by construction. The work to make it *the* foundation is overwhelmingly **subtractive**: delete the parallel kinship/entity/relationship/place/group taxonomies, route every classifier and extractor through the glossary and `RootType`, promote `entityResolutionCore` from shadow to authority, gate all writes through MRQ, and collapse the entity/edge storage into one ontology-typed graph with recursive-CTE inference. Do that and LoreBook gets a smaller, more coherent system whose intelligence all speaks one vocabulary — which is exactly the maintainability-and-product-success objective from Phase 1, applied to the layer that matters most.
