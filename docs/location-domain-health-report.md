# Location Domain Health Report (Phase 7)

Status: Location Authority Consolidation Sprint — Phase 7. Metrics from the live cloud DB, founder account `789bd607…`.

## Metrics

| Metric | Value | Note |
| --- | --- | --- |
| `locations` rows | **13** | the canonical authority |
| `locations` distinct normalized names | 13 | — |
| `locations` exact duplicates | **0** | clean canonical set |
| `people_places` rows | **52** | people + places mixed |
| `people_places` type=`place` | **8** | place-typed mentions |
| Orphan places (people_places place w/ no canonical row) | **3** | the Book's only non-canonical ids |
| Canonical-only locations (no people_places by name) | **8** | exist in `locations`, not in people_places |
| **Cross-table id overlap** (`locations.id` == `people_places.id`) | **0** | ← the disjoint id spaces that caused the bug |

## Interpretation

- **Duplicate rate (within authority):** 0% exact duplicates in `locations`. The canonical set is healthy; duplication risk lives in *name variants* across tables (e.g. "Club Metro" vs "The Club Metro anniversary…"), which duplicate-review + merge now handle.
- **Orphan rate:** 3 of 8 people_places places (37.5%) lack a canonical `locations` row. These are the only cards the Book emits with a non-canonical id; Phase-1 resolver makes them mergeable, and the Phase-5 backfill promotes them to 0.
- **Cross-table mismatch:** the defining pathology — **0 shared ids** between `people_places` and `locations`. The Book was emitting ids from a table no write path consumes. This is now corrected at the source (Phase 4): 13/16 cards emit `locations.id`.

## Health scorecard

| Dimension | Before sprint | After sprint |
| --- | --- | --- |
| Merge works | ❌ 500 on people_places ids | ✅ resolver maps any id → canonical |
| Book id authority | mixed (mostly people_places) | ✅ 13/16 canonical, 0 synthesized |
| Duplicate set integrity | clean (0 dupes) | clean |
| Orphan places | 3 (un-mergeable) | 3 (mergeable via resolver; →0 after backfill) |
| New split-brain introduced | — | **none** (no new tables/layers) |

## Recommended follow-ups (tracked in consolidation plan)
1. One-time backfill: promote the **3 orphan places** to canonical `locations` rows → Book becomes 100% `locations.id`.
2. Extend `resolveCanonicalLocationId` to `PATCH`/`facts`.
3. Verify ingestion writes `locations.id` into chat `location_ids` so episode references share the authority.
4. Re-run these metrics after backfill; success = orphan rate 0, Book canonical 100%, cross-table overlap remains 0.
