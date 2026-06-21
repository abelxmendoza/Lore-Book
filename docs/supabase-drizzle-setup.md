# Supabase + Drizzle Setup

LoreBook keeps Supabase JS for Auth, Storage, Realtime, and existing PostgREST-backed service code. Drizzle is added as an incremental direct-Postgres layer for vector search, bulk jobs, maintenance, and analytics.

## Environment

Existing local `.env` already has `DATABASE_URL` pointing at the Supabase pooler. For transaction-pooler deployments, prefer a separate variable:

```env
# Transaction pooler, IPv4-only. Use the real DB password from Supabase Connect.
SUPABASE_POOLER_TRANSACTION_URL="postgresql://postgres.cshtthzpgkmrbcsfghyq:[YOUR-PASSWORD]@aws-1-us-west-1.pooler.supabase.com:6543/postgres"

# Session pooler or direct DB URL. Existing migration tooling reads DATABASE_URL.
DATABASE_URL="postgresql://postgres.cshtthzpgkmrbcsfghyq:[YOUR-PASSWORD]@aws-1-us-west-1.pooler.supabase.com:5432/postgres"
```

For `@supabase/server`, the SDK-native names are:

```env
SUPABASE_URL="https://cshtthzpgkmrbcsfghyq.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SECRET_KEY="sb_secret_..."
SUPABASE_JWKS_URL="https://cshtthzpgkmrbcsfghyq.supabase.co/auth/v1/.well-known/jwks.json"
```

The Express adapter in `apps/server/src/supabase/serverContext.ts` falls back to the existing `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` until the new publishable/secret keys are issued.

## Commands

```bash
npm run db:generate
npm run db:push
npm run db:studio
```

Do not run `db:push` against production without reviewing the generated SQL. Existing Supabase migrations remain the source of truth until the Drizzle pilot is approved.

## Runtime Use

- `apps/server/src/db/drizzle/client.ts` creates a transaction-pooler-safe `postgres` client with `prepare: false`.
- `apps/server/src/db/drizzle/memoryQueries.ts` contains the first typed query layer for LoreBook memory/vector reads.
- Existing `supabaseAdmin` remains active for current service code.

## Migration Rule

Drizzle is currently a typed query layer, not the owner of the full schema. Use it for new typed query modules first. Promote it to migration ownership only after schema diff review and production migration policy approval.
