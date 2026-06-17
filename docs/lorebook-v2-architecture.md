# LoreBook v2 — Runtime Architecture (Recall, Working Memory, Reflection, Trust)

**Status:** design, not implementation. Builds on `autobiographical-memory-graph.md` (the data model). Covers Phases 2, 4, 6, 7.

**One-line thesis:** replace the cascade of routers/recallers/formatters with a **single graph-first working-memory assembler** that runs once per turn, and make every derived artifact a self-invalidating projection of the immutable episode log.

---

## Phase 2 — Recall redesign (graph-first)

### Kill the cascade

Today (audited): `intent → router → router → recall → recall → formatter`, with `routeRecallQuery` running up to 2×/turn over full-table scans, plus a parallel `conversationIntelligenceRouter`. v2 is a **single pipeline, one pass**:

```
Question
  ↓  (1) Anchor resolution        — find the nodes the question is "about"
  ↓  (2) Working-memory assembly  — gather candidate memory (graph + semantic + episodic)
  ↓  (3) Graph expansion          — k-hop neighborhood around anchors
  ↓  (4) Evidence selection       — rank + budget under a token cap
  ↓  (5) Response construction    — generate, constrained to selected evidence
```

No regex cascade decides "the intent." Instead, **anchor resolution + retrieval produce evidence**, and the *shape* of the evidence determines the answer. ("Who is Jerry?" and "what happened at Club Metro?" run the *same* pipeline; they differ only in which anchors resolve and which node types dominate the neighborhood.)

### (1) Anchor resolution — `O(|question|)`

- Match the question against the **per-user entity index** (trie / Aho-Corasick built from `nodes.norm_key` + aliases, cached, invalidated on node write). This replaces the two full-table scans + `.includes()` loops.
- For ambiguous names ("Juan"), return **all** same-name candidates; disambiguation happens in ranking (context), not here.
- If nothing resolves lexically, fall back to **one** vector query over `nodes.embedding` for the most-similar entities, and over `episodes.embedding` for topical questions ("the layoff"). This is the single, bounded LLM-free retrieval fallback that fixes the audit's "no record" false-negatives.

### (2)+(3) Working-memory assembly + graph expansion — `O(k·d)`

From the anchor set A, expand the graph to a bounded neighborhood:
- **1–2 hop** edge expansion from each anchor (`(user_id, src/dst)` index or adjacency cache): people connected to Jerry, places he was `met_at`, events that `involve` him.
- Pull the anchors' **semantic facts** (their `edges`/`attrs` with confidence).
- Pull the **top-N relevant episodes**: candidates = episodes linked to anchors (`about`/`involves`) ∪ vector-NN(question, episodes). Rank (below).
- Pull **current life context**: the active `chapter`, recent high-importance episodes, open `goal`s.

Bounded expansion = bounded cost: `k` anchors × `d` average degree, capped (e.g. ≤ 200 candidate nodes/episodes) regardless of total graph size. **This is O(neighborhood), not O(graph).**

### (4) Evidence selection — ranking & budgeting

Score every candidate item with a single weighted function, then greedily fill the token budget:

```
score(item) =  w_rel · relevance(item, question)      // cosine(embedding)
             + w_imp · importance(item)                // node.salience / episode.importance
             + w_rec · recency(item)                   // exp(-Δt / τ)
             + w_link· anchor_proximity(item, A)       // 1/hop_distance
             + w_conf· confidence(item)                // semantic facts only
```

- **Relevance:** embedding similarity to the question.
- **Importance:** graph centrality (node) / significance (episode) — *self-updating* because it's derived from edges.
- **Recency:** exponential decay; τ tuned per type (events decay slower than chit-chat).
- **Anchor proximity:** closer in the graph = more relevant.
- **Confidence:** down-weight low-confidence semantic facts so the model doesn't assert shaky truths.

Greedy knapsack under the token budget, with **type quotas** (always include ≥1 semantic summary of each anchor + a few best episodes) so the context is balanced, not all-episodes-or-all-facts.

### (5) Response construction — constrained generation

The prompt contains **exactly** the selected evidence, each item tagged with its node/episode id and confidence. The model is instructed: *answer only from this evidence; for anything absent, say you don't have a record.* (Trust mechanism, Phase 7.) The selected ids are retained so the response can cite/anchor and so the post-hoc guard can verify claims against what was actually provided.

### Caching

- **Entity index:** per-user, in-memory (LRU across users), invalidated on node upsert. ~O(1) anchor resolution.
- **Adjacency cache:** per-user `Map<nodeId, Edge[]>`, invalidated on edge write. Hot users stay resident.
- **Working-memory cache:** keyed on `(userId, normalized_question, graph_version)`; identical/again-asked questions are instant. `graph_version` bumps on any node/edge write so it can never serve stale neighborhoods.

### Worked examples (all one pipeline)

