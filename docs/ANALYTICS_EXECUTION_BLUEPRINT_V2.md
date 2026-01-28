# LoreBook Analytics Execution Blueprint (V2)

**Focus:** Refactor Path + Determinism + Safety

**Purpose:**
- Provide a safe migration path from current analytics
- Avoid big-bang rewrites
- Enable incremental correctness, caching, and testing

**Assumes:**
- `ANALYTICS_ENGINE_BLUEPRINT.md` exists
- Current analytics modules already run in prod

---

## Core Idea

Wrap existing analytics first. Refactor internals later. Every step must be backward-compatible.

---

## Step 1 — Execution Orchestrator

```ts
function runAnalyticsOrchestrator(request) {
  context = buildAnalyticsContext(request)
  results = {}

  for (moduleName of REQUESTED_ANALYTICS) {
    module = ANALYTICS_REGISTRY[moduleName]
    results[moduleName] = executeModuleSafely(module, context)
  }

  return results
}
```

---

## Step 2 — Context Builder

```ts
function buildAnalyticsContext(request) {
  return AnalyticsContext({
    userId: request.userId,
    dataVersion: computeDataVersion(request.userId),
    modelVersion: ANALYTICS_MODEL_VERSION,
    timeWindow: request.timeWindow ?? defaultWindow(),
    seed: deriveSeed(request.userId, request.timeWindow)
  })
}
```

---

## Step 3 — Safe Module Execution

```ts
function executeModuleSafely(module, context) {
  try {
    return executeModule(module, context)
  } catch (error) {
    logAnalyticsError(module.name, context, error)
    return buildDegradedResult(module.name, error)
  }
}
```

---

## Step 4 — Module Execution (Wrapped)

```ts
function executeModule(module, context) {
  cacheKey = buildCacheKey(context, module.name)

  if (cache.exists(cacheKey)) {
    return cache.get(cacheKey)
  }

  startTimer()

  // TEMP: support legacy modules
  if (module.isLegacy) {
    result = wrapLegacyModule(module, context)
  } else {
    result = runBlueprintModule(module, context)
  }

  executionTime = stopTimer()
  result.diagnostics.executionTimeMs = executionTime

  cache.set(cacheKey, result)
  return result
}
```

---

## Step 5 — Legacy Module Wrapper

```ts
function wrapLegacyModule(module, context) {
  rawPayload = module.run(context.userId)

  return AnalyticsResult({
    value: rawPayload,
    confidence: null,
    sampleSize: null,
    diagnostics: {
      warnings: ["LEGACY_MODULE"],
      invariantsPassed: true
    }
  })
}
```

---

## Step 6 — Blueprint-Compliant Module

```ts
function runBlueprintModule(module, context) {
  input = fetchAndValidateInput(module.inputSchema, context)
  result = module.compute(input, context)

  result.diagnostics.invariantsPassed = module.invariants(result)

  if (!result.diagnostics.invariantsPassed) {
    result.diagnostics.warnings.push("INVARIANT_VIOLATION")
  }

  return result
}
```

---

## Step 7 — Cache Key Strategy

```ts
function buildCacheKey(context, analyticsType) {
  return hash({
    userId: context.userId,
    analyticsType,
    dataVersion: context.dataVersion,
    modelVersion: context.modelVersion,
    timeWindow: context.timeWindow
  })
}
```

---

## Step 8 — Data Versioning

```ts
function computeDataVersion(userId) {
  // Minimum viable versioning
  return hash(max(updatedAt from memories where userId))
}
```

---

## Step 9 — Seeded Determinism

```ts
function deriveSeed(userId, timeWindow) {
  return hash(userId + timeWindow.start + timeWindow.end)
}
```

---

## Step 10 — Degradation Strategy

```ts
function buildDegradedResult(moduleName, error) {
  return AnalyticsResult({
    value: null,
    confidence: 0,
    sampleSize: 0,
    diagnostics: {
      warnings: ["MODULE_FAILED", error.code],
      invariantsPassed: false
    }
  })
}
```

---

## Step 11 — Migration Plan

| Phase | Action |
|-------|--------|
| **A** | All modules run through orchestrator; all results wrapped as `AnalyticsResult` |
| **B** | Add context + cache-key correctness |
| **C** | Convert ONE module at a time: Legacy → Blueprint; add `compute()` + `invariants()` |
| **D** | Add tests + backtests per converted module |
| **E** | Remove legacy wrapper |

---

## Step 12 — Test Harness Hooks

```ts
function testModuleWithSyntheticData(module) {
  context = buildSyntheticContext()
  result = executeModule(module, context)
  assert result.diagnostics.invariantsPassed
}
```

---

## Step 13 — Observability

Log:

- `moduleName`
- `executionTimeMs`
- `cacheHit` / `cacheMiss`
- `degradedResultsCount`

---

## End-State Guarantees

- Analytics never crash requests
- Legacy and new modules coexist
- Deterministic + cache-safe
- Refactor happens incrementally
- Validation hooks exist before model upgrades

---

## Relation to Other Docs

- **Target shape:** `ANALYTICS_ENGINE_BLUEPRINT.md` defines the ideal module contract, types, and pipeline. This doc defines the **migration path** to get there.
- **Current code:** `apps/server/src/services/analytics/base.ts` has `BaseAnalyticsModule.run(userId)` and per-module caching by `(user_id, type)`. The orchestrator and context builder don’t exist yet; adding them (and treating today’s modules as “legacy” behind `wrapLegacyModule`) is the first concrete step.

---

## Where to Implement

| Piece | Suggested location |
|-------|---------------------|
| `runAnalyticsOrchestrator`, `buildAnalyticsContext`, `executeModuleSafely`, `executeModule` | New `apps/server/src/services/analytics/orchestrator.ts` (or split into `orchestrator.ts` + `execution.ts`) |
| `buildCacheKey`, `computeDataVersion`, `deriveSeed` | New `apps/server/src/services/analytics/context.ts` or inside orchestrator |
| `wrapLegacyModule`, `buildDegradedResult` | Same as orchestrator / execution |
| `AnalyticsContext`, `AnalyticsResult` (with `diagnostics`) | Extend `apps/server/src/services/analytics/types.ts` |
| Wire orchestrator into API | `apps/server/src/routes/analytics.ts` — either call orchestrator for “batch” analytics or keep per-module routes and have each route use `executeModuleSafely(module, context)` |

This keeps the blueprint as the single source of truth for the migration and makes it clear what to build next.

**See Phase B:** [ANALYTICS_EXECUTION_BLUEPRINT_PHASE_B.md](./ANALYTICS_EXECUTION_BLUEPRINT_PHASE_B.md) — cache correctness + invalidation (in-memory cache, buildCacheKey, executeModule cache check/set, optional invalidateByUser).
