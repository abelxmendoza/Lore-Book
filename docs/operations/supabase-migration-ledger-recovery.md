# Supabase migration-ledger recovery

## Current status

The production migration ledger was baselined successfully on 2026-08-06:

- all 15 malformed rows were verified to contain no SQL, confirmed to duplicate
  canonical 14-digit versions, and removed atomically;
- the founder-specific operational migration label was replaced with a
  privacy-safe historical label without changing live role state;
- a schema-only production snapshot and the complete 178-row pre-baseline
  ledger were retained in private recovery storage;
- all 178 historical ledger rows were also copied to
  `supabase_migrations.schema_migrations_legacy_20260807` in production;
- the active ledger was atomically replaced by the production schema baseline,
  Narrative Moments expansion, and Knowledge Kernel migration;
- the active local and remote histories match exactly for those three versions;
- the Knowledge Kernel tables, indexes, RLS, grants, and rollback-only synthetic
  writes were verified in production;
- the production health and database-schema smoke checks passed.

A disposable Supabase preview branch then confirmed that the legacy history is
not reproducible: the branch ledger marked the cognition graph substrate as
applied while `assertion_evidence` and other expected tables were absent. The
Knowledge Kernel and internal-table hardening migrations were updated to handle
those missing optional predecessors, and both then applied successfully on the
branch. Synthetic Kernel writes confirmed that one evidence source can support
and challenge the same assertion without conflict. The preview branch was
deleted after verification.

The 324 old SQL files remain available under
`supabase/migrations_legacy_20260806/` for audit and recovery, but they are no
longer an active replay chain. `supabase/migrations/` is now the only active
directory and begins with the production schema baseline.

One tested local-only migration remains pending:
`20260807040300_optimize_assertion_evidence_rls.sql`. It preserves the existing
owner policy while changing `auth.uid()` to `(SELECT auth.uid())` to avoid a
per-row RLS initialization warning. It was not applied as part of the baseline
because that additional production optimization requires separate approval.

## Historical failure mode

Supabase branching compares the remote migration ledger with
`supabase/migrations`. The project previously had three distinct forms of drift:

1. the same logical migration exists under different timestamps;
2. some remote `version` values contain a migration name instead of only a
   14-digit timestamp;
3. the repo also contains migrations that are genuinely newer than the remote
   database.

Running `supabase db push` while those groups were mixed could make an already
applied migration appear pending. The production baseline now removes that
ambiguity; the historical files remain outside the active migration directory.

Fifteen malformed rows were verified to contain no SQL and duplicate existing
canonical versions before they were removed atomically. A founder-specific
operational role assignment was replaced in the ledger with a privacy-safe
historical label at the same version; the live role state was not changed.

## Read-only diagnosis

Run:

```bash
npm run audit:migration-ledger
```

The command reads `supabase_migrations.schema_migrations` and classifies rows as:

- exact version matches;
- same name with a different timestamp;
- malformed remote versions;
- ambiguous mappings caused by duplicate local timestamps or names;
- remote-only migrations;
- local-only migrations.

It never changes the database or migration files. A JSON export can be audited
without a database connection:

```bash
npm run audit:migration-ledger -- --remote-json /path/to/migrations.json
```

For an ephemeral ledger export that is never written to disk:

```bash
supabase migration list --output json \
  | npm run audit:migration-ledger -- --remote-stdin
```

`local-only` is expected for a normal pending migration. The command fails only
when the existing remote history is unsafe to replay automatically.

## Completed recovery sequence

1. Export a database schema snapshot and the complete remote migration ledger.
2. Freeze new migration creation until the histories are reconciled.
3. Use `supabase/migrations` as the single canonical migration directory. Treat
   root `migrations/` as legacy input, not a second deploy source.
4. Map same-name/different-timestamp rows. Review every mapping rather than
   assuming names prove identical SQL.
5. Review malformed remote rows. If both the malformed value and its canonical
   14-digit base exist, treat it as a likely duplicate ledger record—not as a
   migration to replay.
6. Rehearse the proposed history repair on an isolated database or preview
   branch. A clean-from-zero migration run is not sufficient because the repo's
   historical migrations have known ordering issues.
7. Run the read-only audit again. Do not continue until retimestamped,
   malformed, and unexplained remote-only groups are empty.
8. Apply the Knowledge Kernel migration in the isolated environment.
9. Verify the new tables, foreign keys, indexes, grants, RLS policies, and API
   behavior. Run Supabase security and performance advisors.
10. After the rehearsal passed, perform the reviewed ledger repair and
    migrations atomically on the protected main branch.

All ten steps are complete. Future migrations must be created only in
`supabase/migrations/` and tested against the baseline chain.

## Explicit approval boundary

The following commands change remote migration history and require an approved,
reviewed repair plan:

- `supabase migration repair ...`
- direct writes to `supabase_migrations.schema_migrations`
- `supabase db push`

Never use the audit script's output as permission to mutate production.

## Production security hotfix status

On 2026-08-06, the independent RLS findings were resolved in production for
these server-owned public tables:

- `api_rate_limit_buckets`
- `project_chronicle_milestones`
- `project_chronicle_pending_detections`
- `project_chronicle_meta`

Application call-path review found that all four tables are accessed only by
the server through `supabaseAdmin`; there is no browser/client path. Production
now has RLS enabled, no `anon` or `authenticated` table privileges, and explicit
`service_role` access. No user policies were added intentionally, so the
Supabase advisor's informational `rls_enabled_no_policy` notices are expected.

The `check_api_rate_limit(text, integer, integer)` RPC is also restricted to
`service_role`, and its search path is pinned to `pg_catalog, public`.

The historical implementation remains at
`supabase/migrations_legacy_20260806/20260807020947_harden_internal_tables_rls.sql`.
Its final schema and privilege state are captured directly in the production
baseline, so no separate active migration is required.

Normal migration comparison is safe again. A local-only migration now means a
genuinely pending migration rather than unexplained historical drift.

## Character Timeline DROP (closed 2026-08-21)

Production applied `DROP TABLE IF EXISTS public.character_timeline_events CASCADE`
and recorded it as:

| Field | Value |
| ----- | ----- |
| version | `20260821194550` |
| name | `drop_character_timeline_events` |

The active repo file is `supabase/migrations/20260821194550_drop_character_timeline_events.sql`
so ledger audit is an **exact** version match. Do not reintroduce
`20260821140000_drop_character_timeline_events.sql`; that timestamp is retired
authorship history, not the production ledger row.

This DROP is closed infrastructure history. Do not treat it as an active
release gate. Do not run `supabase db push` or re-apply the SQL because the
filename moved. `DROP TABLE IF EXISTS` is idempotent if a stale environment
still needs the production version recorded.
