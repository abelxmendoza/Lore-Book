# Location Normalization Report

## Pipeline

```
Raw location string
    ↓
placeIntelligence.classifyPlace()
    ↓
locationNormalizationService.normalizeUserLocations()
    ↓
Persisted: root_type, spatial_category, spatial_subcategory,
            parent_location_id, metadata links
    ↓
LocationBook.isTopLevelPlace() filter
```

## Normalization actions

| Detection | DB update | UI effect |
| --- | --- | --- |
| Room | `parent_location_id`, `spatial_category=ROOM` | Hidden from card grid |
| Event | `root_type=EVENT`, `metadata.spatial_hidden=true` | Hidden from card grid |
| Possessive | `metadata.possessive_owner`, character link | Detail shows owner |
| Venue alias | `metadata.canonical_venue_name` | Merge suggestion |
| Household | `spatial_category=HOUSEHOLD` | Top-level home card |

## API

```http
POST /api/locations/normalize
POST /api/locations/normalize?dry_run=true
GET  /api/locations?normalize=true
```

## Report fields

```typescript
{
  processed: number;
  roomsNested: number;
  eventsReclassified: number;
  possessivesLinked: number;
  venuesCanonicalized: number;
  householdsEnsured: number;
  skipped: number;
}
```

## Merge normalization

Duplicate detection uses three signals:

1. **Exact** — `normalized_name` collision
2. **Alias** — `placeDuplicateScore() >= 0.65`
3. **Containment** — substring name overlap

Suggested merges never auto-apply. User confirms via Place Review Center (`LocationMergePanel`).

## Founder account expected outcomes

After normalization:

- Moms House + Anaheim Family Home → merge candidate (~high confidence if both exist)
- Family Kitchen, Family Bathroom → nested under family household
- Club Metro Anniversary → event flag, not a place card
- Abuela's House → household with Abuela character link
- Tío Juan's Doctor → business with Tío Juan link

## Non-destructive policy

Normalization **classifies and relates** — it does not delete rows. Events and rooms remain queryable; they are excluded from the primary Places Book grid only.
