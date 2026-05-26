# Schema Drift Audit
**Stabilization Phase Alpha — generated 2026-05-26**

Documents mismatches between DB schema, TypeScript interfaces, and runtime expectations detected during Phase Alpha type analysis.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 CRITICAL | Causes runtime data loss or silent corruption |
| 🟠 HIGH | Causes route failures or incorrect query results |
| 🟡 MEDIUM | Causes TS errors, degraded features |
| 🟢 LOW | Cosmetic / naming drift, no runtime impact |

---

## Epistemic Governance

### `SensemakingContract` (🟠 HIGH)

**File:** `src/contracts/sensemakingContract.ts`, `src/contracts/contractEnforcer.ts`, `src/contracts/contractResolver.ts`, `src/contracts/memoryViewBuilder.ts`

**Drift detected:**

| Property accessed in code | Status in TS interface |
|---------------------------|----------------------|
| `disallowed_knowledge_types` | ❌ Missing — interface has `allowed_knowledge_types` only |
| `temporal_scope` | ❌ Missing from interface |
| `temporal_window_days` | ❌ Missing from interface |
| `promotion_rules` | ❌ Missing from interface |
| `output_constraints` | ❌ Missing from interface |
| `allowed_canon_statuses` | ❌ Missing — required in type but not in all constructors |

**Fix:** Audit DB `sensemaking_contracts` table schema. Add missing fields to `SensemakingContract` interface OR remove dead property accesses if these columns don't exist in DB.

---

### `EntryIR` / Canon Status (🟠 HIGH)

**File:** `src/contracts/contractEnforcer.ts`

**Drift detected:**

| Property | Status |
|----------|--------|
| `canon_status` | ❌ Missing from `EntryIR` interface |

**Fix:** Check `entry_irs` table — does it have `canon_status` column? If yes, add to `EntryIR`. If no, remove the access.

---

## Stripe API Version (🟡 MEDIUM)

**File:** `src/billing/stripeClient.ts:9`

```typescript
apiVersion: '2023-10-16'  // TS error: not assignable to '"2025-12-15.clover"'
```

**Fix:** Update `apiVersion` to `'2025-12-15.clover'` to match current Stripe SDK expectation, then audit any deprecated API surface used.

---

## `ChapterInput` Interface (🟡 MEDIUM)

**File:** `src/routes/chapters.ts`

**Drift detected:**

| Property used | Interface name |
|---------------|---------------|
| `start_date` (snake_case) | `startDate` (camelCase) in `ChapterInput` |

**Fix:** Normalize to camelCase at route boundary before passing to service.

Also: `ChapterService` is missing methods:
- `updateChapter()` — called at line 68
- `deleteChapter()` — called at line 76 (currently resolves to `getChapter`)

**Fix:** Implement missing service methods or remove the routes.

---

## `ChaptersController` (🟡 MEDIUM)

**File:** `src/controllers/chaptersController.ts`

- `logger` is not imported (lines 61, 68, 82) — causes runtime `ReferenceError`
- Zod refinement type mismatch on `endDate` validator

**Fix:** Add `import { logger } from '../logger'` and fix the Zod refinement signature.

---

## Supabase QueryChain `{}` Collapse (🟠 HIGH — FIXED in Phase Alpha)

**Root cause:** `supabaseMock.ts` typed `QueryChain` result as `{ data: unknown }`. TypeScript resolved `supabaseAdmin` as `SupabaseMock | SupabaseClient` union, collapsing `data` to `unknown` in all call sites. Every downstream `.map()`, `.filter()`, `.length`, `.find()`, `.reduce()` access on query results failed type-checking.

