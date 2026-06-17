# Location Domain Health Report v2

Status: Location Authority Completion Sprint — Phase 5. Live cloud DB, founder `789bd607…`. Compare to [location-domain-health-report.md](location-domain-health-report.md) (v1).

## Metrics (v1 → v2)

| Metric | v1 | v2 | Target |
| --- | --- | --- | --- |
| `locations` rows | 13 | **16** | — |
| `locations` exact duplicates | 0 | **0** | 0 ✅ |
| Promoted rows (provenance tagged) | 0 | **3** | — |
| `people_places` total | 52 | 52 | — |
| `people_places` type=`place` | 8 | 8 | — |
| `people_places` type=`person` | — | 34 | — |
| **Orphan places** | 3 | **0** | **0 ✅** |
| **Book canonical coverage** | 13/16 (81%) | **16/16 (100%)** | **100% ✅** |
| Book synthesized ids | 0 | 0 | 0 ✅ |
| **Cross-table id overlap** | 0 | **0** | 0 ✅ |

## Interpretation

- **Canonical coverage 100%.** Every card the Location Book emits is a `locations.id`. The three previously-orphan places (Club Metro, Moms House, Moreno Valley) now have canonical rows, provenance-tagged.
- **Orphans 0.** No `people_places` place lacks a canonical `locations` row.
- **Duplicates 0.** Canonical set remains clean (16 distinct normalized names).
- **No new split-brain.** Cross-table id overlap is still 0 and no new tables/columns were introduced; the fix reduced id spaces in play rather than adding one.
- **people_places composition:** 34 person + 8 place + 10 other. The table remains a general people/entity store — only the *place* responsibility is now redundant with `locations` (see deletion readiness).

## Scorecard

| Dimension | v1 | v2 |
| --- | --- | --- |
| Merge works | ✅ (resolver) | ✅ |
| Book id authority | 81% canonical | **100% canonical** |
| Edit / facts authority | ⚠️ `locations.id`-only | ✅ resolver-tolerant |
| Orphan places | 3 | **0** |
| Provenance on promotion | — | ✅ recorded |
| New split-brain introduced | none | none |

## Residual / watch
- Episode `location_ids` lineage (ingestion `resolvedLocationIds`) should be confirmed to write `locations.id`. Not user-facing; tracked in the completion report.
- Re-run this report after any future bulk ingestion to confirm orphan rate stays 0 (new place mentions land in `people_places` first; the merge/PATCH resolver + the promotion backfill keep them consolidating).
