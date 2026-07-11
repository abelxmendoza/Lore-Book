# Durability staging qualification

**Date:** 2026-07-11  
**Operator:** automated qualification agent  
**Production deploy:** **not performed**

---

## 1. Environment confirmation

| Signal | Value observed | Interpretation |
|--------|----------------|----------------|
| `NODE_ENV` (workspace `.env`) | `development` | Local workspace |
| `API_ENV` | **`production`** | Points at live product config |
| `SUPABASE_URL` | `https://supabase.lorebookai.com` | **Production Supabase** |
| `VITE_APP_URL` | `https://lorebookai.com` | **Production web** |
| `DATABASE_URL` host | `aws-1-us-west-1.pooler.supabase.com` | **Production pooler** |
| Local Supabase (54321/54322) | not running | No linked local stack |
| Docker | not installed | Cannot `supabase start` |
| Staging env file | **absent** | No `.env.staging` |
| Isolated qualification DB | `lorekeeper_staging_qual` on Homebrew Postgres 14 (`/tmp` socket) | **Safe, non-production** |

### Decision

**Workspace default credentials are production.**

Per task constraints and automatic NO-GO rules:

- Migrations were **not** applied to production Supabase / Railway.
- No chat/API smoke tests mutated production user data.
- Schema + SQL scenario drills ran only on **`lorekeeper_staging_qual`**.

Gate script: `scripts/durability-staging-qual.mjs` (refuses production hosts / requires `STAGING_DATABASE_URL`).

---

## 2. Migrations applied (isolated staging DB only)

### Commands

```bash
brew services start postgresql@14
export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"
export PGHOST=/tmp
export PGDATABASE=lorekeeper_staging_qual
# create DB + minimal stubs (auth.users, chat_messages, base tables)
psql -f supabase/migrations/20260711120000_ingestion_job_state_machine.sql
psql -f supabase/migrations/20260711130000_ingestion_job_fencing.sql
psql -f supabase/migrations/20260711140000_event_source_idempotency.sql
# re-apply all three → exit 0 (idempotent)
```

### Results

| Migration | First apply | Re-apply |
|-----------|-------------|----------|
| `20260711120000_ingestion_job_state_machine.sql` | OK (logical_status, stages, locks, `client_idempotency_key`) | OK |
| `20260711130000_ingestion_job_fencing.sql` | OK (`lease_token`, `attempt_version`) | OK |
| `20260711140000_event_source_idempotency.sql` | OK (event source fingerprints + unique indexes) | OK |

Verified indexes include:

- `ingestion_jobs_idempotency_key_key`
- `ingestion_jobs_lease_token_idx`
- `chat_messages_user_client_idempotency_uidx`
- `resolved_events_user_source_fingerprint_uidx`
- `event_records_user_source_message_uidx`
- child-layer source unique indexes (emotions, cognitions, narratives, identity impacts)

**Existing-data note:** Partial unique indexes (`WHERE col IS NOT NULL`) do not conflict with null historical rows. Production apply still requires a pre-check for duplicate non-null `source_message_id` / fingerprints before go-live.

---

## 3. Trust floor

```bash
npm run test:trust-floor
```

### Result: **PASSED**

| Suite | Files | Tests |
|-------|-------|-------|
| Server (durability, ingestion, isolation, invariants, fault guard, event identity) | 13 | 67 |
| Web (friendlyError + useChat durability) | 2 | 6 |
| **Total** | **15** | **73** |

---

## 4. Event write-path audit

| Path | File | Pre-fix | Post-fix |
|------|------|-----------|------------|
| Assembly insert | `eventAssemblyService.ts` | Blind `insert` | Fingerprint lookup + unique-race re-fetch |
| Mode-router records | `eventExtractionService.createEventRecord` | Blind `insert` | One-row-per-`source_message_id` + race re-fetch |
| Recovery insert | `eventRecoveryService.ts` | Insert | Not yet fingerprinted (risk: batch recovery) |
| Resume/lore | `resumeLorePopulationService.ts` | Insert | Document-sourced; lower chat-replay risk |
| Child layers | emotions/cognitions/narratives/identity | No unique | DB unique on `(user, event_record, …, source_message_id)` |

