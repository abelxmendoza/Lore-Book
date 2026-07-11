# Memory Quality v2 — Staging Qualification Report

**Date:** 2026-07-11  
**Commit SHA:** `81040281`  
**Operator:** automated qualification agent  
**Production deploy / mutation:** **none**

---

## Final verdict

# **NO-GO for production enablement**

### Why

No dedicated **non-production hosted staging** environment is available in this workspace. Default credentials and Railway linkage point at **production**. Per safety rules, live chat lifecycle, multi-worker race on hosted Postgres, and production-facing correction/retrieval smoke were **not** executed.

| GO criterion | Status |
|--------------|--------|
| Real staging DB/API distinct from production | **FAIL — missing** |
| Migration on real staging | **NOT RUN** (blocked) |
| Durable MEMORY_QUALITY stage on real ingestion job | **NOT RUN** |
| Live chat fixture → artifacts → correction → retrieval | **NOT RUN** |
| Real multi-worker Postgres race | **NOT RUN** |
| Release gates (unit) | **PASS** |
| Environment safety preflight | **PASS (correctly rejects)** |

---

## 1. Environment and safety preflight

### Sanitized identity (no secrets)

| Signal | Value |
|--------|--------|
| `NODE_ENV` | `development` |
| `API_ENV` | **`production`** |
| Supabase host | **`supabase.lorebookai.com`** |
| Database host | **`aws-1-us-west-1.pooler.supabase.com`** |
| App URL host | **`lorebookai.com`** |
| `STAGING_DATABASE_URL` | **not set** |
| `STAGING_API_URL` | **not set** |
| `.env.staging` | **absent** |
| Railway CLI linked environment | **`production`** (`lore-book-production.up.railway.app`) |
| Local isolated DB | `lorekeeper_staging_qual` on Homebrew Postgres (`/tmp`) — **not a product staging deploy** |

### Production signals detected

```text
lorebookai.com
API_ENV=production
prod-like-supabase-pooler
Railway Environment: production
```

### Preflight decision

```text
STOP — NO-GO
Do not apply migrations to default DATABASE_URL
Do not send chat traffic to production
Do not use production users/tokens
```

Command:

```bash
npm run test:environment-safety
# → exit 2, NO-GO (no STAGING_* configured)
```

Also:

```bash
node scripts/durability-staging-qual.mjs
# → NO-GO: STAGING_DATABASE_URL is not set
```

---

## 2. Missing resources (exact)

To unlock live qualification, provide:

1. **`STAGING_DATABASE_URL`** — Postgres connection string for a non-production Supabase/Railway project  
2. **`STAGING_API_URL`** — staging API base (e.g. `https://lore-book-staging.up.railway.app`)  
3. **Staging Supabase project** with Auth + RLS (`auth.uid()` available)  
4. **Dedicated staging test user** credentials (email/password or service JWT for that project only)  
5. **Railway staging environment** (not linked to `production`)  
6. Optional: `STAGING_SERVICE_ROLE_KEY` for worker writes (staging project only)

Until these exist, Phases 2–8 of the brief **cannot** be completed honestly.

---

## 3. Migration evidence

### Hosted staging

**Not applied** (production target risk).

### Local isolated DB only (`lorekeeper_staging_qual`)

Applied offline for schema smoke (does **not** count as staging qualification):

```bash
export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"
export PGHOST=/tmp PGDATABASE=lorekeeper_staging_qual
psql -f supabase/migrations/20260711150000_autobiographical_meaning_artifacts.sql
```

| Check | Result |
|-------|--------|
| Table exists | **Yes** |
| Unique `(user_id, source_fingerprint)` partial index | **Yes** (`autobiographical_meaning_fingerprint_uidx`) |
| Message / event / type indexes | **Yes** |
| RLS enabled | **Yes** (`relrowsecurity = t`) |
| Owner SELECT policy | **Skipped on local** — no `auth.uid()` (expected); migration hardened to create policy only when `auth.uid` exists |
| Duplicate fingerprint race | **PASS** — second insert → `unique_violation`, `artifact_count = 1` |
| Existing messages/events | Local stub schema only — no product data |

**Migration note:** Policy creation was made conditional on `auth.uid()` so local/test DBs do not fail apply; Supabase staging will create the owner-read policy.

---

## 4. Canonical fixture / live durable stage

**NOT RUN** — no staging chat route / non-prod API.

Would use:

```text
POST {STAGING_API_URL}/api/chat/stream
body: { message: "<Genni / Catch One fixture>", threadId, clientIdempotencyKey }
```

Expected job path (code design; unproven live):

```text
PERSISTED → QUEUED → PROCESSING → core complete
→ MEMORY_QUALITY PROCESSING → COMPLETED → job COMPLETED
```

---

## 5. Artifact / provenance / correction / retrieval / failure

| Phase | Live staging | Offline / unit evidence |
|-------|--------------|-------------------------|
| Persistence fields | Not run | Store + fingerprint unit tests |
| Epistemic labels | Not run | Extractor tests (direct_statement vs inference) |
| Replay / multi-worker | Not run | Unique index race on local Postgres only |
| Correction lifecycle | Not run | `correctMeaningArtifact` + route implemented |
| Cross-user denial | Not run | Route scopes by `req.user.id`; RLS owner policy on Supabase |
| Retrieval continuity | Not run | `loadMeaningPromptLines` unit-level design |
| Fault recovery | Not run | Stage status enum + non-fatal MQ failure design |
| Provider pressure SKIP | Not run | Policy integration in queue |

