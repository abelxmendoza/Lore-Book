# LoreBook Analytics Engine — Pseudocode Blueprint

**Goal:** Correctness → Optimization → Validation

---

## Core Principles

- **Deterministic**
- **Pure where possible**
- **Typed inputs/outputs**
- **Reproducible (seeded)**
- **Versioned (data + model)**
- **Testable in isolation**
- **Cacheable by semantic keys**

---

## Shared Types

```ts
type DataVersion = string
type ModelVersion = string
type Seed = number
type Timestamp = number

type AnalyticsContext = {
  userId: string
  dataVersion: DataVersion
  modelVersion: ModelVersion
  timeWindow?: { start: Timestamp; end: Timestamp }
  seed?: Seed
}

type AnalyticsResult<T> = {
  value: T
  confidence: number          // 0.0 – 1.0
  sampleSize: number
  diagnostics: Diagnostics
}

type Diagnostics = {
  executionTimeMs: number
  warnings: string[]
  invariantsPassed: boolean
  seed?: Seed
}

type CacheKey = {
  userId: string
  dataVersion: DataVersion
  modelVersion: ModelVersion
  timeWindow?: { start: Timestamp; end: Timestamp }
  analyticsType: string
}
```

---

## High-Level Pipeline

```ts
function runAnalyticsPipeline(context: AnalyticsContext): void {
  rawData = fetchCanonicalData(context)

  for (analyticsModule of ANALYTICS_REGISTRY) {
    result = runAnalyticsModule(analyticsModule, rawData, context)
    persistAnalyticsResult(context, analyticsModule.name, result)
  }
}
```

---

## Analytics Module Contract

```ts
interface AnalyticsModule<Input, Output> {
  name: string
  inputSchema: Schema
  outputSchema: Schema

  compute(input: Input, context: AnalyticsContext): AnalyticsResult<Output>

  invariants(result: AnalyticsResult<Output>): boolean
}
```

---

## Standard Module Execution

```ts
function runAnalyticsModule(module, rawData, context) {
  cacheKey = buildCacheKey(context, module.name)

  if (cache.exists(cacheKey)) {
    return cache.get(cacheKey)
  }

  validatedInput = validateInput(rawData, module.inputSchema)

  startTimer()
  result = module.compute(validatedInput, context)
  executionTime = stopTimer()

  result.diagnostics.executionTimeMs = executionTime
  result.diagnostics.invariantsPassed = module.invariants(result)

  if (!result.diagnostics.invariantsPassed) {
    result.diagnostics.warnings.push("Invariant violation")
  }

  cache.set(cacheKey, result)
  return result
}
```

---

## Pure Analytics Pattern

```ts
function computeAnalytics(data, context) {
  seedRandom(context.seed)

  features = extractFeatures(data)
  metrics = calculateMetrics(features)
  confidence = computeConfidence(metrics.sampleSize)

  return AnalyticsResult({
    value: metrics,
    confidence,
    sampleSize: metrics.sampleSize,
    diagnostics: {}
  })
}
```

---

## Python Bridge (Node → Py)

```ts
function callPythonModel(moduleName, payload, context) {
  request = {
    payload,
    seed: context.seed,
    modelVersion: context.modelVersion
  }

  response = python.execute(moduleName, request)

  assert response.schema == expectedSchema
  return response
}
```

---

## Optimization Layer

- **Prevent N² explosions**

```ts
function preAggregate(data) {
  return {
    byDay,
    byEntity,
    byRelationship,
    byEra
  }
}
```

- **Memoize heavy transforms**

```ts
memoize(graphConstruction)
memoize(entityEmbeddings)
```

---

## Validation & Testing

- **Unit tests (golden datasets)**  
  e.g. `"identity drift = 0 for identical snapshots"`

- **Invariant tests**
  - `assert confidence increases as sampleSize increases`
  - `assert no negative probabilities`
  - `assert centrality within expected bounds`

- **Backtesting**

```ts
function backtestPrediction(module, historicalData) {
  for (snapshot of historicalData) {
    prediction = module.compute(snapshot.past)
    compare(prediction, snapshot.actual)
  }
  reportErrorMetrics()
}
```

---

## Self-Consistency Checks

```ts
function crossValidateInsights(results) {
  detectContradictions(results)
  downgradeConfidenceIfInconsistent()
}
```

---

## Human Feedback Loop

```ts
function ingestUserFeedback(analyticsId, agreementScore) {
  updateConfidenceCalibration(analyticsId, agreementScore)
}
```

---

## Versioning

- Any **logic change** increments `modelVersion`
- Any **memory edit** increments `dataVersion`
- Cached analytics invalidated automatically when version or time window changes

---

## Analytics Registry

```ts
ANALYTICS_REGISTRY = [
  IdentityPulseModule,
  RelationshipGraphModule,
  ShadowEngine,
  LifeMap,
  PredictionEngine,
  MemoryFabric,
  XPAnalytics
]
```

---

## End State

- Reproducible insights  
- Fast via caching + preaggregation  
- Testable math  
- Backtested predictions  
- Confidence-aware analytics  
- Human feedback integrated  

---

## Current State vs Blueprint

| Blueprint concept | Current implementation |
|-------------------|------------------------|
| **AnalyticsContext** | Only `userId` used; no `dataVersion`, `modelVersion`, `timeWindow`, or `seed` in shared context. |
| **AnalyticsResult&lt;T&gt;** | Payloads use `AnalyticsPayload` (metrics, charts, clusters, graph, insights, summary) but no unified `confidence`, `sampleSize`, or `diagnostics`. |
| **CacheKey** | Cache key is `(user_id, type)` in `analytics_cache`; no version or time-window in key, so no automatic invalidation on data/model change. |
| **Module contract** | `BaseAnalyticsModule` has `run(userId): Promise<AnalyticsPayload>`; no `compute` + `invariants`, no input/output schemas, no shared context. |
| **Pipeline** | Modules run per-request per-module via routes; no single `runAnalyticsPipeline` or shared canonical data fetch. |
| **Pure + seeded** | No shared seeding; modules are async and depend on DB, not pure. |
| **Diagnostics** | No `executionTimeMs`, `warnings`, or `invariantsPassed` in cached or returned payloads. |
| **Python bridge** | `spawnPython(module, payload)` exists (e.g. habits, goals); no `seed`/`modelVersion` in bridge contract. |
| **Preaggregation** | No shared `preAggregate`; each module fetches and aggregates independently. |
| **Invariant tests** | No shared invariant assertions; some logic in entity confidence / analytics feedback. |
| **Backtesting** | No backtest harness for prediction modules. |
| **Human feedback** | Entity confidence and “analytics confidence feedback” exist; no generic `ingestUserFeedback(analyticsId, agreementScore)` API. |
| **Registry** | Module list lives in `analytics/index.ts` exports and route wiring; no single `ANALYTICS_REGISTRY` array used by a pipeline. |

Use this blueprint as the target architecture when refactoring toward correctness, optimization, and validation.

**See also:** [ANALYTICS_EXECUTION_BLUEPRINT_V2.md](./ANALYTICS_EXECUTION_BLUEPRINT_V2.md) — safe migration path: wrap existing modules first, refactor internals later, no big-bang rewrites.
