# Unknown Detection Report

**Sprint:** Knowledge Coverage & Trust Center — Phase 4  
**Service:** `apps/server/src/services/trust/unknownDetectionService.ts`

## Purpose

Surface **gaps**: things mentioned or implied in lore that lack a complete Book profile or relationship edge.

## Detection sources

| Source | Table / service | Gap kinds |
|--------|-----------------|-----------|
| Structured gaps | `knowledge_gaps` (status `pending`) | `mentioned_person_no_profile`, `sparse_entity` |
| Omega entities (people) | `omega_entities` type PERSON/CHARACTER | `mentioned_person_no_profile` |
| Omega entities (places) | `omega_entities` entity_type LOCATION | `mentioned_place_no_location` |
| Project suggestions | `project_suggestions` pending | `mentioned_project_no_card` |
| Orphan characters | `characters` without `character_relationships` | `no_relationship` |

## Gap kinds

| Kind | Example | Domain |
|------|---------|--------|
| `mentioned_person_no_profile` | Name in chat, no Character card | characters |
| `mentioned_place_no_location` | "Club Metro" mentioned, no Places entry | locations |
| `mentioned_project_no_card` | Suggested project not confirmed | projects |
| `mentioned_org_no_group` | (reserved) org mention without group | organizations |
| `no_relationship` | Character exists, no relationship edge | relationships |
| `sparse_entity` | Low-evidence entity from knowledge_gaps | characters |
| `timeline_void` | (reserved) chronology hole | events |

## Priority scoring

Gaps sorted descending by `priority` (max 50 returned):

- Knowledge gaps (unknown entity): **85**
- Omega people: **70 + min(20, mentions×3)**
- Omega places: **60 + min(15, mentions×2)**
- Project suggestions: **65 + confidence×20**
- No relationship: **45**

## Founder validation examples

| Label | Expected kind | Notes |
|-------|---------------|-------|
| Tío Ray | `mentioned_person_no_profile` | Mentioned in family lore, not promoted |
| New contacts from chat | `mentioned_person_no_profile` | Omega / knowledge_gaps |
| Club Metro | `mentioned_place_no_location` | Until Places Book entry exists |
| Side project mention | `mentioned_project_no_card` | Pending `project_suggestions` |
| Abuela | — | Should **not** appear (has profile → known) |
| LoreBook | — | Project card exists → known |
| Amazon | — | Org/project known |

## API

```
GET /api/trust/unknowns
GET /api/trust/overview  # includes unknowns[]
```

## UI

- **Trust Center** → "Unknowns" panel (top 12)
- **BookTrustSummary** → entity counts; full gaps on `/trust`
- Legacy **Knowledge Gaps** at `/gaps` still uses `knowledge_gaps` directly

## Review handoff

Each unknown is copied into `review_queue` by `reviewPriorityService` with `action: fill_gap` and the gap `prompt` as the reason — suitable for "Tell LoreBook" chat handoff.