| Question | Anchors | Neighborhood dominated by | Answer shape |
|---|---|---|---|
| **"Who is Jerry?"** | `person:Jerry` | semantic facts + relationships + a few episodes | identity + relationship summary, with episodes as evidence. If Jerry has a node but 0 linked episodes → *honest*: "I have Jerry as someone you've mentioned, but no specific memories yet" (fixes RC-1 by being truthful, while P0-5 prevents the orphan). |
| **"What happened with Ashley?"** | `person:Ashley` | episodes `involve` Ashley + the `relationship_state`/arc | episodic narrative ordered by time, framed by the relationship arc. |
| **"What happened at Club Metro?"** | `place:Club Metro` | episodes `met_at`/`located_in` + people present | the night(s) there, who was present (graph expansion to people). |
| **"What do you know about Abuela?"** | `person:Abuela` | `parent_of`/family edges + episodes + family chapter | semantic (grandmother, family role) + episodes (Costco) + the family theme. |
| **"Who are the important people in my life?"** | none (aggregate) | top-salience `person` nodes (centrality) | ranked roster by graph centrality + recency — *computed*, not a stored importance column. |

The last one is the clearest win: "important people" becomes **graph centrality over the relationship edges**, recomputed implicitly as edges change — no stored `importance_score` to drift.

### Complexity vs today

| | Today | v2 |
|---|---|---|
| anchor/entity detection | `O(R·(P+C))` full scans, ×2/turn | `O(|q|)` index + ≤1 vector fallback |
| recall passes | up to 4 layered gates, 2 routers | 1 pipeline |
| "important people" | stored column (drifts) | centrality over neighborhood |
| neighborhood | repeated `.or()` row scans | bounded k-hop, cached adjacency |

---

## Phase 4 — Working memory (frontier-style assembly)

Every answer assembles a **bounded, ranked context** — the same discipline a strong model uses to fill its window. Six bands, each token-budgeted:

```
WORKING MEMORY (per turn, ≤ budget B tokens)
├─ Current turn               (the message; highest priority, never dropped)
├─ Recent conversation        (last K turns; recency-weighted, compacted if long)
├─ Relevant graph neighborhood(k-hop around anchors; importance × proximity)
├─ Semantic memory            (anchors' stable facts; confidence-weighted)
├─ Relevant episodes          (vector × recency × importance; type-quota'd)
└─ Current life context       (active chapter, open goals, recent pivots)
```

**Ranking:** the §Phase-2 score function, applied within each band, with **band budgets** so no band starves the others (e.g. 10% current, 20% recent convo, 25% neighborhood, 20% semantic, 20% episodes, 5% life context — tuned empirically).

**Windowing:** hard token cap B (model-dependent). Within a band, greedy fill by score. Recent conversation beyond K turns is **compacted** (the existing compaction service) into a rolling summary, not dropped wholesale.

**Recency weighting:** `recency(t) = exp(-Δt/τ_type)`. Daily chatter τ ≈ days; events τ ≈ months; identity facts ≈ ∞ (no decay). This is why "what did we just talk about" surfaces recent turns while "who is Abuela" surfaces stable facts.

**Importance weighting:** node `salience` (centrality) and episode `importance` (significance). Because these are *derived from the graph*, the most-connected people and most-pivotal events naturally win context slots — the system pays attention to what matters in the life, like a model attends to salient tokens.

**The key property:** working memory is **assembled fresh each turn from the graph**, never a persisted blob. It is always consistent with current truth and always within budget at any scale, because it's a bounded neighborhood — a user with 50,000 episodes assembles the same-size working memory as one with 500.

---

## Phase 6 — Reflection system (Memory → Meaning → Insight → Epiphany)

This is how LoreBook becomes *wise*, not just *retentive*. Each stage is a **node type** with provenance, produced by asynchronous consolidation (not per-turn), confidence-scored, and contradiction-checked.

```
episode(s)            "Went to Costco with Abuela, took 2.5 hours"
   ↓ meaning          a `reflection` node (type=meaning): "Abuela is still alive and present"
   ↓ reflection       (type=reflection): "I felt gratitude, not impatience, about the time"
   ↓ insight          (type=insight): "Family time matters more to me than efficiency"
   ↓ epiphany         (type=epiphany / identity_theme): "I'm reprioritizing toward family"
```

### Storage

Each stage = a `node` (types `meaning`, `reflection`, `insight`, `epiphany`/`identity_theme`) with:
- `–about→` / `–part_of→` edges to the **episodes/nodes it was derived from** (provenance; lets it cite itself and invalidate).
- `confidence` (insights start tentative, strengthen with recurring evidence).
- `–supports→` / `–contradicts→` edges to other reflections (a belief can be reinforced or challenged by later life).
- `–instance_of→` a `theme` when an insight recurs ("family matters" appears across many episodes → becomes a stable `theme`/`value`).