---

## 6. Calibration review (offline suite)

From `npm run test:memory-quality` (68 fixtures):

| Metric | Value |
|--------|------:|
| overall | 0.866 |
| eventQualityFocused | > 0.75 (gate) |
| eventQualityBroad | ~0.59 |
| precision | 0.963 |
| recall | 0.743 |
| hardNegativeFalsePositives | **0** |
| duplicateRate | **0** |
| calibrationError | ~0.19 |
| hallucination | 0.985 |

**Interpretation:** Calibration error ~0.19 means confidence is imperfectly calibrated but hard-negative FP rate is zero. **No production enablement** until live artifacts are inspected for any unsupported claim with confidence > 0.85.

No confidence model rewrite performed during this qualification (per brief).

---

## 7. Performance (offline only)

| Metric | Measurement |
|--------|-------------|
| Additional OpenAI calls for MQ | **0** (deterministic) |
| Benchmark runtime | ~250 ms for full MQ suite |
| Live stage latency | **Not measured** (no staging API) |
| Artifacts/message cap | `MAX_ARTIFACTS_PER_MESSAGE = 12` in integration service |
| Min confidence write | `MIN_CONFIDENCE = 0.55` |

---

## 8. Release gates — exact results

| Command | Result | Count | Duration |
|---------|--------|-------|----------|
| `npm run test:memory-quality` | **PASS** | 25 tests, 2 files | ~250 ms |
| `npm run test:trust-floor` | **PASS** | 92 server + 6 web tests | ~3 s total |
| `npm run test:environment-safety` | **PASS as gate** (exit 2 = correctly blocks prod) | n/a | <1 s |

Lint / production builds / full typecheck: **not re-run in this session** (not required for stop-on-missing-staging; recommend on staging deploy PR).

---

## 9. Files changed this qualification pass

| File | Change |
|------|--------|
| `scripts/environment-safety.mjs` | **New** production-refusal preflight |
| `package.json` | `test:environment-safety` script |
| `supabase/migrations/20260711150000_…sql` | RLS policy creation gated on `auth.uid()` |
| `docs/memory-quality-v2-staging-qualification.md` | **This report** |

No production systems modified.

---

## 10. Remaining risks

1. **No hosted staging** — largest blocker.  
2. Railway only linked to **production**.  
3. Live multi-worker race unproven on Supabase.  
4. RLS owner policy untested against real JWT.  
5. Retrieval oversharing untested live.  
6. Calibration residual (~0.19) needs live high-confidence audit.  
7. Metadata projection could still be mistaken for authority in UI (inspector not smokes-tested).

---

## 11. Rollback triggers (when staging eventually runs)

Abort / disable MQ stage if:

- Stage reports COMPLETED with zero durable rows  
- Unique index missing or duplicates appear  
- USER_CORRECTED overwritten by replay  
- Cross-user meaning visibility  
- Core events/messages corrupted by MQ failure  
- Unsupported inference at confidence > 0.85  

Code toggle: provider pressure SKIP path already allows deferral; can also disable stage with a feature flag if added later (not introduced here).

---

## 12. Exact production rollout sequence (after GO)

Only after a future staging qualification returns GO:

1. Apply `20260711150000` on production during low traffic.  
2. Deploy server with MEMORY_QUALITY stage.  
3. Smoke single internal test user (not broad rollout).  
4. Verify `GET …/meaning`, correction, prompt continuity.  
5. Monitor `memory_quality_status`, artifact counts, latency.  
6. Expand traffic gradually.

**Do not start this sequence until staging GO.**

---

## 13. Exact next steps to obtain GO

1. Create Supabase **staging** project + Railway **staging** environment.  
2. Set in operator shell only (not commit secrets):

```bash
export STAGING_DATABASE_URL='postgresql://…staging…'
export STAGING_API_URL='https://…staging…'
export STAGING_SERVICE_ROLE_KEY='…'
# staging test user JWT for chat smokes
```

3. Re-run:

```bash
npm run test:environment-safety   # must exit 0
# apply migration to staging only
# deploy staging API
# execute Phases 2–8 of this brief against STAGING_API_URL
npm run test:memory-quality
npm run test:trust-floor
```

4. Update this document with live evidence and flip verdict.

---

## Automatic NO-GO checklist (this run)

| Condition | Triggered? |
|-----------|------------|
| Meaning only in metadata on live system | N/A (live not run) |
| Stage completed without durable artifacts | N/A |
| Worker race duplicates | N/A (local unique index PASS only) |
| Replay overwrites USER_CORRECTED | N/A |
| Assistant text as evidence | N/A |
| Cross-user access | N/A |
| Chat exaggerates growth | N/A |
| Sensitive overshare | N/A |
| MQ failure corrupts core | N/A |
| Migration targets production | **Avoided** |
| Staging environment unavailable | **YES → NO-GO** |

---

## Summary

| Layer | Status |
|-------|--------|
| Code + unit gates | Ready |
| Local schema/fingerprint smoke | Pass (non-authoritative) |
| Hosted staging lifecycle | **Blocked — missing environment** |
| **Production enablement** | **NO-GO** |
