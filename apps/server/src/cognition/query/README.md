# LoreBook Query Engine

The canonical retrieval architecture. Every question about the user's world
flows through one pipeline instead of per-pattern handlers:

```
Natural Language
        ↓
IntentClassifier          (regex today — swappable for ML without downstream changes)
        ↓
QueryPlanner              (pure, synchronous: QueryClassification → QueryPlan)
        ↓
Execution Plan
        ↓
┌────────────┬────────────┬────────────┬────────────┬──────────────┬─────────────┐
│ Structured │ Thread     │ Semantic   │ Working    │ Crystallized │ Graph /     │
│ (router)   │ (convo)    │ (journal)  │ Memory     │ (claims)     │ Timeline /  │
│            │            │            │            │              │ Analytics*  │
└────────────┴────────────┴────────────┴────────────┴──────────────┴─────────────┘
        ↓
ResultMerger              (dedupe · rank · confidence weighting · provenance)
        ↓
Provenance + Confidence   (every answer knows where it came from)
        ↓
LLM Response
```
\* placeholders — planned in every relevant QueryPlan so the plan shape is
stable when the real executors land.

## Files

| File | Responsibility |
|---|---|
| `QueryTypes.ts` | The whole vocabulary: `QueryType` taxonomy, `QueryPlan`, `QueryResult`, provenance/citation models, graph + analytics interfaces, `TimeWindow`. |
| `IntentClassifier.ts` | Wraps `recallIntentPatterns` regexes; emits `QueryClassification` (intent, confidence, matched entities/dates/locations). Regexes are private here. |
| `QueryPlanner.ts` | `QueryType → PlannedExecutor[]` mapping + filters. Pure, no I/O. |
| `QueryExecutor.ts` | Executor interface + implementations. Executors **orchestrate** existing services (recall router, thread recall, memoryRecallEngine, workingMemoryAssembler, omega claims) — they never own SQL or duplicate caching. |
| `ResultMerger.ts` | The single merge point: dedupe by record identity, rank by source-weighted confidence, aggregate provenance and citations. |
| `QueryEngine.ts` | Orchestration: classify → plan → execute (parallel, per-executor error isolation) → merge. Also `executeKind()` for the legacy flow. |

## Execution flow

1. `queryEngine.run({ userId, message, conversationHistory, threadId })`
2. `classifyQuery` maps the message to a `QueryType` (legacy sync-recall intents
   map deterministically: `family → RELATIONSHIP`, `entity/biography → IDENTITY`,
   `temporal → TIMELINE`, roster → `AGGREGATE`, …). Messages with no legacy
   match get future-facing classification (COMPARISON/CAUSAL/NARRATIVE/GRAPH/
   AGGREGATE) or fall to SEMANTIC.
3. `planQuery` produces the executor lineup. Two invariants preserved from the
   legacy router: live conversation history always schedules the thread
   executor first, and foundation-primary intents never schedule semantic
   journal fallback.
4. Executors run in parallel; a throwing executor yields an empty
   `QueryResult` with `error` set — it can degrade an answer, never fail it.
5. `mergeResults` returns records ranked by `confidence × sourceWeight`
   (foundation > thread > crystallized > semantic > working memory), plus
   aggregated provenance and citations.

## Backwards compatibility

`executeExplicitRecall` (chat recall) keeps its exact response policy —
thread-first, foundation-primary, verified silence, journal supplement — but
every data access now goes through `queryEngine.executeKind(...)`. Executor
results carry the untranslated legacy payload in `QueryResult.raw` so the
existing formatting stays byte-identical. New callers should consume
`records`/`merged` instead of `raw`.

## Adding a new query type

1. Add the value to `QueryType` (QueryTypes.ts).
2. Classify it in `IntentClassifier` (add a pattern — or later, a label in the
   ML classifier).
3. Add a rule row in `PLANNING_RULES` (PlanningRules.ts) — stages, tiers, conditions.
4. If it needs a new backend, implement a `QueryExecutor` and register it in
   `createDefaultExecutorRegistry`.

Nothing else changes: the plan, merger, provenance, and engine API are already
generic over executor kinds.

## How graph reasoning plugs in

