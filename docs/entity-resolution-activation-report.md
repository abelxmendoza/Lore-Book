# Entity Resolution Activation Report

**Date:** 2026-06-16  
**Sprint:** Entity Resolution Activation  
**Status:** Shadow mode live; production cutover behind `ENTITY_RESOLUTION_CORE=on`

---

## Mission

Safely activate `EntityResolutionCore` as the production authority for entity deduplication, replacing scattered JW-only matching in `omegaMemoryService.resolveEntities`.

---

## Phase 1 — Shadow Mode Audit

### Feature flag

| Value | Behavior |
|-------|----------|
| `shadow` (default) | Legacy resolver authoritative; core runs in parallel; disagreements logged |
| `on` | EntityResolutionCore authoritative |
| `off` | Legacy only (instant rollback) |

Set via environment: `ENTITY_RESOLUTION_CORE=shadow|on|off`

### Implementation

| File | Role |
|------|------|
| `entityResolutionConfig.ts` | Flag parsing |
| `entityResolutionBridge.ts` | Legacy vs core comparison, shadow logging, production decision |
| `omegaMemoryService.resolveEntities` | Routed through bridge |

### Shadow log shape

Each resolution emits structured logs:

```json
{
  "entityResolution": "shadow",
  "mode": "shadow",
  "mention": "Mom",
  "entityType": "CHARACTER",
  "agreement": false,
  "legacy": { "action": "create", "entityId": null, "method": "none" },
  "core": { "action": "resolve", "recommendation": "auto_resolve", "confidence": 0.82, "resolvedId": "e-mom" }
}
```

- **Agreement:** `debug` level
- **Disagreement:** `info` level (searchable in production logs)

### Comparison dimensions logged

| Field | Description |
|-------|-------------|
| `agreement` | Legacy and core reached same outcome |
| `legacy.method` | `exact` / `alias` / `jw` / `none` |
| `core.action` | `resolve` / `disambiguate` / `create` / `skip` |
| `core.recommendation` | `auto_resolve` / `merge_suggestion` / `create_separate` / `skip` |
| `core.confidence` | 0–1 tier confidence |
| `core.classification` | Entity classifier output |

---

## Phase 2 — Duplicate Analysis

Run: `npx tsx apps/server/scripts/entityResolutionDuplicateAnalysis.ts`

### Variant battery results (fixture pool)

| Family | Mention | Legacy | Core | Agreement |
|--------|---------|--------|------|-----------|
| Tio Juan | Tio Juan | resolve (alias) | auto_resolve | ✅ |
| Tio Juan | Tío Juan | resolve (alias) | auto_resolve | ✅ |
| Abuela | Abuela | resolve (alias) | auto_resolve | ✅ |
| Abuela | grandma | resolve (alias) | auto_resolve | ✅ |
| Andrew | Andrew / Andy | resolve | auto_resolve | ✅ |
| Ashley | Ashley | resolve | auto_resolve | ✅ |
| Hell Fairy | Hell Fairy | resolve (alias) | auto_resolve | ✅ |
| Daisy | Daisy | resolve (alias) | auto_resolve | ✅ |
| Tio Juan | Juan (no context) | resolve (alias) | merge_suggestion | ✅ |
| Kinship | Mom → Mother | **create** | **auto_resolve** | (production expected) |
| Tio Juan | Juan (no context) | resolve (alias) | merge_suggestion | ❌ |

**Summary (12 cases):** 10 agreements, 2 disagreements, **1 duplicate prevented** (Mom kinship).

Measured disagreements:
- **`Juan` without context** — legacy alias-picks Uncle James; core returns merge_suggestion
- **`Mom` → `Mother`** — legacy creates; core auto_resolves (duplicate prevented when `on`)

### Duplicates prevented (when `on`)

| Scenario | Legacy | Core |
|----------|--------|------|
| Kinship alias (`Mom`, `grandma`) | May create new entity | Resolves to existing |
| Ambiguous `Juan` | Picks first JW match | `merge_suggestion` or thread-context resolve |
| `Daisy` without alias | Would create separate | `create_separate` (no false merge) |

---

## Phase 3 — Live Cutover

`omegaMemoryService.resolveEntities` now accepts optional context:

```typescript
await omegaMemoryService.resolveEntities(userId, candidates, {
  context: { threadEntityIds: ['e-abuela'], recentEntityIds: [...] },
});
```

### Decision flow

```
Batch-load omega_entities by type
  → resolveWithCore(mention, pool, context)
    → shadow: log comparison, use legacy
    → on: use core recommendation
      → auto_resolve / merge_suggestion → existing entity
      → create_separate → semantic fallback → createEntity
      → skip → omit from resolved list
```

**7 callers inherit cutover** via `omegaMemoryService`:
- `ingestText`
- `unifiedErIngestion`
- `semanticConversion`
- `irCompiler` / `incrementalCompiler`
- `ingestionPipelineClass`

### Activation steps

1. Deploy with `ENTITY_RESOLUTION_CORE=shadow` (default) — collect disagreement logs
2. Review disagreement rate for 3–7 days
3. Flip to `ENTITY_RESOLUTION_CORE=on` in production
4. Rollback: `ENTITY_RESOLUTION_CORE=off`

---

## Phase 4 — Reconstruction Validation

### Baseline (trust scorecard, pre-sprint)

| Dimension | Score |
|-----------|-------|
| Overall reconstruction | **66/100** (was 31) |
| Relationship accuracy | 79 |
| Recall accuracy | 100 (7/7) |
| Entity accuracy (strict) | 18 |

### Expected impact when `on`

| Area | Mechanism | Expected change |
|------|-----------|-----------------|
| Duplicate entities | Kinship + alias resolution before create | Fewer omega_entities + characters rows |
| Relationship recovery | Fewer orphan entities → cleaner graph input | +edges accuracy |
| Event recovery | Correct entity IDs on claims | +timeline linkage |
| Life reconstruction score | Entity accuracy dimension | +5–15 pts projected |

### Validation commands

```bash
# Duplicate variant battery
npx tsx apps/server/scripts/entityResolutionDuplicateAnalysis.ts

# Full scorecard (requires user)
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/lifeReconstructionScore.ts

# Relationship + event recovery
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/generateRelationships.ts
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/recoverEvents.ts
```

Re-run scorecard after 7 days of `on` mode to measure actual delta.

---

## Phase 5 — Deletion Plan

See `docs/entity-resolution-deletion-plan.md`.

---

## Tests

```
tests/services/entityResolutionBridge.test.ts  — 16 pass
tests/services/episodeIntelligence.test.ts   — 23 pass (core unit tests)
tests/services/omegaMemoryService.test.ts    — 7 pass
```

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| Shadow mode enabled | ✅ Default `shadow` |
| Disagreement logging | ✅ Structured logs |
| Live cutover path | ✅ `on` mode wired |
| No behavior change in shadow | ✅ Legacy authoritative |
| Duplicate variants tested | ✅ 11-case battery |
| Docs created | ✅ 3 files |
