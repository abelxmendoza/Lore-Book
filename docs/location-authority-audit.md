# Location Authority Audit (Phase 2)

Status: Location Authority Consolidation Sprint — Phase 2.
Every location read/write path, with the table it uses, the id it **emits**, and the id it **consumes**.

## Authority matrix

| Path | Code | Table(s) | ID emitted | ID consumed | Authority-correct? |
| --- | --- | --- | --- | --- | --- |
| `GET /api/locations` | `locationService.listLocations` | **people_places** + journal metadata + `locations` | `locations.id` (canonical, after Phase 4) or `people_places.id` (orphan fallback) | — | ⚠️ mixed pre-fix; **mostly canonical after Phase 4** (13/16) |
| `GET /api/locations/duplicates` | `locations.ts:59` | `locations` | `locations.id` | — | ✅ |
| `POST /api/locations/merge` | `locationMergeService.merge` | `locations` (+ resolver into `people_places`) | — | any id → resolved to `locations.id` (Phase 1) | ✅ (after hotfix) |
| `PATCH /api/locations/:id` | `locationService.updateLocation` (`locations.ts:156`) | `locations` | — | **`locations.id` only** | ⚠️ fails on a people_places id (orphan case) |
| `POST /api/locations/suggestions/accept` | `locationSuggestionService.acceptSuggestion` | `locations` | `locations.id` | — | ✅ |
| `GET /api/locations/:id/facts` | `locations.ts:140` | `entity_facts`/`locations` by id | facts | `locations.id` | ⚠️ same as PATCH |
| Delete | (no standalone route) | `locations` | — | via `merge` only | ✅ |
| Episode references | `episodePersistenceService` `source_location_ids`/`location_ids` | `episodes` | UUID arrays | **ingestion-resolved** location ids (`resolvedLocationIds` from chat metadata) | ⚠️ separate resolution path — verify it resolves to `locations.id` |
| Duplicate detection | `locations.ts:59` | `locations` | `locations.id` | — | ✅ |
| Working memory / search | `workingMemoryAssembler` location lookups | `locations` (`locations:${targetKey}` by name) | name-matched | name | ✅ (name-based, id-agnostic) |

## Findings

1. **The single offender is `GET /api/locations`** (`listLocations`). It is the only path that *emits* a non-canonical id (people_places id or synthesized `location-<slug>`). Every consumer (`merge`, `PATCH`, `facts`) keys on `locations.id`. So drift originates at the read path, and the symptom appears at every write path.
2. **`/duplicates` was never wrong** — it reads `locations` and emits `locations.id`. The duplicate-review merge path always worked; the **manual-selection** merge path (ids from the Book) is what 500'd.
3. **PATCH and facts share the same latent bug** as merge did — they consume `locations.id` and would fail on an orphan people_places id. Phase 4 (emit canonical ids) fixes the common case; the Phase 1 resolver pattern should be extended to PATCH/facts for full coverage (see consolidation plan).
4. **Episodes store ingestion-resolved location ids** — a separate resolution lineage. Must confirm `resolvedLocationIds` resolve to `locations.id` so episode→location joins stay consistent under one authority.
5. **Disjoint id spaces confirmed:** 0 rows where a `locations.id` equals a `people_places.id` (live). people_places and locations never shared ids — the Book was emitting the wrong space entirely.

## Conclusion
Authority must be fixed **at the source (`listLocations`)**, not patched at each consumer. The merge hotfix (Phase 1) buys time; the precedence fix (Phase 4) removes the drift; PATCH/facts should adopt the same canonical resolution for completeness.
