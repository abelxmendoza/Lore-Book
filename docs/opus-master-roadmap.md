# LoreBook — Master Roadmap (Opus)

Synthesis of `opus-architecture-audit.md` + `opus-bug-hunt.md`. Ranked P0→P3. Each item: **impact · complexity · risk · dependencies**. The throughline: **consolidate the retrieval/score sprawl and make derived data self-invalidating** before building any new feature.

Legend — Impact/Complexity/Risk: ▲ low · ▲▲ med · ▲▲▲ high.

---

## P0 — Must fix now (correctness & trust)

### P0-1 · Stop "no record" false negatives (RC-2 fallback)
Add a journal/units **fallback** to the recall planner: when foundation confidence is low, vector-search `extracted_units`/`journal_entries` before asserting absence.
- **Impact:** ▲▲▲ — directly fixes Costco-class failures; biggest single trust win.
- **Complexity:** ▲▲ — one new branch in the recall path + reuse existing vector search.
- **Risk:** ▲▲ — must keep latency bounded (cap fallback to 1 vector query).
- **Deps:** none (can ship standalone).

### P0-2 · Tie assistant claims to pipeline reality (RC-3 / B5)
(a) Pre-generation: system prompt enumerates exactly the entities/memories available this turn + "claim memory only for these." (b) Never say "no record" for a name in the current thread buffer. (c) Reflect the registry's create/merge/defer decision in the wording.
- **Impact:** ▲▲▲ — kills false-creation and false-memory claims.
- **Complexity:** ▲▲
- **Risk:** ▲ — prompt + guard changes, low blast radius.
- **Deps:** light-touch synchronous entity extraction for current-message names (optional but recommended).

### P0-3 · Context-aware entity resolution (RC-4)
Exact-name candidates ranked by thread co-occurrence / shared relations / recency, not JW. Disambiguation gate when top-2 are close. Hard rule: never auto-merge across kinship terms; never use string distance to pick among identical names.
- **Impact:** ▲▲▲ — fixes "wrong Juan" and "Abuela≈Abel."
- **Complexity:** ▲▲
- **Risk:** ▲▲ — touches merge pipeline; ship behind a flag + shadow-compare against current behavior.
- **Deps:** entity index (P1-1) makes this cheaper but isn't required.

### P0-4 · Make derived scores self-invalidating (B1/B7)
Recompute touched entity/event significance+importance on the ingest **and correction** hooks. Make score columns nullable + `scored_at`; NULL ≠ minor. Keep backfill scripts for DR only.
- **Impact:** ▲▲▲ — stops silent drift; required before scores drive any UI ranking.
- **Complexity:** ▲▲ — hooks already exist (Sprint AL); extend to incremental.
- **Risk:** ▲ — additive.
- **Deps:** none.

### P0-5 · Enforce evidence-linking at entity creation (RC-1)
Promotion transaction attaches the originating unit/utterance via `provenance_edges`. Turn `storyCoverageDiagnostics` into a failing invariant ("character with mentions but no linked memory").
- **Impact:** ▲▲▲ — fixes "exists but no story/memories" (Ashley/Jerry/Tía Grace).
- **Complexity:** ▲▲
- **Risk:** ▲▲ — touches ingestion; backfill existing orphaned characters.
- **Deps:** none, but pairs with P1-2.

---

## P1 — Next sprint (consolidation that pays down sprawl)

### P1-1 · One entity index, used everywhere
Wire `entityMentionIndexService` into the recall path (Aho-Corasick/trie match); delete the per-turn full scans and the raw `.includes()`. Cache per user, invalidate on ingest.
- **Impact:** ▲▲▲ (scalability) — removes the per-turn full-table scans.
- **Complexity:** ▲▲ — index exists; wire + cache.
- **Risk:** ▲▲ — correctness parity test vs. current detection.
- **Deps:** unblocks P1-3.

### P1-2 · Unify the two recall routers
Merge `recallQueryRouter` into `conversationIntelligenceRouter`; route **once** per turn; pass the plan to explicit-recall and RAG (kills B2). Net code deletion.
- **Impact:** ▲▲▲ — removes redundant passes, single source of truth for intent.
- **Complexity:** ▲▲▲ — careful refactor; lots of call sites.
- **Risk:** ▲▲▲ — central path; do behind a flag with golden-transcript regression tests.
- **Deps:** P1-1 helps; the existing `sprintAiRecall`/`sprintAk` tests are the safety net.