### How it's produced

A **consolidation worker** (sleep-like, runs off the ingest queue and on a schedule) does, per user, incrementally:
1. cluster recent episodes by entity/theme,
2. propose `meaning`/`reflection` for emotionally- or significance-salient clusters (this is a legitimate LLM use — bounded, async, not per-turn),
3. promote recurring reflections to `insight`s (confidence rises with repetition),
4. detect identity-level shifts → `epiphany`/`identity_theme`,
5. attach provenance edges and a confidence.

### Why nodes, not blobs

- An insight can be **surfaced** in chat ("you've said family matters more lately — Costco with Abuela, the move home…") *with its evidence*.
- It can be **revised**: if life contradicts it, a `contradicts` edge forms and confidence drops — the system can say "you used to feel X, now Y."
- It feeds **predictive recall** and **epiphany generation** features later, because reflections are queryable graph objects, not prose.

**Guard:** reflections are **proposals with confidence**, never asserted as fact. Low-confidence insights are surfaced as questions ("does it feel like family's become a bigger priority?"), not claims. This keeps the wisdom layer from becoming a hallucination layer.

---

## Phase 7 — Trust architecture

The whole point. Four mechanisms, each closing a failure class from the audit.

### 1. Event sourcing — episodes are immutable truth
`episodes` are append-only and verbatim. Corrections **supersede** (status flip + `superseded_by`), never overwrite. Everything else (nodes, edges, scores, stories, reflections) is a **pure function of the active episode set** and carries provenance back to it. **Consequence:** the system can always rebuild any derived artifact and prove where any claim came from. This is the foundation for "no stale anything."

### 2. Self-invalidating derived data — no stale scores/biographies/significance
Every derived artifact stores the **version of its inputs** it was computed from:
- `node.salience` / `episode.importance` / significance carry a `computed_from_version` (or `scored_at` vs the entity's `last_episode_at`).
- A score whose inputs changed is **stale by definition** and is (a) recomputed incrementally on the ingest/correction hook for the *touched* entity, or (b) flagged stale and recomputed on read. **No global backfill, no default-minor masking.** (Directly fixes audit B1/B7 and the Sprint-AL drift.)
- Biographies/chapters are **rendered from current chapter/arc/theme nodes** — there is no stored biography to go stale; the text is always a projection of the live graph.

### 3. Provenance everywhere — every claim cites episodes
Each edge/attr/reflection has `–derived_from→` edges to the episodes that justify it. The chat answer carries the ids of the evidence it used. This powers: "How do you know that?" → show the episodes; the "What AI Knows" surface → list facts *with* their sources and confidence; and the post-hoc guard → verify the streamed claims against the evidence actually provided.

### 4. Generation-time constraint — no false memory/creation claims
Two-sided:
- **No false memory claims:** the model may only assert memory for items present in the assembled working memory; absence → "I don't have a record" **only after** the vector fallback (Phase 2) has tried. (Fixes RC-2 + the reactive-guard problem.)
- **No false creation claims:** the assistant's wording is tied to the **pipeline's actual decision**. "Remember Tío Juan" → the registry's create/merge/defer result is surfaced into the turn synchronously (light extraction for current-message entities) and the response reflects it ("I've started a record" only if a create happened; "is this the same Juan as…?" if it deferred). Async ingestion never narrates an outcome it hasn't committed. (Fixes RC-3.)

### Audit trail
Bi-temporal modeling (`valid_from/to` = life-time; `asserted_at`/`ingested_at` = wall-clock) gives a free audit log: "what did the system believe about X on date D, and on what evidence." Contradictions are recorded as `contradicts` edges, never silent overwrites — the graph is a faithful record of how understanding evolved.

---

## Scaling the runtime (10K → 100K → 1M)

Because work is **per-user and bounded** (working memory is a capped neighborhood), the runtime scales with *concurrency*, not graph size:

- **10K:** single Postgres + pgvector; in-process caches; consolidation in the same workers. Trivial.
- **100K:** split API and consolidation workers (already recommended in the audit); Redis tier for entity-index/adjacency/working-memory caches; read replicas; partition `episodes` by `user_id` hash. HNSW vector indexes per partition.
- **1M:** shard Postgres by `user_id` (Citus or app-level); Redis cluster; consolidation as an autoscaled queue+worker pool fed by the ingest stream; **memory tiering** — hot (recent + high-importance episodes, full fidelity), warm (vector-indexed), cold (old episodes summarized into semantic facts + chapter summaries, raw archived to cheap storage). Tiering is the years-long-user story: consolidation continuously compresses episodic→semantic so working-memory assembly never grows.

The architecture's scaling secret is the same as its trust secret: **bounded working memory + per-user isolation + derived-from-immutable-episodes.** Get those three right and 1M users is a sharding exercise, not a redesign.
