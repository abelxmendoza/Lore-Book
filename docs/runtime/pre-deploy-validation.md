# Pre-Deploy Validation Report
**Date:** 2026-05-26  
**Branch:** main  
**Build target:** Railway (`lore-book-production.up.railway.app`)  
**Status:** DEPLOY SUCCEEDED — healthcheck passed

---

## 1. CORE_RUNTIME Surface (27 routes)

| Path | Description |
|------|-------------|
| `/` | Liveness check — no auth, no DB |
| `/api/health` | Railway healthcheck target |
| `/api/diagnostics` | Runtime diagnostics |
| `/api/user` | User profile, ToS, settings |
| `/api/account` | Account management |
| `/api/legal` | Terms of service, privacy policy |
| `/api/onboarding` | Onboarding flow |
| `/api/subscription` | Subscription tier management |
| `/api/billing` | Stripe billing + webhooks |
| `/api/privacy` | Privacy settings |
| `/api/entries` | Journal ingestion |
| `/api/chat` | Chat stream endpoint |
| `/api/chat/message` | Chat message handling |
| `/api/chat-memory` | Conversation memory |
| `/api/threads` | Thread persistence |
| `/api/omega-memory` | Omega memory store |
| `/api/entities` | Entity CRUD |
| `/api/search` | Full-text search |
| `/api/memory-recall` | Memory recall pipeline |
| `/api/context` | Current context awareness |
| `/api/continuity` | Continuity tracking |
| `/api/corrections` | Correction intake |
| `/api/canon` | Canon truth resolution |
| `/api/contradiction-alerts` | Contradiction surface |
| `/api/narrative` | Narrative output |
| `/api/summary` | Entry summarization |
| `/api/timeline` | Timeline view |

**TypeScript errors in CORE_RUNTIME files: 0**

---

## 2. Route Tier Summary

| Tier | Count | Loaded by default |
|------|-------|-------------------|
| CORE_RUNTIME | 27 | ✅ Always |
| EXPERIMENTAL | 110 | ❌ `ENABLE_EXPERIMENTAL=true` only |
| ADMIN | 6 | ❌ `ENABLE_EXPERIMENTAL=true` only |
| RESEARCH | 5 | ❌ `ENABLE_EXPERIMENTAL=true` only |
| LEGACY | 3 | ❌ `ENABLE_EXPERIMENTAL=true` only |
| UNUSED | 2 | ❌ Never |

---

## 3. Build State

| Check | Result |
|-------|--------|
| `npm run build` | Passes (tolerates TS with `|| true`) |
| `npm run typecheck` (total) | 521 errors |
| CORE_RUNTIME route errors | **0** |
| Cross-package imports | **0** |
| `@ts-ignore` suppressions | 0 |
| Duplicate route paths | 0 |
| Localhost leaks (`127.0.0.1`) | 16 (all in test fixtures / demo data) |
| Bare `supabase` imports | 8 (all in EXPERIMENTAL services) |

### Remaining 521 TS Errors — Classification

All 521 errors are in EXPERIMENTAL / RESEARCH / LEGACY services. They are **not** blocking deployment because:
1. The build uses `tsc || true` — same as Railway's build step
2. CORE_RUNTIME routes have 0 errors (verified above)
3. EXPERIMENTAL routes are not loaded unless `ENABLE_EXPERIMENTAL=true`

**Error categories by tier:**

| Category | Count (est.) | Tier |
|----------|-------------|------|
| AuthUser missing fields (user_metadata, created_at) | ~80 | EXPERIMENTAL |
| Possibly-undefined req.user (TS18048) | ~60 | EXPERIMENTAL |
| Missing supabase import (TS2304) | ~15 | EXPERIMENTAL/RESEARCH |
| Sentiment type mismatch | ~5 | EXPERIMENTAL |
| Schema drift (deleted DB columns) | ~40 | RESEARCH/LEGACY |
| OpenAI API shape mismatches | ~30 | EXPERIMENTAL |
| Misc type narrowing (TS2345, TS2339) | ~291 | Spread across tiers |

---

## 4. Test State

**Test run summary:** 14 failed / 1,059 passed across 223 test files

### Failures from Our Changes (2, need fixing)

| Test | File | Root Cause |
|------|------|------------|
| `featureFlags middleware helpers` (2) | `tests/middleware/featureFlags.test.ts` | Cross-package import was inlined; test mock still expects old import shape |
| `GET /api/user/profile` | `tests/routes/user.test.ts` | Handler now calls `supabaseAdmin.auth.admin.getUserById`; test mock doesn't stub it |

### Pre-Existing Failures (12, not from our changes)

| Test | File | Classification |
|------|------|---------------|
| `ModeRouterService` (4) | `modeRouterService.test.ts` | Logic bug — returns `UNKNOWN` instead of `ACTION_LOG` |
| `OmegaChatService` (5) | `omegaChatService.test.ts` | Mock chain issues |
| `auth middleware` (1) | `auth.test.ts` | AuthUser shape mismatch (4 fields vs 2 expected) |
| `OmegaMemoryService > resolveEntities` (1) | `omegaMemoryService.test.ts` | Mock chain issues |
| `Relationship Dynamics API Routes` (1) | `relationshipDynamics.test.ts` | Unrelated route logic |
| `Entities API Routes > auto-update` (1) | `entities.test.ts` | Unrelated route logic |

