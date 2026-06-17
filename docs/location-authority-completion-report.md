# Location Authority Completion Report

Status: Location Authority Completion Sprint — **done**. The Location Book now emits **only** canonical `locations.id`, and every consumer shares that authority. Shipped + verified against the live founder account.

Companions: [location-domain-health-v2.md](location-domain-health-v2.md), [location-deletion-readiness.md](location-deletion-readiness.md). Prior: [location-id-consolidation-plan.md](location-id-consolidation-plan.md).

## What was finished

| Phase | Change | Result |
| --- | --- | --- |
| 1 — Orphan promotion | Promoted the 3 orphan `people_places` places → canonical `locations` rows (provenance preserved) | Book **16/16 canonical**, **0 orphans** |
| 2 — PATCH hardening | `PATCH /api/locations/:id` resolves any id → canonical via `resolveCanonicalLocationId` | edit works from either id source |
| 3 — Facts hardening | `GET /api/locations/:id/facts` resolves via the resolver with `{ promote: false }` (no row creation on GET) | facts work from either id source |
| 4 — Flow validation | PATCH + facts paths return identical canonical ids for all test places | consistent |
| 5 — Health re-run | orphans = 0, canonical coverage = 100%, cross-table id overlap = 0 | targets met |
| 6 — Deletion readiness | people_places responsibilities classified | see readiness doc |

## Phase 1 — Orphan promotion (verified)

The 3 orphans and their new canonical rows:

```
Club Metro     (pp 60209f6a…) -> locations a70cab01-6c9c-461e-9b16-1aaaf9c251bd
Moms House     (pp 70b0e5aa…) -> locations 044cdb94-259e-46ce-b684-473a11b3ae59
Moreno Valley  (pp 6e334895…) -> locations c5497b19-1ecc-4a08-bfdd-96c5784cd024
```

- **Provenance preserved:** each promoted row carries `metadata.{ promoted_from_people_place, promoted_at, source:'people_places_promotion' }` (3 rows confirmed in DB).
- **References preserved:** verified `location_character_links` (6) all reference `locations.id` — none pointed at the orphan pp ids; `location_mentions` and location `entity_facts` were 0. So no reference rewrite was required.
- **Mechanism:** idempotent backfill `apps/server/src/scripts/promoteOrphanLocations.ts` (reuses `resolveCanonicalLocationId`), re-runnable for any user.

**Book result:** `listLocations` emits **16/16 canonical** (`canonical=16 people_places=0 synth=0`). Was 13/16 before this sprint.

## Phase 2/3 — Route hardening (verified)

`resolveCanonicalLocationId` gained a `{ promote?: boolean }` option (default true). PATCH promotes if needed; facts (a GET) uses `promote:false` so it never creates rows. Validation — both paths return the same canonical id for every previously-orphan place and for already-canonical places:

```
Club Metro pp     patch->a70cab01…  facts->a70cab01…  OK
Moms House pp     patch->044cdb94…  facts->044cdb94…  OK
Moreno Valley pp  patch->c5497b19…  facts->c5497b19…  OK
Abuelas House pp  patch->3ae41da8…  facts->3ae41da8…  OK
```

## Phase 4 — Full flow authority

| Operation | Authority | Status |
| --- | --- | --- |
| Location Book (list) | emits `locations.id` (16/16) | ✅ |
| Search (WMA) | name-based, id-agnostic | ✅ |
| Merge | resolver → `locations.id` | ✅ |
| Edit (PATCH) | resolver → `locations.id` | ✅ |
| Facts | resolver (read-only) → `locations.id` | ✅ |
| Duplicates | `locations.id` | ✅ |
| Timeline / `location_character_links` | `locations.id` (verified) | ✅ |
| Episode references | `location_ids` are ingestion-resolved UUIDs → should be `locations.id`; confirm at ingestion (see readiness doc) | ⚠️ verify |

## Success criteria

- ✅ Location Book emits only canonical `locations.id`.
- ✅ Merge, edit, facts, duplicates, search, timeline share one authority.
- ✅ No remaining orphan locations (0).
- ✅ No remaining user-facing location id drift.
- ⚠️ One internal follow-up: confirm episode `location_ids` are written as `locations.id` at ingestion time (not a user-facing path).

## Files changed
- `apps/server/src/services/locationMergeService.ts` — `resolveCanonicalLocationId` gains provenance on promote + `{promote}` option.
- `apps/server/src/routes/locations.ts` — PATCH + facts resolve through the canonical id.
- `apps/server/src/scripts/promoteOrphanLocations.ts` — new idempotent backfill.
- (Prior sprint) `apps/server/src/services/locationService.ts` — canonical precedence in `upsertLocation`.

`tsc` clean for all changed files. No new tables, no compatibility layer.
