# Place Intelligence Report

## Mission

Transform the Places Book from a flat list of extracted strings into a **spatial knowledge graph** with correct classification, normalization, relationships, and user-confirmed merges.

## Implementation

### Core classifier

`apps/server/src/services/ontology/placeIntelligence.ts`

Deterministic classification pipeline:

1. **Possessive split** — `Abuela's House` → owner + place part (never one fused entity)
2. **Event disambiguation** — show/concert/party/anniversary keywords → `rootType: EVENT`
3. **Room detection** — kitchen/bathroom/bedroom → `category: ROOM`, nested under household
4. **Property/household** — house/home/apartment keywords
5. **Geographic** — known cities + suffix heuristics
6. **Business** — Costco, doctor, clinic, store
7. **Venue** — club, bar, gym, restaurant + canonical name stripping

### Persistence

Migration `20260617120000_spatial_ontology.sql` adds:

- `root_type` — `PLACE` | `EVENT`
- `spatial_category` — HOUSEHOLD, ROOM, VENUE, etc.
- `spatial_subcategory` — KITCHEN, NIGHTCLUB, HOUSE, etc.
- `parent_location_id` — room → household link

Metadata mirror: `metadata.spatial_classification`, `metadata.possessive_owner`, `metadata.linked_venue_name`.

### Normalization service

`locationNormalizationService.normalizeUserLocations(userId)` applies classifications to all rows, nests rooms, flags events, links possessive owners to character IDs when found.

### UI

- `LocationBook` filters with `isTopLevelPlace()` — rooms and events hidden from card grid
- Session-first `POST /api/locations/normalize` on Places Book load
- `LocationMergePanel` shows duplicate confidence from place intelligence scores

## Extraction error classes addressed

| Error | Fix |
| --- | --- |
| Household rooms promoted to top-level | ROOM + parent_location_id |
| Events promoted to places | root_type EVENT + spatial_hidden |
| Possessive locations fused | possessive split + character link |
| Venue aliases creating duplicates | canonicalVenueName + merge suggestions |
| Family locations duplicated | merge review with confidence scores |
| Cities/homes/venues competing | spatial_category hierarchy |

## Character authority (parallel track)

Character conversation rescan (`POST /api/characters/rescan`) replays journal + chat through lexical intelligence, promotes people to Character Book cards with modal detail views.
