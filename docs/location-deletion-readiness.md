# Location Deletion Readiness

Status: Location Authority Completion Sprint — Phase 6. **Assessment only — no deletion performed.**

Question: now that `locations.id` is the canonical authority, what `people_places` responsibilities remain, and what (if anything) is safe to remove later?

## people_places composition (founder)

| type | rows | role |
| --- | --- | --- |
| person | 34 | people mentions — core entity store |
| place | 8 | now mirrored to canonical `locations` |
| other | 10 | misc entity mentions |
| **total** | **52** | general people/entity mention store |

## Verdict by responsibility

### KEEP — the `people_places` table itself
`people_places` is a **general people/entity mention store**, not a locations table. It is read by **20+ modules**, including `EntityRegistry`, `workingMemoryAssembler`, `peoplePlacesService`, `recallQueryRouter`, `contextAwareMemoryRetrieval`, `characterFoundationService`, `biographyFoundationService`, `entityFactsService`, `memoryClaimGuard`. Deleting the table is out of the question — it underpins people/entity recall.

### MERGE — the *place* responsibility (functionally done)
Authority for places now lives in `locations`:
- Book emits `locations.id` (100%).
- merge / edit / facts resolve any id → `locations.id`.
- 8 place rows are mirrored by canonical `locations` rows (3 freshly promoted, provenance-tagged).

So the *place* responsibility has effectively moved. What remains is to stop *reading* `people_places` for places so the rows become truly redundant.

### DELETE — the 8 place-typed rows (DEFERRED, not now)
Safe to remove **only after** the readers below stop sourcing places from `people_places`. Until then, deleting them would blank the Book mid-transition.

**Blockers before place-row deletion:**
1. `locationService.listLocations` (line 276) still reads `people_places` to *discover* places. Must switch to discovering places from `locations` (+ journal metadata) only.
2. `locationSuggestionService` — verify it doesn't depend on place-typed `people_places` rows for suggestions.
3. `peoplePlacesService` place-handling paths — audit for place reads/writes.
4. Confirm episode `location_ids` (ingestion `resolvedLocationIds`) resolve to `locations.id`, not place-typed `people_places` ids.

## Recommended sequence (future sprint, no deletion here)
1. Repoint `listLocations` place discovery to `locations` (+ metadata); drop the `people_places` place read.
2. Re-run [location-domain-health-v2.md](location-domain-health-v2.md): confirm Book stays 16/16 canonical with the `people_places` place read removed.
3. Add a guard: new place mentions still land in `people_places` during ingestion, then the merge/PATCH resolver + `promoteOrphanLocations` backfill consolidate them — so place rows are transient, not authoritative.
4. **Only then** consider archiving/deleting the place-typed `people_places` rows (provenance already lets us trace them via `metadata.promoted_from_people_place`).

## Summary

| Item | Disposition |
| --- | --- |
| `people_places` table | **KEEP** (people/entity store, 20+ readers) |
| place responsibility | **MERGE** → `locations` (done at authority level) |
| 8 place-typed `people_places` rows | **DELETE — DEFERRED** (after listLocations stops reading people_places for places) |

No deletion was performed. The system is now safe and consistent on one authority; removing the redundant place rows is a clean, well-scoped follow-up gated on the four blockers above.
