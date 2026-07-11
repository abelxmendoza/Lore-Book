# Hosted Staging Provisioning Report

**Date:** 2026-07-11  
**Repo commit (local workspace):** `81040281c33cccd090a6f1c19ac41d6eff6f4f40`  
**Verdict:** **BLOCKED**

**Scope:** Hosted staging application stack (Railway API/worker + web) against the **existing** staging Supabase database.  
**Not in scope:** Re-provision DB, re-run legacy greenfield migrations, production mutations, full durability/MQ qualification suites.

---

## Final verdict

```text
BLOCKED
```

### Exact remaining blocker

**Railway account trial has expired.** No staging environment, new project, or deployment can be created until Abel selects a Railway plan.

Evidence (CLI):

```text
Your trial has expired. Please select a plan to continue using Railway.
```

Observed for:

- `railway environment new staging` (LoreBook project)
- `railway up --new --name lorebook-staging-api` (isolated project)
- Railway MCP: `Unauthorized` / cannot create services after trial block

---

## 1. Staging topology

```text
[intended]
Lorebook staging web  →  Lorekeeper staging Railway API+worker  →  Supabase lorebook-staging
                                                                     ref madyqnyvlexmpphejqmh

[current]
✓ Staging Supabase DB + Auth + keys (prior task)
✓ Critical migrations applied (prior task)
✓ Staging test user + RLS isolation (prior task)
✓ Repo: staging identity boot guards, health environment field, qual scripts
✗ Railway staging API/worker deploy
✗ Staging web deploy with live API URL
✗ Hosted chat/ingestion smoke
```

---

## 2. Commit SHA

| Item | Value |
|------|--------|
| Workspace HEAD | `81040281c33cccd090a6f1c19ac41d6eff6f4f40` (short `81040281`) |
| Deployed staging commit | **N/A** — no staging deploy |

---

## 3. Railway environment and service status

### Sanitized infrastructure map (Phase 1)

| Field | Value |
|-------|--------|
| Workspace | Abel Mendoza's Projects (`dcad168b-…`) |
| Project | **LoreBook** (`253baa4e-0c7d-4aa8-8ac7-bacc350a8872`) |
| Environments | **production only** (`cb24da18-…`) — **no staging** |
| Service | **Lore-Book** (`fc40a265-…`) — single service |
| Production URL | `https://lore-book-production.up.railway.app` |
| Production status | Failed / stopped (latest deployment failed) — **not modified** |
| Source | GitHub `abelxmendoza/Lore-Book` (main) |
| Build | Dockerfile (`apps/server/Dockerfile`) via `apps/server/railway.json` |
| Start command | `node dist/bootstrap.js` |
| Healthcheck path | `/api/health` (timeout 120s) |
| Region | sfo |
| API vs worker | **One combined process** (Express + in-process workers/jobs) |

### Architecture (Phase 3)

| Concern | Finding |
|---------|---------|
| Workspace package | `apps/server` Docker root; monorepo root not required at runtime |
| Server bind | `resolveServerPort` → platform `PORT` |
| Health | `GET /api/health` dependency-free liveness |
| Ingestion worker | `ingestionQueue.recover()` on boot; durable queue in same process |
| MEMORY_QUALITY | Stage in `ingestionQueue` after core ingest |
| Stale-job recovery | Boot-time `ingestionQueue.recover()` |
| SIGTERM | Graceful `server.close()` then exit (3s force) |
| Service split | **Do not split** — existing intended architecture is combined |

### Production variable structure (keys only; values never copied wholesale)

Notable keys on production `Lore-Book`:

```text
API_ENV, NODE_ENV, PORT, DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, OPENAI_*, FRONTEND_URL, ENABLE_*, MCP_*,
STRIPE_*, MONTHLY_OPENAI_BUDGET_USD, RAILWAY_*
```

**Production `API_ENV=production` and DB/Supabase target production project ref** — confirmed; never used for staging deploy.

### Production untouched

- Environments list still only `production`
- No variables set on production in this task
- No redeploy of production

---

## 4. Staging API URL

**Unset** — cannot generate until Railway staging deploys.

---

## 5. Staging web URL

**Unset** — blocked on staging API URL.

Preferred: `https://staging.lorebookai.com`  
Acceptable interim: Vercel preview URL.

Existing Vercel (do not repoint production):

