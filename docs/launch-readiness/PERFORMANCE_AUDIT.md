# PERFORMANCE AUDIT

Focus: latency and DB pressure on the live chat loop. Static trace + known hot
spots from prior egress/WMA work.

---

## Latency model of a chat response

`chatStream()` executes a largely **sequential** chain of awaited service calls
before the answer streams (see COST_PER_MESSAGE.md table). Latency is therefore
**additive**: each decorator stage (continuity, connections, guidance,
interpretation, memory-suggestion, dates) adds its own round-trip — several are
LLM calls of 300ms–2s each. Time-to-first-token is gated by the slowest
prefix of this chain, not just the answer model.

**Biggest single win: parallelize independent decorators** (they don't depend on
each other) and/or collapse them into one call. Today they appear to run
sequentially.

---

## Database hot spots

1. **workingMemoryAssembler N+1 / full-table scans.** Prior consolidation work
   flagged ~16 queries per message with full-table scans, target 6–8. This is the
   top DB cost on the hot path. **P1.**
2. **Entity resolution pool loads.** `omegaMemoryService` loads up to **500 rows
   per entity type** per resolution (its own code comments note this), plus a
   vector RPC. Repeated per message and per ingestion fan-out unit. **P1.**
3. **Egress on vector columns.** Largely addressed: `OMEGA_ENTITY_COLS` /
   `OMEGA_CLAIM_COLS` projections exclude the 1536-d embedding, and HNSW indexes
   shipped (migration 20260626100000). Keep the "never SELECT embedding unless
   doing JS cosine" rule enforced. ✅ mostly done.
4. **`findSimilarClaims` keeps `select('*')`** (intentionally, to reuse stored
   embeddings for conflict detection) — acceptable but scales with claims/entity;
   watch as lore grows. **P2.**

---

## Top opportunities (ranked)

1. **Parallelize / merge the decorator LLM calls** — largest TTFT reduction.
2. **Fix WMA N+1 + full-table scans** — largest DB reduction (16→6–8 queries).
3. **Move non-essential decorators off the latency path** (memory-suggestion,
   strategic guidance, connections can be post-hoc or cached).
4. **Cap resolution pool loads** with tighter pre-filters / indexed candidate
   selection instead of 500-row pulls.
5. **Stream earlier**: begin the answer completion as soon as the RAG packet is
   ready; compute decorators concurrently and append, rather than blocking on them.
6. **Background the background**: ensure the ~10 fire-and-forget jobs never delay
   `res.end()` (they currently run after, but verify none are awaited on the hot
   path under any branch).

---

## Top "slowest operations" candidates (verify with stage timers)

The codebase already has `stageTimer` emitting `stage.timing`. Capture a real
flamegraph; expected order of cost:

1. Final answer streaming completion (unavoidable, but start it sooner)
2. RAG packet build (embedding + vector search + WMA assembly)
3. workingMemoryAssembler reads (N+1)
4. Entity resolution pool loads (background)
5. Interpretation LLM call
6. Continuity + connections + guidance LLM calls (sequential)
7. Persona RL selection
8. Ingestion entity extraction (background)
9. Date/time extraction LLM call
10. Memory-suggestion LLM call

> Action: run the existing `stage.timing` instrumentation on 50 real messages and
> replace this ranked guess with measured p50/p95 per stage.
