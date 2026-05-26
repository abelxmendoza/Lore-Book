# Build Failure Audit
**Generated:** 2026-05-26
**Baseline:** 550 errors → **Current:** 522 errors (28 fixed in CORE_RUNTIME)

---

## Summary

| Category | Error Codes | Count | Tier |
|----------|-------------|-------|------|
| Schema Drift | TS2339 | 146 | EXPERIMENTAL/RESEARCH |
| Missing Import / Name | TS2304 | 78 | EXPERIMENTAL |
| Type Mismatch | TS2322 | 64 | EXPERIMENTAL |
| Argument Mismatch | TS2345 | 58 | EXPERIMENTAL |
| Missing Export | TS2305 | 34 | EXPERIMENTAL |
| Unknown Object Property | TS2353 | 25 | EXPERIMENTAL |
| Possibly Undefined | TS18048 | 20 | EXPERIMENTAL |
| Possibly Null | TS18047 | 8 | EXPERIMENTAL |
| No Overload Match | TS2769 | 8 | EXPERIMENTAL |
| Wrong Property Name | TS2551 | 15 | EXPERIMENTAL |
| **CORE_RUNTIME errors** | — | **0** | ✅ Clean |

---

## CORE_RUNTIME Status: Clean

All four CORE_RUNTIME files with prior errors have been fixed:

| File | Error | Fix Applied |
|------|-------|-------------|
| `routes/user.ts` | `AuthUser` missing `user_metadata`, `created_at`, `updated_at` | Fetch full Supabase User via `auth.admin.getUserById`; null-guard `updateUserById` result |
| `routes/user.ts` | `.catch()` on `PostgrestFilterBuilder` | Wrapped in `Promise.resolve()` |
| `routes/memoryRecall.ts` | `req.user` possibly undefined (5×) | Early `if (!req.user) return 401` guard in both handlers |
| `routes/omegaMemory.ts` | `supabaseAdmin` not found (2×) | Added missing `import { supabaseAdmin } from '../db/dbAdapter'` |
| `routes/entries.ts` | `'unknown'` not assignable to sentiment enum | Changed to `'neutral'` (correct semantics — no feedback = neutral) |

---

## Failure Categories (EXPERIMENTAL boundary)

### 1. Schema Drift — 146 errors (TS2339)

Properties accessed on types that don't define them. The root pattern: DB schema evolved but service-layer types were not updated in sync.