| Project | URL | Notes |
|---------|-----|--------|
| lore-book-web | `https://lorebookai.com` | Production — leave alone |
| lore-keeper | `https://lore-keeper-nine.vercel.app` | Separate; not wired as staging |

---

## 6. Database target confirmation

| Check | Result |
|-------|--------|
| Staging project ref | `madyqnyvlexmpphejqmh` |
| Staging DB host | `db.madyqnyvlexmpphejqmh.supabase.co` |
| Production ref present | **false** |
| Critical tables present | `ingestion_jobs`, `autobiographical_meaning_artifacts`, `chat_messages`, `resolved_events` |
| Critical migrations | `20260711120000`–`20260711150000` applied |
| `npm run staging:migrate` | exit 0 (fast path; critical present) |

---

## 7. Auth configuration status

| Item | Status |
|------|--------|
| Staging Auth health | OK |
| Staging test user | Exists (`staging-bot@…@example.test`); password grant OK |
| Isolation probe user | `staging-other+auto@example.test` |
| RLS meaning cross-user | Other user sees **0** rows (DB-level) |
| Staging API JWT validation | **Not verified hosted** (no API) |
| Supabase Auth redirect URLs | **Manual** — set Site URL + redirects for staging web + localhost on project `madyqnyvlexmpphejqmh` |

---

## 8. Environment safety output

### `npm run test:environment-safety` → exit 0

```text
Environment: staging
STAGING_SUPABASE_HOST: madyqnyvlexmpphejqmh.supabase.co
STAGING_DATABASE_HOST: db.madyqnyvlexmpphejqmh.supabase.co
STAGING_API_HOST: (NOT SET)
Production Supabase detected: false
Production database detected: false
Production Railway environment detected: false
OK: Staging target present and does not match production signals.
```

### `npm run staging:preflight` → exit 2 (expected)

```text
Staging API reachable: false
Staging database reachable: true
Staging Auth reachable: true
Qualification allowed: false
NO-GO: staging API not reachable
```

Scripts load **only** staging credential files (never root production `.env` as staging identity source).

---

## 9. Build / deployment results

| Action | Result |
|--------|--------|
| Unit tests: staging identity | **9 passed** |
| Unit tests: health payload | **11 passed** (includes `environment` field) |
| Railway `environment new staging` | **FAIL** — trial expired |
| Railway `up --new` isolated project | **FAIL** — trial expired |
| Railway MCP create service | **FAIL** — Unauthorized / trial |
| Staging deploy ID | none |
| Live health | none |

### Code shipped for next deploy (local, not yet hosted)

| Change | Purpose |
|--------|---------|
| `apps/server/src/config/stagingIdentity.ts` | Boot-time staging identity assert; refuse production targets |
| `apps/server/src/config.ts` `assertConfig` | Fail closed on staging misconfig |
| `apps/server/src/routes/health.ts` | Health includes `environment` (e.g. `"staging"`) |
| `scripts/staging-railway-env-checklist.mjs` | Variable matrix without secrets |
| Prior scripts | `staging:preflight`, `staging:migrate`, `staging:smoke`, qual gates |

Expected live health after deploy:

```json
{
  "status": "ok",
  "environment": "staging"
}
```

(`deploymentEnv` remains `NODE_ENV`, typically `production` for hosted builds.)

---

## 10. Basic hosted smoke results

| Check | Result |
|-------|--------|
| Staging API health | **SKIP** — no URL |
| Staging web loads | **SKIP** |
| STAGING marker | Code present when `VITE_API_ENV`/mode is staging — **not hosted-verified** |
| Auth + chat + job + MQ | **SKIP** |
| Cross-user HTTP | **SKIP** (DB RLS previously PASS) |

---

## 11. Worker claim/checkpoint evidence

**Not available hosted.** Design confirmation only:

- Combined process boots `ingestionQueue.recover()`
- Fencing columns exist on staging `ingestion_jobs` (`lease_token`, `attempt_version`)
- Full claim/checkpoint/stale reclaim belongs to durability qualification after READY

---

## 12. Authorization results

| Layer | Result |
|-------|--------|
| DB RLS meaning owner vs other | PASS (prior) |
| Hosted API cross-user | SKIP (no API) |

---

## 13. Observability status

| Item | Status |
|------|--------|
| Staging logs on Railway | **N/A** until deploy |
| Sanitized boot log line | Implemented: `environment=… databaseHost=… supabaseProject=… service=… commit=…` |
| Secret redaction in identity logs | Tests assert no credentials in sanitized line |
| SENTRY_ENVIRONMENT=staging | Documented for Railway vars; not applied |

