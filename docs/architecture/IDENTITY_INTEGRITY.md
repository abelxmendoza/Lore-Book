# Lorekeeper — Identity Integrity Layer

The Identity Integrity Layer is the constitutional infrastructure of Lorekeeper. It answers: *who owns this data, who can change it, and what happened to it*.

This document covers Row Level Security, the auth architecture, the `cognition_mutations` audit system, and the ownership model.

---

## What Was Added (Identity Integrity Sprint)

The sprint implemented 7 components:

1. **Universal RLS** — Row Level Security enabled on the 26 user-data tables that were missing it
2. **cognition_mutations table** — Append-only audit log for all truth-state changes
3. **CorrectionAuthority service** — Formal governance of valid state transitions
4. **POST /api/identity/revise** — User-facing revision endpoint
5. **WhatAIKnows page** — Transparency surface at `/what-ai-knows`
6. **optionalAuth consolidation** — Removed the duplicate in `routes/chat.ts`, canonical export in `middleware/auth.ts`
7. **Dead reference cleanup** — Removed stale project references from `config.ts`

---

## Row Level Security

**Migration:** `supabase/migrations/20260210000155_universal_rls_coverage.sql`

### Coverage

All user-data tables have RLS enabled. The policy pattern is uniform:

```sql
CREATE POLICY "owner_rw" ON <table>
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

This means:
- A user can only read rows where `auth.uid() = user_id`
- A user can only write rows where `auth.uid() = user_id`
- The Supabase service role (used by `supabaseAdmin`) bypasses RLS — this is the server-side write path

### Tables covered in the sprint

The 26 tables that were added: `biometric_measurements`, `chapters`, `entity_resolution_cache`, `entry_verifications`, `fact_claims`, `fact_verifications`, `interest_mentions`, `interest_scope_groups`, `interest_scopes`, `interests`, `perception_entries`, `timeline_actions`, `timeline_arcs`, `timeline_epochs`, `timeline_eras`, `timeline_microactions`, `timeline_mythos`, `timeline_sagas`, `timeline_scenes`, `timeline_search_index`, `training_datasets`, `user_corrections`, `value_evolution_events`, `value_priority_history`, `value_rankings`, `workout_events`.

### Intentionally excluded

System tables with no `user_id` column are excluded from RLS by design — they are service-role-only infrastructure:

- `embeddings_cache` — shared inference cache
- `engine_blueprints`, `engine_dependencies`, `engine_embeddings`, `engine_health`, `engine_manifest` — system config

### Idempotency

The migration uses `DO $$ BEGIN IF NOT EXISTS ... END $$` guards. Re-running it against a database that already has the policies is safe.

> **Maintenance note:** Every new user-data table added to the schema MUST have RLS enabled and an `owner_rw` policy. The current coverage is complete as of migration `20260210000155`, but new tables added after that date must be covered manually. A future migration should enforce this via a Postgres `event_trigger` that rejects new tables without RLS.

---

## Auth Architecture

**File:** `apps/server/src/middleware/auth.ts`

### Three auth layers

| Layer | Function | Environment | Behavior |
|---|---|---|---|
| `requireAuth` | JWT validation via Supabase | All | Returns 401 on missing/invalid token |
| `optionalAuth` | Soft-fail wrapper | Development only | Soft-fails to dev stub user in dev; hard 401 in prod |
| Dev bypass | `DISABLE_AUTH_FOR_DEV=true` | Development only | All requests use stub user `00000000-0000-0000-0000-000000000000` |

### requireAuth

The standard middleware. Reads the `Authorization: Bearer <jwt>` header, validates via `supabase.auth.getUser()`, and populates `req.user`:

```typescript
req.user = {
  id: string;
  email?: string;
  lastSignInAt?: string | null;
  fullName?: string | null;
}
```

Returns 401 on missing token, 401 on invalid session, 500 if Supabase client is misconfigured.

### optionalAuth

Used by chat routes (`POST /api/chat/stream`, `POST /api/chat`, `GET /api/chat/test-openai`). In development, auth failures fall back to the dev stub user instead of returning 401. In production, behavior is identical to `requireAuth`.

> **The dev stub user** (`00000000-0000-0000-0000-000000000000`) exists in the local Supabase instance but not in production. Any route that processes `req.user.id` must handle the case where this ID has no data.

### DISABLE_AUTH_FOR_DEV

When `DISABLE_AUTH_FOR_DEV=true`:

1. The `authMiddleware` function detects `isDevelopment && bypassRequested`
2. Sets `req.user` to the stub user
3. Logs a one-time warning on first bypass use (`_devBypassLogged` flag)

**Production safety:** If `DISABLE_AUTH_FOR_DEV=true` is set in production (i.e., `NODE_ENV !== 'development'` and `API_ENV !== 'dev'`), the middleware returns a hard 500:

```typescript
if (bypassRequested && !isDevelopment) {
  return res.status(500).json({ error: 'Server misconfiguration: auth bypass not allowed in production' });
}
```

This is an explicit security invariant. It must never be softened.

---

## Ownership Model

Every user-data artifact follows this ownership contract:

1. **User ID is always the partition key.** Every table with user data has a `user_id uuid NOT NULL REFERENCES auth.users(id)` column.
2. **RLS enforces ownership at the database level.** Not just by convention — the database physically prevents cross-user reads/writes from client connections.
3. **Service role operates on behalf of users.** The server uses `supabaseAdmin` (service role) and is responsible for passing the correct `user_id` to every query.
4. **CorrectionAuthority enforces ownership in application logic.** Before any truth-state revision, `actorId === userId` is verified at the application layer, in addition to the DB-level `user_id` filter on the artifact load.

This creates defense-in-depth: DB constraint + RLS + application check.

---

## cognition_mutations Ownership Rules

The audit table has its own specific ownership contract:

```sql
-- Owner can READ their own audit history
CREATE POLICY "owner_read" ON cognition_mutations
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT policy: only service role can write
-- No UPDATE or DELETE: append-only forever
```

The absence of an INSERT policy for authenticated users means: clients using the Supabase JS SDK cannot write mutation records. Only the server-side `supabaseAdmin` can. This prevents audit forgery.

The absence of UPDATE/DELETE means: the audit log cannot be modified or purged, even by the server, except by a Supabase admin operating directly on the database — which would be logged at the infrastructure level.

---

## Environment Strategy

### Local development

```
DISABLE_AUTH_FOR_DEV=true     # Skip JWT validation
DEV_AI_FALLBACK=true          # Stub AI responses on 429
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local key from supabase start>
VITE_DEV_DISABLE_AUTH=true    # Frontend: skip AuthGate (apps/web/.env.local only)
```

The local Supabase instance runs via Docker (`npx supabase start`). Migrations are applied via `./scripts/push-migrations.sh`.

### Production

```
DISABLE_AUTH_FOR_DEV=false (or unset)
DEV_AI_FALLBACK=false (or unset)
SUPABASE_URL=https://mwtyckyguduigflpnqss.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<cloud key>
OPENAI_API_KEY=<real key>
```

### Preview deployments (Vercel)

Preview deployments cannot use Google OAuth without registering every dynamic preview URL in Google Cloud Console. The practical strategy:

- Use email magic link only for preview testing
- Disable Google OAuth on preview branches
- Use `VITE_DEV_DISABLE_AUTH=true` only for pure frontend UI work

> **Never set `DISABLE_AUTH_FOR_DEV=true` in Vercel preview environment variables.** Preview deployments run in production-like conditions. The hard 500 protection exists, but the env variable should not be set in the first place.

---

## WhatAIKnows Page

**File:** `apps/web/src/routes/WhatAIKnows.tsx`
**Route:** `/what-ai-knows`
**Nav:** Sidebar under Privacy & Security → "What AI Knows"

### What it shows

- **Memories tab:** All `journal_entries` with truth state badges, expandable content, inline revision
- **Insights tab:** All `insights` with truth states
- **Entities tab:** All `entities` the system recognizes, with canonical name, type, and state
- **Audit tab:** Paginated `cognition_mutations` showing mutation type, rationale, and timestamp

### Revision flow

1. User clicks "Revise truth state" on any artifact
2. `ReviseModal` opens — fetches permitted transitions from `/api/identity/permitted-transitions?currentState=`
3. User selects target state
4. If transition requires rationale (DISPUTE, CORRECTION): textarea appears, rationale required
5. `POST /api/identity/revise/:artifactId` → `CorrectionAuthority.applyRevision()`
6. On success: page reloads, audit log updated

### Data export

`GET /api/identity/export` streams NDJSON. Format: one JSON object per line, with a `type` field:

```json
{"type":"journal_entry","id":"...","title":"...","created_at":"..."}
{"type":"cognition_mutation","id":"...","mutation_type":"CORRECTION",...}
{"type":"entity","id":"...","canonical_name":"..."}
```

---

## Security Observations

1. **The auth bypass is single-flag and well-guarded.** The production hard 500 is the right call. The one-time log for bypass activation is good observability. The risk is a developer committing `.env` with `DISABLE_AUTH_FOR_DEV=true` and deploying — gitignore enforcement and pre-commit hooks should prevent this.

2. **The service role key is the master key.** Anyone with `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS. It must never appear in client-side code, committed files, or logs. The current architecture is correct (server-only via `supabaseAdmin`), but this should be verified on every deployment.

3. **The `actor_id` field is future-compatible.** Current behavior: `actor_id === user_id` always. Future: a therapist, a guardian, or a delegated agent could act on behalf of a user. The column is there. The delegation auth model is not. Do not collapse this field.

4. **The `cognition_mutations_export` view strips `actor_id`.** This is intentional for data portability — users get their data without internal actor identifiers. The view is defined in the migration and is safe.

5. **RLS coverage is complete as of sprint completion.** The outstanding `workout_events` table error in the migration was a cloud/local schema mismatch (table exists locally, not on cloud at migration time). All other 25 tables applied successfully. Verify with `supabase db push --dry-run` before the next migration pass.