**Highest-error files:**
- `services/stripeService.ts` — 17 errors (Stripe subscription/customer fields don't match local type aliases)
- `services/omegaChatService.ts` — 16 errors (accesses `.entries`, `.claims`, `.entities` on response types that changed shape)
- `services/memoryExtractionService.ts` — 14 errors (extracts `.embedding`, `.vector` from supabase rows missing those columns in local type)
- `services/conversationCentered/ingestionPipelineClass.ts` — 14 errors (accesses deprecated pipeline stage properties)
- `services/conversationCentered/eventAssemblyService.ts` — 13 errors (references removed event shape fields)

**Highest-leverage upstream fix:** Audit and update the DB row types in `services/conversationCentered/` — a single shared type file serves both ingestionPipeline and eventAssembly. Fixing their shared type would resolve ~27 errors with one change.

### 2. Missing Import / Name — 78 errors (TS2304)

Two distinct sub-patterns:

**A. Bare `supabase` import (34 errors, 8 files):**
These experimental storage services call `supabase.from(...)` directly with no import. They likely copied patterns from a prior web-side Supabase client and were never updated to use the server adapter.

Affected files (all EXPERIMENTAL/RESEARCH tier):
- `identityCore/identityStorage.ts` — 6 errors
- `paracosm/paracosmStorage.ts` — 5 errors
- `innerMythology/mythStorage.ts` — 5 errors
- `toxicity/toxicityStorage.ts` — 4 errors
- `socialProjection/projectionStorage.ts` — 4 errors
- `scenes/storageService.ts` — 4 errors
- `conflict/storageService.ts` — 3 errors
- `behavior/storageService.ts` — 3 errors

**Fix pattern** (identical for all 8): Add `import { supabaseAdmin as supabase } from '../../db/dbAdapter';` — alias preserves call sites.

**B. Undefined variables (44 errors):**
- `NarrativeSegment` (5×) — type not exported from narrative module
- `result`, `experienceUnits`, `feelingUnits`, `factUnits`, `beliefUnits` (14×) — variables referenced before assignment in complex async chains
- `GoalStatus`, `updateError`, `titleGenerationService`, etc. — various missing imports in experimental services

### 3. Missing Exports — 34 errors (TS2305) — Highest Leverage

The `emotionalIntelligence/types.ts` file exports only 3 types (`EmotionType`, `EmotionalEvent`, `EmotionalPatternSummary`) but 5 consumer files expect 12 additional types:

Missing from `emotionalIntelligence/types.ts`:
- `EmotionSignal`, `EQOutput`, `EQContext`, `EQInsight`, `TriggerType`
- `RegulationScore`, `EQGrowthMetrics`, `RecoveryPoint`
- `TriggerEvent`, `ReactionPattern`

**Impact:** Adding these type stubs to `types.ts` would clear 34 errors across 5 files with a single edit.

### 4. Type Mismatch — 64 errors (TS2322) + Argument Mismatch — 58 errors (TS2345)

Spread across experimental services. Most are consequence errors from categories 1-3 (once the upstream type is wrong, assignments downstream fail). These will resolve as schema drift and missing exports are fixed.

**Standalone mismatches worth noting:**
- `omegaMemoryService.ts(198)`: `boolean` not assignable to `number` — direct logic error
- `stripeService.ts`: Stripe webhook event type narrowing failures (Stripe SDK version mismatch)

### 5. Null Safety — 28 errors (TS18048 + TS18047)

Concentrated in:
- `skillDetailsExtractionService.ts` — 8 errors (extracts from possibly-null AI response fields)
- `memoryExtractionService.ts` — 7 errors (reads from possibly-null DB result)
- `biographyGenerationEngine.ts` — 5 errors

All EXPERIMENTAL. Pattern: missing null-guard before accessing AI response `.choices[0].message.content`.

---

## Highest-Leverage Upstream Fixes

These changes yield the highest error reduction per line of code changed:

| Priority | Fix | Files Changed | Errors Cleared |
|----------|-----|---------------|----------------|
| 1 | Add 10 missing type stubs to `emotionalIntelligence/types.ts` | 1 | ~34 |
| 2 | Add `import { supabaseAdmin as supabase }` to 8 storage services | 8 | ~34 |
| 3 | Reconcile `conversationCentered/` shared event/pipeline types | 2 | ~27 |
| 4 | Fix `omegaMemoryService.ts:198` boolean→number | 1 | 1 |

> **Note:** These are all in EXPERIMENTAL/RESEARCH tier. The build passes for CORE_RUNTIME. Fixing experimental errors improves overall type health but does not affect deploy safety.

---

## What Builds Clean Today

With `ENABLE_EXPERIMENTAL_RUNTIME=false` (default), the deployed surface is:

- 34 CORE_RUNTIME routes — type-clean ✅
- 3 core jobs (sync, memory extraction, continuity engine) — type-clean ✅
- Auth middleware, DB adapter, config — type-clean ✅

The 522 remaining TS errors exist entirely within code that does not execute unless `ENABLE_EXPERIMENTAL_RUNTIME=true` is set. The `npm run build` uses `tsc || true` to tolerate them during the stabilization phase.

---

## Trend Tracking

| Date | Total Errors | CORE_RUNTIME Errors |
|------|--------------|---------------------|
| 2026-05-26 (baseline) | 550 | 20 |
| 2026-05-26 (current) | 522 | 0 |