**Fix applied:**
- `supabaseMock.ts`: Changed `data: unknown` → `data: any` (aligns mock with real Supabase client's untyped default behavior)
- `dbAdapter.ts`: Explicitly typed `supabaseAdmin` as `SupabaseClient` — eliminates the union leak into production type inference
- Added all missing mock methods: `.or()`, `.neq()`, `.lt()`, `.gt()`, `.filter()`, `.auth`, `.storage`

---

## Express `req.user` Type Widening (🟡 MEDIUM — FIXED in Phase Alpha)

**Root cause:** `AuthenticatedRequest` was a local type alias extending `Request`. Routes typed as `Request` (not `AuthenticatedRequest`) couldn't access `req.user`, producing hundreds of `Property 'user' does not exist` errors.

**Fix applied:**
- Created `src/types/runtime/express.ts` with `declare global namespace Express { interface Request { user?: AuthUser } }`
- `AuthenticatedRequest` reduced to a thin alias for `Request` (backward compatible)
- All routes now see `req.user` without a cast

---

## Query Param `string | string[]` Widening (🟡 MEDIUM — FIXED in Phase Alpha)

**Root cause:** Express types `req.query.foo` as `string | string[] | ParsedQs | ParsedQs[]` to represent multi-value params. Routes assigned this directly to `string` parameters.

**Fix applied:**
- Created `src/types/runtime/query.ts` with `requireStringQuery()` and `optionalStringQuery()` helpers
- These helpers collapse the union to `string | undefined` at the route boundary

---

## `IdentityCoreProfile.identity_statements` (🟡 MEDIUM)

**File:** `src/engineRuntime/engineRegistry.ts:216`

Property `identity_statements` accessed but missing from `IdentityCoreProfile` interface.

**Fix:** Check DB `identity_core_profiles` table — add column to interface if it exists, or remove the access.

---

## `Event` Interface — Missing Fields (🟡 MEDIUM)

**File:** `src/engineRuntime/engineRegistry.ts:332`

`Event` type requires `timestamp` and `embedding` fields, but object literals constructed at this site don't include them.

**Fix:** Either add these fields to the constructed objects or create a `PartialEvent` input type that doesn't require computed fields.

---

## `EmbeddingService.generateEmbedding` (🟡 MEDIUM)

**File:** `src/jobs/runEmbeddingReindex.ts:39`

Method `generateEmbedding` called but doesn't exist on `EmbeddingService`.

**Fix:** Check current `EmbeddingService` API — method may have been renamed. Update call site.

---

## `OmegaChatResponse.response` (🟡 MEDIUM)

**File:** `src/routes/conversationCentered.ts:891`

Property `response` accessed on `OmegaChatResponse` but absent from the type.

**Fix:** Check `OmegaChatResponse` type definition — add `response` field or use the correct property name.

---

## `featureFlags` Cross-Package Import (🟠 HIGH)

**File:** `src/middleware/featureFlags.ts:5`

```typescript
import ... from '../../web/src/config/featureFlags'
```

Server code importing directly from `web/src` — this is an architectural boundary violation. The web package's source is not available in the server container.

**Fix:** Extract shared feature flag definitions to a shared package (`packages/shared/featureFlags.ts`) or duplicate the constants in `server/src/config/featureFlags.ts`.

---

## `rbac.ts` Environment Check Dead Branch (🟢 LOW)

**File:** `src/middleware/rbac.ts:95`

```typescript
// TS2367: types '"production" | "staging"' and '"development"' have no overlap
```

The environment variable is typed as `'production' | 'staging'` at this point but compared to `'development'`, which can never be true. Logic is unreachable.

**Fix:** Re-audit the env detection logic or widen the type to include `'development'`.

---

## Priority Fix Order

1. 🔴 `featureFlags` cross-package import (blocks build in CI contexts)
2. 🟠 `SensemakingContract` missing fields (epistemic governance core)
3. 🟠 `EntryIR.canon_status` missing (contradiction governance core)
4. 🟠 `ChaptersController` missing `logger` import (runtime crash risk)
5. 🟡 Stripe API version pin
6. 🟡 `ChapterInput` snake_case vs camelCase
7. 🟡 `IdentityCoreProfile.identity_statements`
8. 🟡 `Event` missing required fields
9. 🟡 `EmbeddingService.generateEmbedding` rename
10. 🟢 `rbac.ts` dead branch
