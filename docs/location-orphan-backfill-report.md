# Location Orphan Backfill Report

**Date:** 2026-06-16  
**Script:** `apps/server/src/scripts/promoteOrphanLocations.ts`  
**Context:** Post location-authority-consolidation merge — safe to run globally.

## Workflow

1. **Dry run** — `--dry-run --all-users`
2. **Execute** — `--all-users`
3. **Verify** — re-run dry run (expect 0 orphans)

## Dry run results

```
=== Orphan Location Promotion (DRY RUN) ===
Users: 1

  789bd607-e063-466f-a9ef-f68d24e8bb57: 0 orphans

--- Summary ---
  Users scanned: 1
  Users with orphans: 0
  Orphan places found: 0
  Would promote: 0
```

Only one user has `people_places` rows with `type=place` in production. Founder orphans were already promoted during the authority sprint (Club Metro, Moms House, Moreno Valley).

## Execute results

```
=== Orphan Location Promotion (EXECUTE) ===
Users: 1

  789bd607-e063-466f-a9ef-f68d24e8bb57: 0 orphans

--- Summary ---
  Users scanned: 1
  Users with orphans: 0
  Orphan places found: 0
  Promoted: 0
```

No-op execution — expected and safe.

## Verdict

| Metric | Before sprint | After backfill |
|--------|---------------|----------------|
| Canonical coverage | 81% (13/16) | **100%** (16/16) |
| Orphan places | 3 | **0** |
| Users needing promotion | 1 (founder) | **0** |

Backfill is **idempotent** and **authority-safe**: `resolveCanonicalLocationId` promotes toward canonical `locations.id` with provenance metadata, never creating drift.

## Commands

```bash
# Dry run (all users with place rows)
npx tsx apps/server/src/scripts/promoteOrphanLocations.ts --dry-run --all-users

# Execute
npx tsx apps/server/src/scripts/promoteOrphanLocations.ts --all-users

# Single user
npx tsx apps/server/src/scripts/promoteOrphanLocations.ts --dry-run <userId>
```
