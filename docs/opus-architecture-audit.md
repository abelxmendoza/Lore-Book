# LoreBook — Principal Engineer Architecture Audit (Opus)

**Scope:** Sprints X, Y, AD, AH, AI, AJ, AK, AL, AM + Discovery redesign, character merge, relationship scoring, event significance, meaning generation, recall routing, conversation intelligence, character importance, biography generation, entity resolution, thread recall, memory diagnostics, Love & Relationships, Life Log, Discovery Hub, What AI Knows, Character Book.

**Verdict in one sentence:** The product has a sound data foundation and genuinely good ideas, but the **chat/recall layer has accreted ~6 overlapping retrieval subsystems sprint-over-sprint with no consolidation**, intent routing is brittle regex cascades, and the new "intelligence scores" are **denormalized derived data with no recompute path** (guaranteed drift). The fix is consolidation and a single retrieval contract — not more sprints.

> Method note: findings are grounded in the code as of `8476547` (Sprint AM). File:line references are clickable. Where I assert complexity I name the loop/query. I have flagged my confidence level on the memory-quality root causes since I reasoned those from architecture rather than transcripts.

---

## 0. The central problem: retrieval sprawl

Per **one** chat turn, [omegaChatService.ts](apps/server/src/services/omegaChatService.ts) can sequentially invoke **all** of these gates, each with its own DB reads:

| Order | Gate | Added | What it queries |
|------|------|-------|-----------------|
| 1 | `routeConversationIntelligence` (omega:669) | Sprint AK | question-intent classify → story recall → entity profile → evidence counts |
| 2 | `buildThreadRecall` (omega:701) | Sprint AH | thread messages + entity overlap |
| 3 | `executeExplicitRecall` (omega:754/871) → `routeRecallQuery` | Sprint G/AF | **2 full-table entity loads** + foundation fetchers |
| 4 | `buildRAGPacket` (omega:961/1784) → `routeRecallQuery` **again** | — | full RAG context + **a second `routeRecallQuery`** ([ragBuilderService.ts:497](apps/server/src/services/chat/ragBuilderService.ts#L497)) |

Two independent recall routers now coexist: **`recallQueryRouter`** (Sprint G/AF) and **`conversationIntelligenceRouter`** (Sprint AK). They overlap heavily (both resolve an entity name, both fetch an entity profile, both format a roster). `routeRecallQuery` is itself invoked **twice** per turn — once in `explicitRecallService`, once in `ragBuilderService` — and each call does two full-table scans (`people_places` + `characters`). Sprint AM then layered a **third** family of services (`storyRecallService`, `sceneReconstructionService`, `eventReconstructionService`, `relationshipStoryBuilder`) reachable from gate 1.

**This is the #1 thing to fix.** Everything below is downstream of it.

---

## A. Retrieval Pipeline

**Current flow:** Intent → Router → Recall → Evidence → Formatting — but in practice it is *N* routers → *N* recalls → *N* formatters, run in a short-circuit cascade.

### Is it optimal? No. Concrete problems:

1. **Redundant passes (confirmed).** `routeRecallQuery` runs up to 2×/turn; `conversationIntelligenceRouter` re-derives the same entity/profile a third time. Each `routeRecallQuery` does `loadKnownEntities` ([recallQueryRouter.ts:39](apps/server/src/services/chat/recallQueryRouter.ts#L39)) loading **all** `people_places`, plus `detectMentionedEntityName` ([:79](apps/server/src/services/chat/recallQueryRouter.ts#L79)) loading **all** `characters`. For a power user with 500 entities that is 2,000+ rows scanned **per router call**, several times per turn.

2. **`loadKnownEntities` is wasted work for most intents.** It runs unconditionally at the top ([:246](apps/server/src/services/chat/recallQueryRouter.ts#L246)), but the `conversation`, `thread`, `character_list`, `family`, `biography`, `location`, and `work` branches all return **before** using it. ~7 of 11 intents pay for a full-table load they never read.

3. **Regex-cascade intent routing is brittle and order-dependent.** Routing is a fixed sequence of `if (REGEX.test(message))` ([:248–:377](apps/server/src/services/chat/recallQueryRouter.ts#L248)). The existence of commit `f47467c` *"Fix recall router ordering"* is direct evidence this is fragile: correctness depends on regex precedence, and any paraphrase outside the patterns falls through to the generic branch. This is an intent-classification problem being solved with hand-ordered regexes.

4. **The entity index that was built is not used.** Sprint AH added [`entityMentionIndexService.ts`](apps/server/src/services/entities/entityMentionIndexService.ts) (132 lines) — exactly the inverted index needed to replace the per-turn full scans — **but `recallQueryRouter` still does raw `.includes()` substring scans** ([:91–:98](apps/server/src/services/chat/recallQueryRouter.ts#L91)). A scalability fix was built and then bypassed. (Duplicate-systems + dead-ish code.)

5. **Excessive LLM usage? Actually no — and that's a different risk.** The recall/scoring/story services are almost entirely **deterministic** (no `openai` imports outside `chatOrchestrator`/`compaction`/`titles`/`greetings`). Cost is fine. The risk is the opposite: **quality is heuristic** (regex + hand-weighted scores), so recall precision/recall is capped by pattern coverage, not by model capability.

### Recommended design — one retrieval contract

Replace the cascade with a **single retrieval planner** that runs **once** per turn:

```
plan = classifyIntent(message, threadContext)        // 1 cheap call (see below)
candidates = retrieve(plan)                           // 1 unified pass over an index
evidence = score+rank(candidates, plan)               // pure functions, no new DB reads
context = format(evidence, plan.surface)              // deterministic
```

- **Intent:** replace the regex cascade with (a) keep regexes as a fast-path *prior*, but (b) back them with one embedding-NN call against a small set of labeled intent exemplars, or a single nano-model classifier with a strict enum output. Deterministic-first, model-second. This kills the ordering bugs.
- **Retrieve:** one pass against a **per-user in-memory entity index** (built from `entityMentionIndexService`, cached with a short TTL / invalidated on ingest) instead of 2 full-table scans per router call. Entity-name detection becomes an Aho-Corasick / trie match over the index: O(message length), not O(entities × names).
- **Unify the routers:** `recallQueryRouter` and `conversationIntelligenceRouter` should become **one** module. `conversationIntelligenceRouter` is the newer/better-shaped one (evidence-backed handlers); fold the foundation fetchers into it and delete the duplicate path. `executeExplicitRecall`'s call to `routeRecallQuery` and `ragBuilderService`'s call should resolve to the *same* memoized result for the turn (pass the plan down, don't re-route).

**Complexity:** current per-turn retrieval is ~`O(R · (P + C))` where R = number of routers invoked (up to ~3), P = people_places rows, C = character rows — i.e. several full scans. Target is `O(P + C)` **once** to build/refresh the index (amortized to ~O(1) with caching) + `O(|message|)` to match.

---

## B. Character System

Tables: `characters`, `character_memories`, `character_relationships`, importance, `biographies`/`narrative_accounts`, merge pipeline.

### Storing derived data that should be computed (or computed data that should be cached)

Sprint AL ([migration `al_reality_gap_columns.sql`](supabase/migrations/20260615180000_al_reality_gap_columns.sql)) persists **deterministic** scores as columns: `significance_score`/`significance_level` on `resolved_events`, importance on characters, relationship scores. These are recomputed **only by manual backfill scripts** (`scripts/backfill-character-importance.ts`, `backfill-event-significance.ts`, `backfill-relationship-scores.ts`). **There is no recompute trigger when the underlying memories change.**

This is the worst of both worlds:
- It's **derived data** (a pure function of memories/mentions) stored as **source-of-truth columns** → it goes **stale the moment a memory is added, edited, or corrected**. The message-correction loop I shipped earlier makes this acute: correcting a bubble tombstones memories but **does not** recompute the importance/significance that depended on them. Guaranteed drift.
- Yet it's cheap to compute, so persisting it buys little.

**Recommendation:** pick one model and commit:
- **If scores must be queryable/sortable** (they are — there's `idx_resolved_events_significance`), keep the column but make it a **materialized projection** with an explicit invalidation: recompute on the ingest hook for the affected entity (Sprint AL already added ingestion hooks — extend them to recompute the *touched* entity's scores, not a global backfill), and recompute on correction/tombstone. Treat backfill scripts as disaster-recovery only.
- **If not**, compute at read time from `character_memories`/`resolved_events` and cache in an LRU keyed by `(entityId, memoryVersion)`.

Either way: **a stored score with no invalidation is a bug, not a feature.**

### Graph structures — yes, this is the highest-leverage CS upgrade

`character_relationships` is currently queried with `.or(source.eq.X, target.eq.X)` row scans (e.g. [characterKnowledgeBaseService](apps/server/src/services/characterKnowledgeBaseService.ts), recallQueryRouter family fetch). The character/relationship data **is a graph** and is being traversed as rows.

- **Adjacency map:** build a per-user in-memory adjacency list `Map<characterId, Edge[]>` (cached, invalidated on relationship write). Family-tree generation, "who is connected to X", and roster grouping become graph walks instead of repeated `.or()` queries + JS joins. This directly attacks the "family tree generation" and "grouped roster generation" hotspots the brief called out.
- **Centrality:** degree/weighted-degree centrality is a near-free, principled replacement for part of the hand-weighted importance score ("who matters" ≈ "who is central + recent + emotionally weighted"). Eigenvector/PageRank-style centrality over the relationship graph would be a *defensible, explainable* importance signal — strictly better CS than the current additive heuristic, and it updates naturally as edges change.
- Do **not** reach for a graph database yet. The graph is small (per-user, hundreds of nodes). An in-process adjacency map + Postgres recursive CTEs for family trees is the right scale. Neo4j is premature.

### Merge pipeline / entity resolution

`characterRegistry` resolves with Jaro-Winkler at a 0.93 threshold over candidates ([characterRegistry.ts:229,248](apps/server/src/services/characterRegistry.ts#L229)). Known failure mode (in your memory notes): "Abuela" matched "Abel Mendoza" on a shared prefix. JW over raw names is the wrong primitive for person names. See §entity-resolution in the bug-hunt doc; summary recommendation: **blocking key (normalized + phonetic, e.g. Double Metaphone) → candidate set → JW only as a tiebreaker, gated by a token-overlap requirement**, plus a hard "never merge across different kinship terms" rule.

---

## C. Event System

Tables: `resolved_events`, `event_meaning_cache`/`eventMeaningService`, `event_impacts`, timeline, life log.

- **Significance computation** ([eventSignificanceService](apps/server/src/services/events/eventSignificanceService.ts), Sprint AL) is deterministic and cheap — good. The problem is persistence/drift (see §B) and that significance is computed **per event in isolation**; it has no notion of an event's position in a *causal chain* or *arc*, which is where significance actually lives ("the breakup matters because of the 6 months before it").
- **Event meaning generation** ([eventMeaningService](apps/server/src/services/meaning/eventMeaningService.ts)): with a cache table this is sustainable **if** the cache key includes the inputs' version. Verify the key isn't just `eventId` (that would serve stale meaning after the event's evidence changes — same drift class as §B).
- **Event clustering / duplicate representations:** there are at least three overlapping event surfaces — `resolved_events`, `character_timeline_events`, `event_candidates`, plus the Sprint AM `eventReconstructionService` and `chronologyV2` stitched timeline. **This is duplication risk.** Recommendation: define **one** canonical event entity (`resolved_events`) and make the others *views/projections* of it, not parallel stores. Cluster near-duplicate events with embedding similarity + temporal proximity (a single pass, union-find), rather than re-deriving events in multiple services.

---

## D. Conversation Intelligence

Services: `questionIntentClassifier`, `memoryEvidenceFormatter`, `antiRepetitionLayer`, `therapistSuppressionRules`, `storyInsightService`.

| Part | Today | Should be |
|------|-------|-----------|
| `questionIntentClassifier` | heuristic (regex/keyword) | **deterministic fast-path + 1 nano-classifier fallback** — same fix as the recall router; these two classifiers should be **the same classifier** |
| `memoryEvidenceFormatter` | deterministic | **keep deterministic** — this is correct; evidence formatting must be reproducible and auditable |
| `antiRepetitionLayer` | heuristic string post-filter ([:1](apps/server/src/services/chat/antiRepetitionLayer.ts)) | **keep deterministic**, but back it with embedding similarity to recent assistant turns rather than string overlap (catches paraphrased repetition) |
| `therapistSuppressionRules` | hard-coded rules | **keep deterministic** — suppression must be predictable; an ML suppressor would be unauditable. Good as-is. |
| `storyInsightService` | heuristic | candidate for ML/LLM later, but only behind a confidence gate |

**Principle to adopt:** *Routing and suppression = deterministic. Generation = model. Scoring = deterministic-with-versioned-cache.* Right now routing is partly model-free (good) but duplicated (bad), and scoring is deterministic-without-invalidation (bad).

`questionIntentClassifier` (Sprint AK/AM) and the `recallQueryRouter` intent detection are **two classifiers for the same job**. Merge them.

---

## E. Discovery Hub

I did not find a single "Discovery Hub" container with clearly separable panels in the time budget; what exists is a set of Books/surfaces (Character Book, Life Log, Love & Relationships, "What AI Knows"/diagnostics, locations, organizations). The strong signal from the service layer is **conceptual duplication** that surfaces as UI duplication:

- "What AI Knows" / memory diagnostics / `intelligenceHealthCoverage` / `storyCoverageDiagnostics` / `memoryDebugMode` / `buildRecallCoverageReport` — there are now **five** diagnostic surfaces answering variations of "does the system actually know this?". These should collapse into **one** "Memory Health" concept with one backing service.
- Character Book, Love & Relationships, and the family roster all render **the same underlying entity+relationship graph** through different formatters. They are views, not separate systems — confirm they share one data source (the adjacency map from §B) rather than each running their own roster/relationship queries.

**Recommendation:** reduce Discovery to **three** durable concepts: **People** (entities + relationship graph), **Timeline/Life Log** (events + chapters), **Memory Health** (one diagnostic). Everything else is a filter or formatter over those.

---

## Phase 2 — Algorithm Review (complexity table)

| Service | Current | Target | Fix |
|--------|---------|--------|-----|
| `recallQueryRouter.routeRecallQuery` | ~`O(R·(P+C))` per turn (R≈2–3 calls, full scans) | `O(\|msg\|)` + amortized O(1) | memoized turn-plan + cached entity index (Aho-Corasick) |
| `detectMentionedEntityName` ([:66](apps/server/src/services/chat/recallQueryRouter.ts#L66)) | `O(N·M)` substring scan over all names | `O(\|msg\|)` | use `entityMentionIndexService` (already built) |
| `loadKnownEntities` ([:39](apps/server/src/services/chat/recallQueryRouter.ts#L39)) | full `people_places` scan, every call, often unused | lazy + cached | only build when an entity-intent branch needs it |
| character importance | O(memories) per entity, **re-run as global backfill** | incremental on ingest | recompute touched entity only |
| relationship scoring | O(edges) global backfill | incremental | recompute on edge write |
| grouped roster generation (`formatGroupedCharacterRosterForChat`, [:367](apps/server/src/services/chat/recallQueryRouter.ts#L367)) | per-call grouping over full roster | cache per `(userId, rosterVersion)` | adjacency map + memo |
| family tree generation | repeated `.or()` row scans + JS assembly | Postgres recursive CTE **or** one adjacency walk | graph structure |
| entity resolution (JW) | `O(candidates)` JW per mention, weak blocking | blocking + phonetic key first | Double Metaphone block → JW tiebreak |

**Data structures that genuinely help here:** per-user **adjacency map** (relationships), **inverted index / trie** (entity mention detection — already half-built), **LRU keyed by version** (scores, rosters, meaning), **union-find** (event de-duplication clustering), **embeddings** (paraphrase-robust intent + anti-repetition). **Not** worth it yet: bloom filters (membership sets are small), a graph DB (per-user graphs are tiny), materialized views in Postgres (in-process caches are simpler at this scale, *except* the significance index which is legitimately a sortable projection).

---

## Phase 5 — Next 10x features (ranked, not for implementation yet)

Ranked by (value × feasibility × moat). I deliberately **down-rank** things that add a 7th recall subsystem.

| Rank | Feature | Why it's 10x | Value | Feasibility | Moat |
|------|---------|--------------|-------|-------------|------|
| 1 | **Autobiographical memory graph** (unify entities+events+relationships into one per-user graph with adjacency + centrality) | It's the *substrate* that makes everything else cheaper and better — recall, importance, family trees, social viz all become walks. Pays down the §0 sprawl. | ★★★★★ | ★★★★ | ★★★★★ |
| 2 | **Causal chains** (link events: X led to Y) | Turns isolated `resolved_events` into narrative; powers significance-in-context and "why did this happen". This is the thing ChatGPT cannot do. | ★★★★★ | ★★★ | ★★★★★ |
| 3 | **Contradiction detection + memory confidence evolution** | Trust is the product. Surfacing "you told me two different things" + confidence that rises/falls with evidence is a unique trust feature and directly fixes hallucination. | ★★★★★ | ★★★ | ★★★★ |
| 4 | **Relationship trajectories** (closeness over time from the relationship graph) | Already have relationship scores; making them *time series* is a small step with high emotional payoff. | ★★★★ | ★★★★ | ★★★ |
| 5 | **Life chapters** (auto-segment the timeline into eras) | High narrative value; chronologyV2 already has the scaffolding. | ★★★★ | ★★★ | ★★★ |
| 6 | **Predictive recall** (surface the right memory before asked) | Magic when it works; risky for trust if wrong. Gate behind high confidence. | ★★★★ | ★★ | ★★★★ |
| 7 | Social graph visualization | Mostly a UI projection of feature #1; cheap once #1 exists. | ★★★ | ★★★★ | ★★ |
| 8 | Story generation / life replay / epiphany generation | Delightful but downstream of a clean graph + causal chains; don't build on the current sprawl. | ★★★ | ★★ | ★★★ |

**The meta-recommendation:** features #1 and #2 are not "more features" — they are the **consolidation** that the last six sprints have been approximating with point solutions. Build the graph once; delete the duplicate recall/score/story services that were compensating for not having it.

---

## What to revert / delete (challenging Composer directly)

- **Collapse the two recall routers** (`recallQueryRouter` + `conversationIntelligenceRouter`) into one. Net deletion.
- **Delete or wire up** `entityMentionIndexService` — it's built and unused; either route the router through it (preferred) or remove it.
- **Demote the Sprint AM story-reconstruction quartet** (`scene/event/relationship/story` reconstruction) to *one* `storyRecallService` backed by the graph; the four-service split is premature.
- **Stop persisting un-invalidated scores** as source-of-truth (Sprint AL) — keep the columns only as version-keyed projections with incremental recompute.
- **Consolidate the five diagnostic surfaces** into one Memory Health service.

See `docs/opus-master-roadmap.md` for sequencing, impact, risk, and dependencies, and `docs/opus-bug-hunt.md` for concrete defects + the memory-quality root causes.