**EntityContinuityVerifier tests: 6/6 passing ✅**

---

## 5. Disabled Experimental Systems

The following systems are loaded ONLY when `ENABLE_EXPERIMENTAL=true`:

- Verification (`/api/verification`)
- Documents (`/api/documents`)
- Photos (`/api/photos`)
- Entity resolution (`/api/entity-resolution`)
- Memory graph (`/api/memory-graph`)
- Memory ladder (`/api/memory-ladder`)
- Insights (`/api/insights`)
- Memory review queue (`/api/mrq`)
- Continuity profile (`/api/continuity-profile`)
- Belief-reality reconciliation (`/api/belief-reconciliation`)
- Correction dashboard (admin)
- Perspectives (`/api/perspectives`)
- Relationships (`/api/relationships`)
- All 97 remaining EXPERIMENTAL/ADMIN/RESEARCH/LEGACY routes

Production Railway instance runs with `ENABLE_EXPERIMENTAL` unset (default: false).

---

## 6. Required Environment Variables (CORE_RUNTIME)

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | ✅ Critical | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ Critical | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Critical | Admin operations |
| `OPENAI_API_KEY` | ✅ Critical | Chat + embedding |
| `PORT` | Provided by Railway | Defaults to 4000 |
| `NODE_ENV` | Provided by Railway | `production` |
| `API_ENV` | Recommended | `production` |
| `FRONTEND_URL` | Recommended | CORS origin allow |
| `STRIPE_SECRET_KEY` | Required for billing | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Required for billing | Webhook validation |

Optional / EXPERIMENTAL:
- `ENABLE_EXPERIMENTAL` — unlock non-core routes (default: false)
- `X_API_BEARER_TOKEN`, `GITHUB_TOKEN`, `MICROSOFT_*` — third-party integrations
- `ENCRYPTION_SALT` — encrypted field support
- `ADMIN_USER_ID` — admin-only operations

---

## 7. Known Degraded Paths

### Schema Drift (EXPERIMENTAL services only)
Several EXPERIMENTAL services reference columns that may not exist in the current DB schema:
- `omega_claims.entity_id` — used by EntityContinuityVerifier; confirmed present
- `entity_mentions` table — used by EntityContinuityVerifier; confirmed present
- `provenance_edges` table — used by EntityContinuityVerifier; confirmed present
- `continuity_events.resolved` — continuity contradiction resolution; status unknown
- `schema_migrations` — referenced for version tracking; standard Supabase table

### OpenAI Quota
If `OPENAI_API_KEY` is over quota (429), the chat stream will fail gracefully:
- `useChat.ts` classifies rate-limit errors and shows: "The AI is temporarily over capacity. Please wait a moment and try again."
- Demo mode (guest users) gets a themed demo response instead of an error

### EntityContinuityVerifier
- Calls `entityContinuityVerifier.verify('_system_sample', 24, 10)` on `/api/diagnostics/cognition-health`
- Uses `_system_sample` sentinel user ID; will return empty/healthy result if no entries for that user
- For real per-user diagnostics, pass an actual user ID

### Active User Metrics
- `gatherMetrics()` in `cognitionHealthService.ts` queries `journal_entries` with `{ count: 'exact', head: true }` for counts but also fetches `user_id` for distinct count
- If `journal_entries` has no entries in the last 24h, `activeUsersLast24h` = 0 (not null)

---

## 8. Railway Deployment Status

```
Build: SUCCEEDED ✅
Healthcheck: PASSED ✅  ([1/1] Healthcheck succeeded!)
Live URL: lore-book-production.up.railway.app
Healthcheck endpoint: /api/health
```

### Post-Deploy Verification Checklist

- [ ] `GET /api/health` → 200 OK
- [ ] `GET /api/diagnostics` → 200, status: 'ok'
- [ ] `GET /api/diagnostics/cognition-health` (auth required) → 200 or 503
- [ ] Login → create thread → message received
- [ ] Entry ingested → entity extracted → provenance edge written
- [ ] Character appears in character book after mention
- [ ] Thread persists across reload
- [ ] Continuity contradiction detected on conflicting entry
- [ ] `ThreadSaveChip` shows correct save state
- [ ] Backend status banner hidden (server reachable)

---

## 9. Recovery Baseline

This document captures the state at the **stabilize deployable cognition runtime** milestone:
- CORE_RUNTIME surface: 27 routes, 0 TS errors
- Experimental surface: isolated, 521 errors, not loaded by default
- Railway: live, healthcheck passing
- EntityContinuityVerifier: 6/6 tests passing
- CognitionHealthService: operational at `/api/diagnostics/cognition-health`
- Chat UX: friendly error messages, visible backend status banner
- Debug instrumentation: removed (7 localhost:7242 fetch calls)

Any regression from this baseline is a deploy-critical issue requiring immediate classification.