### P1-3 · Unify intent classifiers + deterministic-first/model-second
`questionIntentClassifier` and the router's intent detection become one classifier: regex fast-path → 1 nano/embedding fallback with strict enum output. Removes the ordering-bug class.
- **Impact:** ▲▲ — robustness to paraphrase; deletes hand-ordered regex fragility.
- **Complexity:** ▲▲
- **Risk:** ▲▲ — add eval set of labeled queries before/after.
- **Deps:** P1-2.

### P1-4 · Collapse diagnostics into one "Memory Health"
Merge `intelligenceHealthCoverage` + `storyCoverageDiagnostics` + `memoryDebugMode` + `buildRecallCoverageReport` + "What AI Knows" into one service/surface with the invariants from the bug-hunt doc.
- **Impact:** ▲▲ — clarity + one trustworthy health view; reduces UI duplication.
- **Complexity:** ▲▲
- **Risk:** ▲
- **Deps:** benefits from P0-4/P0-5 invariants.

---

## P2 — Later (the substrate)

### P2-1 · Autobiographical memory graph (adjacency map + centrality)
Per-user in-memory graph of entities/events/relationships; family trees, roster grouping, importance-via-centrality, "who's connected to X" all become walks. Replaces the hand-weighted importance heuristic with explainable degree/eigenvector centrality.
- **Impact:** ▲▲▲ — the consolidation feature; makes #2/#7/#8 cheap.
- **Complexity:** ▲▲▲
- **Risk:** ▲▲ — additive layer over existing tables; no schema rewrite.
- **Deps:** P1-1/P1-2 (so there's one consumer, not six).

### P2-2 · Demote Sprint AM reconstruction quartet → one graph-backed story service
Fold `scene/event/relationship/story` reconstruction into a single recall that walks the graph. Net deletion.
- **Impact:** ▲▲ (maintainability)
- **Complexity:** ▲▲
- **Risk:** ▲▲
- **Deps:** P2-1.

### P2-3 · Canonical event model + dedup clustering
Make `character_timeline_events`/`event_candidates`/reconstructed events **projections** of `resolved_events`; union-find clustering on embedding+time to remove duplicate event representations.
- **Impact:** ▲▲
- **Complexity:** ▲▲▲
- **Risk:** ▲▲▲ — data migration; do with shadow + reconciliation.
- **Deps:** P2-1.

---

## P3 — Future research (high-value features, only on a clean substrate)

| Item | Impact | Complexity | Risk | Deps |
|------|--------|------------|------|------|
| Causal chains (event → event) | ▲▲▲ | ▲▲▲ | ▲▲ | P2-1, P2-3 |
| Contradiction detection + confidence evolution | ▲▲▲ | ▲▲▲ | ▲▲ | P0-4, P2-1 |
| Relationship trajectories (closeness over time) | ▲▲ | ▲▲ | ▲ | P0-4 |
| Life chapters (auto-segment timeline) | ▲▲ | ▲▲▲ | ▲▲ | P2-3, chronologyV2 |
| Predictive recall (gate behind high confidence) | ▲▲▲ | ▲▲▲ | ▲▲▲ | P2-1, contradiction layer |
| Social graph visualization | ▲▲ | ▲ | ▲ | P2-1 |

---

## Sequencing rationale

1. **P0 is all correctness/trust** and each item ships independently — do them first; they directly fix the transcript failures and the score-drift the correction loop exposed.
2. **P1 consolidates** the sprawl (§0 of the audit) so there's a single retrieval contract to build on — this is where you *delete* code.
3. **P2 builds the graph substrate** that the last six sprints were approximating with point solutions.
4. **P3 features** are only safe on top of P2; building them on today's sprawl would add a 7th subsystem.

## Explicit "challenge Composer" calls
- **Partially revert Sprint AL's persistence model:** keep the deterministic scorers, drop "stored, manually-backfilled, default-minor" — it ships drift. (P0-4/B7)
- **Partially revert Sprint AM's service split:** the four reconstruction services are premature; one graph-backed recall is better. (P2-2)
- **Don't add a 7th recall path.** The next recall improvement must *remove* a router, not add one. (P1-2)
- **Wire up or delete `entityMentionIndexService`** — shipping an unused scalability fix is worse than not shipping one. (P1-1/B6)
