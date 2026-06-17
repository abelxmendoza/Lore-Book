# What Frontier Models Do That LoreBook Doesn't (Yet)

**Status:** analysis + design mapping. Companion to `lorebook-v2-architecture.md`.

**Ground rule:** I make **no claims about proprietary internals** of any model. I describe **observable behaviors** a strong model exhibits in conversation, then map each to a concrete LoreBook v2 mechanism that approximates it. The goal is not to copy an LLM — it's to identify the *capabilities* that make a model feel like it "understands" a life, and build the data/runtime that produces the same observable behavior, durably and across years (which a model's context window cannot).

The meta-point: a frontier model does this **within a single conversation** using attention over a context window. LoreBook must do it **across years** using a graph + working-memory assembly. Same observable behavior, different substrate — and LoreBook's substrate is *persistent*, which is the moat.

---

## 1. Working memory (selective attention)

**Observable behavior:** the model attends to the *relevant* parts of a long conversation and ignores the rest; it brings the right earlier detail to bear at the right moment without being told to.

**LoreBook v2 mechanism:** per-turn **working-memory assembly** (v2 Phase 4) — anchor resolution → bounded graph-neighborhood expansion → ranked, budgeted context. The ranking function (relevance × importance × recency × proximity × confidence) *is* a hand-built attention mechanism over the memory graph. The difference: a model attends over ~hundreds of K tokens of *this* conversation; LoreBook attends over *years* of life by retrieving a bounded neighborhood. **Gap today:** LoreBook retrieves with regex routers, not relevance-ranked assembly. v2 closes it.

## 2. Abstraction (compression to gist)

**Observable behavior:** a model restates the *gist* of a long passage, generalizes from examples, and reasons at the right level ("you keep prioritizing work over rest") rather than parroting episodes.

**LoreBook v2 mechanism:** **consolidation** (v2 Phase 6) compresses episodic → semantic continuously: many episodes → a stable fact, recurring reflections → a `theme`, a span of episodes → a `chapter` summary. Abstraction is the *consolidation worker's job*, run asynchronously and stored as higher-level nodes. **Gap today:** abstraction is implicit and one-off (a biography blob); v2 makes it a durable, layered hierarchy (episode → meaning → insight → theme → identity).

## 3. Story understanding (narrative structure)

**Observable behavior:** the model understands that events form arcs — setup, conflict, turning point, resolution — and frames a recollection within its arc ("that was during the rough stretch after the layoff").

**LoreBook v2 mechanism:** first-class `arc`/`chapter`/`turning_point`/`theme` nodes (graph doc Phase 5), formed by causal chaining + change-point detection over episodes. When recalling an event, the assembler pulls its containing arc so the answer is *framed*, not flat. **Gap today:** stories are regenerated text; v2 makes narrative a queryable structure that survives and updates.

## 4. Relationship tracking (state over time)

**Observable behavior:** the model tracks who-is-who and how relationships stand *now* vs *before* ("you and Alex were close last summer but it sounds like that cooled").

**LoreBook v2 mechanism:** **reified `relationship_state` nodes** + **bi-temporal edges** (`valid_from/to`) + a sampled **trajectory**. The graph holds the *whole history* of a relationship, not just its latest state, so LoreBook can do something a stateless model *cannot*: show closeness as a time series across years. **Gap today:** two split tables (`character_relationships`, `romantic_relationships`) with point-in-time scores and no trajectory. v2 unifies + temporalizes.

## 5. Concept formation (emergent categories)

**Observable behavior:** the model forms ad-hoc categories from data ("your creative projects," "your support network") without being given the taxonomy.

**LoreBook v2 mechanism:** **community detection / embedding clustering** over the graph proposes `theme`s and groupings (e.g. cluster of people who co-occur → a `group` node "the climbing crew"). These are *proposed with confidence* and confirmable. **Gap today:** categories are hard-coded enums (place types, group types); v2 lets categories *emerge* from the data while keeping the enums as priors.

## 6. Reflection (meaning-making)

**Observable behavior:** a strong model doesn't just recall — it *interprets* ("the fact that you drove 2 hours suggests this mattered to you").

**LoreBook v2 mechanism:** the **reflection pipeline** (v2 Phase 6): episode → meaning → reflection → insight → epiphany, each a node with provenance and confidence. **Gap today:** a "meaning cache" of text; v2 makes meaning a structured, evidenced, revisable layer that can be surfaced *with its reasoning*.

## 7. Contradiction handling (holding inconsistency)

**Observable behavior:** the model notices when you say something inconsistent with earlier and either reconciles or asks ("earlier you said Amazon, now Google — did you switch?").

**LoreBook v2 mechanism:** **bi-temporal semantic memory** — new evidence *supersedes* rather than overwrites, opens a new fact version, and records a `contradicts` edge; close calls raise a contradiction to the user/reflection layer. The graph never silently drops the old truth. **Gap today:** last-write-wins on facts (drift + silent loss); v2 makes contradiction a first-class, surfaced event. *This is also the core trust feature competitors lack.*

## 8. Confidence handling (calibrated uncertainty)

**Observable behavior:** a good model hedges appropriately — confident on well-established facts, tentative on thin evidence, explicit when it doesn't know.

**LoreBook v2 mechanism:** **confidence on every edge/fact/reflection**, raised by corroborating episodes and lowered by contradiction; the working-memory ranker down-weights low-confidence facts; the generation constraint forbids asserting beyond the evidence and routes thin areas to questions, not claims. **Gap today:** confidence columns exist but don't gate language (the guard is post-hoc). v2 makes confidence *drive* phrasing.

---

## The capability LoreBook has that frontier models don't

Worth stating plainly, because it's the strategy: a frontier model's memory is **ephemeral** (bounded by context; gone after the session) and **un-auditable** (you can't ask it to prove where a belief came from). LoreBook's v2 graph is **persistent across years** and **fully provenanced** (every claim cites the episodes that justify it). Frontier models are the better *reasoner*; LoreBook can be the better *rememberer* — and by feeding a clean, bounded, provenanced working memory *into* a frontier model at generation time, LoreBook gets both: the model's reasoning over LoreBook's durable, trustworthy memory.

**That is the whole product thesis in one line:** *don't try to out-reason the model; give the model a perfect, auditable memory of one life and let it reason over that.*

---

## Mapping summary

| Frontier behavior | LoreBook v2 mechanism | Status today |
|---|---|---|
| Working memory / attention | Working-memory assembly (ranked, budgeted neighborhood) | regex routers → **rebuild** |
| Abstraction | Consolidation (episodic→semantic→theme) | one-off blobs → **rebuild** |
| Story understanding | `arc`/`chapter`/`theme` nodes | regenerated text → **rebuild** |
| Relationship tracking | reified `relationship_state` + bi-temporal edges + trajectory | split tables, no time → **rebuild** |
| Concept formation | clustering/community detection → emergent groups/themes | hard-coded enums → **augment** |
| Reflection | meaning→insight→epiphany node pipeline | text cache → **rebuild** |
| Contradiction handling | bi-temporal supersede + `contradicts` edges | last-write-wins → **rebuild** (and it's a moat) |
| Confidence handling | confidence on every fact, drives ranking + phrasing | columns unused by language → **wire in** |

Every "rebuild" here is covered by the v2 architecture and sequenced in `graph-migration-plan.md`.