---

## 14. Remaining blockers

1. **Railway plan renewal** (hard blocker for API/worker).
2. After plan: create env `staging` (or isolated project with env named `staging`), set vars from checklist, deploy, domain, set `STAGING_API_URL`.
3. Staging web (Vercel preview or `staging.lorebookai.com`) with staging `VITE_*` only; set `STAGING_APP_URL`.
4. Supabase Auth Site URL + redirect allowlist for staging web + localhost.
5. Re-run preflight + smoke.

### Railway variables to set (no secret values here)

Use `node scripts/staging-railway-env-checklist.mjs` and values from `.private/staging-credentials.env`:

```text
API_ENV=staging
NODE_ENV=production
DATABASE_URL=<staging>
SUPABASE_URL=https://madyqnyvlexmpphejqmh.supabase.co
SUPABASE_ANON_KEY=<staging>
SUPABASE_SERVICE_ROLE_KEY=<staging>
OPENAI_API_KEY=<budget/staging key>
SENTRY_ENVIRONMENT=staging
DURABILITY_FAULT_INJECTION=0
FRONTEND_URL=<staging web origin>
ENABLE_ENGINE_SCHEDULER=false
ENABLE_GROUP_DETECTION=false
ENABLE_MCP=false
MONTHLY_OPENAI_BUDGET_USD=<low>
```

Copy only safe shared non-secrets (model names, feature flags). **Do not** clone production DB/Supabase/Stripe/MCP secrets.

---

## 15. Commands for full durability qualification

After staging API is live and `STAGING_API_URL` is set:

```bash
set -a; source .private/staging-credentials.env; set +a
npm run test:environment-safety   # exit 0
npm run staging:preflight         # exit 0
npm run staging:migrate           # exit 0
npm run test:trust-floor
npm run staging:durability-qual
# See also: docs/durability-staging-qualification.md
```

---

## 16. Commands for full Memory Quality v2 qualification

```bash
set -a; source .private/staging-credentials.env; set +a
npm run test:environment-safety
npm run staging:preflight
npm run staging:migrate
npm run test:memory-quality
npm run staging:memory-quality-qual
# See also: docs/memory-quality-v2-staging-qualification.md
```

Bounded smoke first:

```bash
npm run staging:smoke
```

---

## 17. Teardown and rollback

1. Delete Railway environment `staging` or isolated staging project only.
2. Remove staging Vercel deployment/env vars (never production `lorebookai.com`).
3. Optionally delete/pause Supabase `lorebook-staging` (`madyqnyvlexmpphejqmh`).
4. Rotate local `.private/staging-credentials.env` if exposed.

**Reject** any teardown against `cshtthzpgkmrbcsfghyq`, `lorebookai.com` production, or Railway environment `production`.

---

## Acceptance criteria scorecard

| Criterion | Met? |
|-----------|------|
| Railway staging API deployed and healthy | **No** |
| Worker processes staging jobs | **No** (no deploy) |
| API/worker target staging DB | Config ready; not deployed |
| Staging authentication works | Supabase yes; API JWT untested hosted |
| Staging web deployed | **No** |
| Web targets staging only | Not deployed |
| STAGING marker | Code yes; hosted no |
| Hosted chat persists + queues | **No** |
| MEMORY_QUALITY observable hosted | **No** |
| Cross-user denied | DB yes; HTTP no |
| Environment safety passes | **Yes** (DB/Auth layer) |
| Qual commands have valid staging targets | Partial (DB yes, API URL missing) |
| Production untouched | **Yes** |

---

## Exact next actions for Abel

1. **Railway dashboard** → select a plan for workspace **Abel Mendoza's Projects**.
2. Create environment **`staging`** on project **LoreBook** (preferred) *or* new project `lorebook-staging-api` with environment name **`staging`** (not `production`).
3. Deploy service from `apps/server` (Dockerfile) with staging-only variables (checklist above).
4. Generate public domain → put in `STAGING_API_URL` in `.private/staging-credentials.env`.
5. Deploy staging web with `VITE_API_URL=<staging API>` and staging Supabase anon only.
6. Configure Supabase Auth redirects on `madyqnyvlexmpphejqmh`.
7. Run:

```bash
npm run staging:preflight && npm run staging:smoke
```

Then re-open this report path for READY handoff.
