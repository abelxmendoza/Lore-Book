# Location Merge Fix Report (Phase 1 Hotfix)

Status: Location Authority Consolidation Sprint — Phase 1. **Shipped + verified.**
Builds on the proven root cause in the merge investigation (split-brain id space).

## What was failing
`POST /api/locations/merge` 500'd with `"Source location not found"` because the Location Book (`GET /api/locations`) emits **people_places ids** while merge resolved against the **`locations`** table — disjoint id spaces (live: 0 cross-table id overlap).

## The fix (smallest safe change)
Added `resolveCanonicalLocationId(userId, id)` to `locationMergeService` ([locationMergeService.ts](../apps/server/src/services/locationMergeService.ts)) and call it for **both** source and target before any lookup/equality check:

1. id already a `locations` row → use it.
2. id is a `people_places` id → map by **normalized name** to the canonical `locations` row.
3. people_places with no canonical row yet → **promote** it into `locations` (a row, not a new table).
4. resolves to nothing the user owns → `null` → clear "not found".

Self-merge and "not found" checks now run on the **resolved** ids, so `merge` is id-source-agnostic. No new table, no compatibility layer, no client change.

## Before → After (Abuelas House reproduction)

```
people_places "Abuelas House" id = a89d1075-0fd4-4945-8200-d0cff637f291  (what the UI sends)
locations     "Abuelas House" id = 3ae41da8-3177-4e3d-8b62-66e1b837c4d5  (canonical)
```

| | Behaviour |
| --- | --- |
| **Before** | merge looks up `a89d1075…` in `locations` → NULL → throw → **500 "Source location not found"** |
| **After** | `resolveCanonicalLocationId('a89d1075…')` → **`3ae41da8…`** → merge proceeds |

Verified live (read-only run of the resolver against the founder account):
```
resolveCanonicalLocationId(a89d1075-…) -> 3ae41da8-…   ✅ PASS
```

## Scope / safety
- Resolver is additive; the only write it performs is promoting an orphan people_places place to a canonical `locations` row (case 3), which is exactly the consolidation direction.
- `tsc` clean for the changed file.
- Destructive end-to-end merge was **not** run against production founder data; the id-resolution (the failing step) was verified directly.

## Residual (addressed by Phase 4, see consolidation plan)
The hotfix makes merge tolerant of mixed ids. The durable fix is to stop emitting mixed ids in the first place — `GET /api/locations` should emit canonical `locations.id`. That is Phase 4 (precedence fix), already implemented and validated in [location-id-consolidation-plan.md](location-id-consolidation-plan.md).
