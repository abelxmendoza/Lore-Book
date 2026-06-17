# Location Domain Audit

Phase 1 of the Place Intelligence & Spatial Ontology Sprint.

## Purpose

Audit every location in the founder account (and any user via `GET /api/locations/audit`) and classify extraction errors without deleting data.

## Classification taxonomy

Every location is classified into one of:

| Class | Examples | Top-level card? |
| --- | --- | --- |
| `HOUSEHOLD` | Moms House, Anaheim Family Home, Abuela's House | Yes |
| `ROOM` | Family Kitchen, Family Bathroom, Kitchen in Anaheim | No — nested in household |
| `PROPERTY` | Dad's Apartment, condo | Yes |
| `VENUE` | Club Metro, Goth Club | Yes |
| `BUSINESS` | Abuela's Costco, doctor office | Yes |
| `CITY` | Anaheim, Moreno Valley | Yes |
| `REGION` | Orange County | Yes |
| `EVENT_LOCATION` | Club Metro Anniversary, Goth Show by Metro | No — becomes EVENT → venue |
| `LANDMARK` | — | Yes |
| `UNKNOWN` | unclassified strings | Yes (review) |

## Audit outputs

The audit service (`locationDomainAuditService`) reports:

- **location count** — total `locations` rows
- **duplicates** — normalized name or alias-score matches
- **orphans** — rooms without `parent_location_id`
- **households** — dwelling-class locations
- **rooms** — kitchen/bathroom/bedroom-class
- **event-like locations** — show/party/anniversary keywords
- **possessive locations** — `Owner's Place` splits (person + location, never fused)
- **top-level violations** — rooms or events appearing as primary cards

## API

```
GET /api/locations/audit
POST /api/locations/normalize?dry_run=true
GET /api/locations/merge-suggestions
GET /api/locations/duplicates
```

## Founder validation examples

| Input | Expected classification |
| --- | --- |
| Moms House | HOUSEHOLD — merge candidate with Anaheim Family Home |
| Anaheim Family Home | HOUSEHOLD |
| Family Kitchen | ROOM → parent household |
| Family Bathroom | ROOM → parent household |
| Abuela's House | HOUSEHOLD + possessive owner Abuela |
| Abuela's Costco | BUSINESS + Abuela relationship |
| Club Metro Anniversary | EVENT_LOCATION → hosted at Club Metro |
| Goth Show by Metro | EVENT_LOCATION → hosted at Club Metro |
| Tío Juan's Doctor | BUSINESS + Tío Juan relationship |

## Success criteria

- No room exists as a top-level place card
- No event exists as a place card
- No person-location fusion entities remain
- Households contain rooms via `parent_location_id`
- Venues contain events via `metadata.linked_venue_name`