### Minimum uniqueness protection added

1. Migration `20260711140000_event_source_idempotency.sql`
2. `apps/server/src/services/events/eventSourceIdentity.ts`
3. Application guards in assembly + `createEventRecord`

Deterministic key:

```text
sha256(userId | sourceMessageId | extractorVersion | artifactType | normalizedSubject)[:40]
```

Assembly path uses sorted knowledge-unit ids instead of title (stable across reorder).

---

## 5–7. Replay scenarios (SQL evidence on `lorekeeper_staging_qual`)

Fixture text: Anime Expo / Catch One / Dollyfied / Stimkybun / Genni / tía house.

| Scenario | Result |
|----------|--------|
| Normal ingestion row create | 1 message, 1 job, 1 resolved_event, 1 event_record, 1 emotion, 1 narrative |
| Duplicate job enqueue | **unique_violation** — PASS |
| Duplicate event fingerprint | **unique_violation** — PASS |
| Duplicate event_record same message | **unique_violation** — PASS |
| Duplicate emotion child | **unique_violation** — PASS |
| Two-worker fence (stale complete) | 0 rows updated for `lease-A` — PASS |
| Live worker complete with `lease-B` | 1 row — PASS |
| Completed-job replay of event | still blocked by fingerprint unique — PASS |
| Cross-user event filter | 0 rows for foreign user id — PASS |

### Before / after row counts

| Table | BEFORE | AFTER (single logical story) |
|-------|--------|------------------------------|
| chat_messages | 1 | **1** |
| ingestion_jobs | 0 | **1** |
| resolved_events | 0 | **1** |
| event_records | 0 | **1** |
| event_emotions | 0 | **1** |
| narrative_accounts | 0 | **1** |
| provenance_edges | 0 | 0 (not exercised) |
| timeline_entries | 0 | 0 (not exercised) |

Replay attempts did **not** increase logical artifact counts.

---

## 8. Staging smoke (HTTP) status

| Scenario | Status | Evidence |
|----------|--------|----------|
| Normal chat | **Not run against live** | Would require staging API + test user |
| Assistant 429 after save | **Unit/API contract covered** | `ChatDurabilityError` + `buildDurabilityApiResponse` tests |
| WAL fail → `RECOVERY_REQUIRED` | **Unit covered** | `enqueueDurable.recovery.test.ts` |
| Duplicate client send | **Unit covered** | idempotency key + unique index |
| Page refresh after failure | **Frontend unit** | `useChat.durability` hydrate |
| Cross-user durability denial | **SQL filter + route design** | routes scope by `req.user.id`; no live HTTP attack against prod |

Live HTTP smoke deferred until a non-production API base URL is provided.

---

## 9. Railway / SIGTERM drill

**Live Railway staging restart:** not executed (no isolated Railway staging environment identified; production Railway not touched).

**Process-equivalent drill** on `lorekeeper_staging_qual`:

1. Job inserted as `PROCESSING` with `lease_token=lease-dead`, `locked_at = now()-20m`
2. Reclaim (same predicate as `reclaimStaleLocks`) → `QUEUED`, lease cleared
3. New claim → `lease-new`, `attempt_version=2`
4. Stale complete with `lease-dead` / `attempt_version=1` → **0 rows**
5. Live complete with fence → **COMPLETED**, version 2

Result: reclaim + fencing OK at DB semantics. Full multi-process Node worker SIGTERM against Railway staging remains outstanding.

---

## 10. Fault injection production guard

### Code change

`isProductionRuntime()` hard-blocks injection when:

- `NODE_ENV=production`, or
- `API_ENV=production`, or
- `RAILWAY_ENVIRONMENT` is `production`/`prod`

…**even if** `DURABILITY_FAULT_INJECTION=true`.

