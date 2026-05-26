# Deploy Readiness Report
**Stabilization Phase Alpha — generated 2026-05-26**

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Docker build | ✅ Succeeds | `buildCommand: "npm run build \|\| true"` suppresses exit code |
| Container start | ✅ Succeeds | CJS output, no ESM directory import crash |
| `/api/health` | ✅ Returns 200 | No auth, no DB required |
| Railway healthcheck | ✅ Configured | Path: `/api/health`, timeout: 30s |
| CORE_RUNTIME routes | ✅ Active | 34 routes loaded by default |
| EXPERIMENTAL routes | ⏸ Gated | Load with `ENABLE_EXPERIMENTAL_RUNTIME=true` |
| Core background jobs | ✅ Active | sync, memoryExtraction, continuityEngine |
| Experimental jobs | ⏸ Gated | Load with `ENABLE_EXPERIMENTAL_RUNTIME=true` |

---

## Remaining Build Blockers (TypeScript)

TypeScript errors are suppressed at build time via `|| true`. The server emits and boots correctly. These errors do NOT prevent deployment but must be resolved before removing the suppression.

See `docs/runtime/schema-drift-audit.md` for the full prioritized list.

### Critical for removing `|| true`:

1. **`featureFlags` cross-package import** (`src/middleware/featureFlags.ts:5`) — imports from `../../web/src` which doesn't exist in the server container.
2. **`SensemakingContract` missing fields** — 8+ call sites accessing properties absent from the interface.
3. **`EntryIR.canon_status`** — accessed in contradiction governance core.
4. **`ChaptersController` missing `logger`** — will crash at runtime if chapters route is enabled.

---

## Disabled Systems

The following are gated behind `ENABLE_EXPERIMENTAL_RUNTIME=true` and NOT running in default production:

- 90+ experimental routes (domain cognition, identity psychology, emotion intelligence, personal tools, engine system, external integrations)
- Admin routes (`/api/admin`, `/api/dev`, `/api/analytics`)
- Research routes (orchestrator, autopilot, agents)
- Legacy routes (`/api/timeline-v2`)
- 7 experimental background jobs
- Daily engine scheduler

---

## Environment Requirements

### Required (server will start but auth/AI will fail without these)

| Variable | Where to get |
|----------|-------------|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API |
| `OPENAI_API_KEY` | platform.openai.com/api-keys |
| `PORT` | Set to `4000` in Railway |

### Optional

| Variable | Default | Effect |
|----------|---------|--------|
| `OPENAI_MODEL` | `gpt-4o-mini` | Model for chat completions |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `ENABLE_EXPERIMENTAL_RUNTIME` | `false` | Enable all non-core routes and jobs |
| `DISABLE_ENGINE_SCHEDULER` | `false` | Disable daily 2 AM engine scheduler |
| `DISABLE_AUTH_FOR_DEV` | `false` | Dev auth bypass — NEVER set true in production |
| `STRIPE_SECRET_KEY` | — | Stripe billing (billing routes degraded without) |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signature verification |
| `ENCRYPTION_SALT` | — | Data encryption at rest |

---

## Frontend Integration (Vercel)

The production frontend at `lore-keeper-web.vercel.app` needs:

| Vercel Env Variable | Value |
|--------------------|-------|
| `VITE_API_URL` | `https://<your-railway-service>.up.railway.app` |

Without `VITE_API_URL`, all API calls route to Vercel (which has no API), producing HTML 404 responses parsed as JSON — the root cause of the `Unexpected token '<'` errors seen in production.

Set this in the Vercel dashboard → Project → Settings → Environment Variables, then redeploy.

---

## Migration Requirements

The following migrations have been written but may not be applied to the production Supabase project (`cshtthzpgkmrbcsfghyq`):

```bash
supabase link --project-ref cshtthzpgkmrbcsfghyq
supabase db push
```

Check current migration state:
```bash
supabase migration list
```

Key pending migration: `omega_claims_truth_state` (epistemic governance schema changes).

---

## Known Degraded Paths

| Path | Degraded Condition | Symptom |
|------|--------------------|---------|
| All auth routes | Missing `SUPABASE_*` env vars | 500: "Authentication service not configured" |
| `/api/chat` | Missing `OPENAI_API_KEY` | Chat returns error, no inference |
| `/api/billing` | Missing `STRIPE_SECRET_KEY` | Billing routes return 500 |
| Schema-dependent routes | Missing DB tables | 503 via schemaGuard middleware |
| EXPERIMENTAL routes | `ENABLE_EXPERIMENTAL_RUNTIME` not set | 404 (routes not mounted) |

---

## Next Steps

1. Set Railway env vars (see Required section above)
2. Set `VITE_API_URL` in Vercel dashboard
3. Run pending migrations via Supabase CLI
4. Fix `featureFlags` cross-package import (highest priority TS fix)
5. Fix `SensemakingContract` interface gaps
6. Fix `EntryIR.canon_status`
7. Remove `|| true` from build script once errors are resolved