`GraphExecutor` ships as interfaces (`GraphNode`, `GraphEdge`, `TraversalPlan`,
`TraversalResult`) with an empty `traverse()`. The real implementation walks
`character_relationships` (+ omega entity edges) breadth-first — the same
family-edge connectivity rules the family tree uses — and answers queries like
“who introduced me to X” as paths (`Abel → Tony → Renna`) returned as records
with per-edge provenance. RELATIONSHIP and GRAPH plans already schedule it, so
enabling it is purely an executor change.

## How analytics plugs in

`AnalyticsExecutor.aggregate(spec: AggregateSpec)` defines the contract:
`metric × groupBy × timeframe` (most-mentioned people, most-visited places,
skill usage, happiest month). Implementations must be batched SQL
aggregations — never per-entity loops. COMPARISON and AGGREGATE plans already
schedule the executor.

## Phase 2 — Intelligent planning

### Planner lifecycle

```
message
  → classify (IntentClassifier)
  → resolve entities (EntityResolver — canonical IDs before planning)
  → plan (PLANNING_RULES table → PlanStage[] with priority tiers + conditions)
  → adaptive execution (tier by tier)
  → merge (+ explainable confidence breakdown)
  → inspector trace + metrics
```

### Entity-first planning

`EntityResolver` wraps the foundation entity index (characters, locations,
organizations — canonical names *and* aliases, one batched load). Mentions
resolve to `ResolvedQueryEntity` with method `exact | alias | partial |
unresolved`, ambiguity candidates, and confidence. Plans carry
`resolvedEntities`, the context hands them to every executor, and entity
resolution is recorded in provenance (`entityResolution` field). Executors
should anchor on IDs whenever present instead of re-matching names.

### Cost-based + adaptive execution

Every executor has an `ExecutorProfile` (estimated latency, token cost,
expected confidence gain, cacheability, priority) in `PlanningRules.ts`.
Execution is incremental:

- stages run in **priority tiers** (same tier = parallel),
- each stage has a `runIf` condition — `always`, `if_low_confidence`
  (skip when merged confidence ≥ the plan's `sufficientConfidence`, default
  0.9), or `if_no_records`,
- after every tier the engine re-merges; once confidence is sufficient *and*
  evidence exists, remaining tiers are skipped (recorded as `skipped` results
  with reasons — visible in traces, ignored by the merger).

So "who is X?" typically runs structured only and stops at 0.9+; a weak
structured hit lets crystallized claims (then semantic, where planned) fire.

### Planner heuristics

Planning decisions are data (`PLANNING_RULES`), not switch statements:
IDENTITY prefers structured and never runs semantic first; TIMELINE runs
timeline+structured then semantic; GRAPH runs structured → graph → semantic
only if nothing was found; COMPARISON runs structured → semantic-if-needed →
analytics. Editing behavior = editing the table.

### Confidence propagation

Executors report confidence → the merger weights it by source trust →
`MergedQueryResponse.confidenceBreakdown` lists every contributing source's
raw score, weight, and weighted score, and the final confidence is the best
weighted contribution. Confidence is explainable end-to-end.

### Query Inspector (internal only)

`queryInspector` keeps a ring buffer (last 100) of full traces: query, intent,
resolved entities, the plan (stages/tiers/conditions), which executors ran or
were skipped and why, per-executor latency/cache/record counts, merge output,
final confidence, early-stop flag. Read with `getRecentTraces()` /
`getLastTrace()`. Not exposed publicly — this is the retrieval debugging tool
and the seam a future dev-console "Query Inspector" UI plugs into.

### Execution metrics

`executionMetrics.snapshot()` → totals, average latency/executor count/
confidence, per-executor usage rates (semantic %, graph %), cache hit rate,
early-stop rate, fallback frequency, knowledge-gap frequency, intent counts.
In-memory, optional (`QUERY_METRICS_DISABLED=true`), zero I/O — the raw
material for planner learning (which plans yield the highest confidence).

## Performance rules

- The engine adds **zero** new queries: every executor delegates to services
  that already batch, cache (RAG packet cache, lore cache, entity resolution
  cache), and respect the egress column allowlists.
- Executors run in parallel per plan.
- Planning and classification are synchronous and allocation-cheap.