Vitest/`NODE_ENV=test` are never treated as production.

### Tests

`faultInjection.productionGuard.test.ts` — included in trust-floor (4 tests).

### Verdict for automatic NO-GO item

**Fixed in code:** mis-set env can no longer activate injection in production runtime.

---

## 11. Automatic NO-GO checklist

| Condition | Observed |
|-----------|----------|
| WAL failure reports `QUEUED` | **No** — returns `RECOVERY_REQUIRED` (unit) |
| Saved message neither queued nor recoverable | **No** — recovery metadata path |
| Event replay duplicates logical artifacts | **No** on isolated DB unique indexes |
| Stale worker overwrites reclaimed work | **No** — fence rejected 0 rows |
| Cross-user durability exposure | Routes scoped; SQL cross-user 0 rows |
| Fault injection in production | **Blocked** by hard-gate |
| Migrations fail / damage staging | Isolated DB apply OK; **prod not migrated** |

---

## 12. Remaining risks

1. **No dedicated hosted staging** in this workspace — qualification used local Postgres only.  
2. `eventRecoveryService` / resume inserts not fully fingerprinted.  
3. Production DB not pre-scanned for pre-existing duplicate `source_message_id` before unique index apply.  
4. Live Railway multi-process restart not executed.  
5. Live chat HTTP smokes not executed (would risk production).  
6. Enrichment call sites under provider pressure still incomplete.

---

## 13. Final recommendation

### **NO-GO for production rollout / production migration apply**

Reasons:

1. Workspace is wired to **production** Supabase (`lorebookai.com`); no approved hosted staging URL was available.  
2. Live HTTP smoke + Railway restart against a true staging deploy were not completed.  
3. Production unique-index apply needs a duplicate preflight on real data.

### **CONDITIONAL GO for merging code + applying migrations to a real staging project** when:

1. `STAGING_DATABASE_URL` / staging Supabase project is provided (not lorebookai production).  
2. Run:  
   ```bash
   STAGING_DATABASE_URL=... node scripts/durability-staging-qual.mjs
   # apply three migrations on staging only
   npm run test:trust-floor
   # staging HTTP smokes with a dedicated test user
   ```  
3. Preflight:  
   ```sql
   SELECT user_id, source_message_id, count(*)
   FROM event_records
   WHERE source_message_id IS NOT NULL
   GROUP BY 1,2 HAVING count(*) > 1;
   -- same for resolved_events.source_fingerprint once backfilled
   ```  
4. Railway staging SIGTERM during ingestion succeeds once under multi-instance config.

### **Code + schema readiness (isolated evidence): GO for staging merge**

- Trust-floor green (73 tests)  
- Migrations idempotent on isolated DB  
- Event uniqueness + fencing + recovery contract proven in SQL/unit  

---

## Exact commands reference

```bash
# Trust floor
npm run test:trust-floor

# Isolated DB (local Homebrew only — not production)
export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"
export PGHOST=/tmp PGDATABASE=lorekeeper_staging_qual
psql -f supabase/migrations/20260711120000_ingestion_job_state_machine.sql
psql -f supabase/migrations/20260711130000_ingestion_job_fencing.sql
psql -f supabase/migrations/20260711140000_event_source_idempotency.sql

# Refuse accidental prod qualification
node scripts/durability-staging-qual.mjs   # exits 2 without STAGING_DATABASE_URL
```

## Files changed this qualification pass

- `supabase/migrations/20260711140000_event_source_idempotency.sql`
- `apps/server/src/services/events/eventSourceIdentity.ts`
- `apps/server/src/services/eventExtraction/eventExtractionService.ts`
- `apps/server/src/services/conversationCentered/eventAssemblyService.ts`
- `apps/server/src/services/chat/durabilityFaultInjection.ts`
- Tests: event identity, fault production guard
- `scripts/trust-floor.mjs`, `scripts/durability-staging-qual.mjs`
- `docs/durability-staging-qualification.md` (this file)
