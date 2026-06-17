# Organization Domain Audit

Phase 1 of the Organization Intelligence & Community Ontology Sprint.

## Classification taxonomy

| Class | Examples | Top-level card? |
| --- | --- | --- |
| `COMPANY` | Amazon, Kforce | Yes |
| `INSTITUTION` | Clever Programmer Bootcamp | Yes |
| `COMMUNITY` | Los Goths | Yes |
| `SCENE` | Goth scene (sub-community) | Yes |
| `FAMILY` | My Family | Yes |
| `HOUSEHOLD` | Tía Grace Household, Anaheim Family Home | Yes (Households tab) — nests under family |
| `TEAM` | Sports team, squad | Yes |
| `BAND` | Music band | Yes |
| `FRIEND_GROUP` | Inner circle | Yes |
| `EVENT_GROUP` | Reunion, party | Hidden from All |
| `PROJECT` | Side project | Yes |
| `UNKNOWN` | Unclassified | Review |

## Audit outputs

`GET /api/organizations/audit` reports:

- **group count** — total organizations
- **byCategory** — classification breakdown
- **duplicates** — name overlap pairs
- **mergeSuggestions** — confidence-scored merge candidates
- **misclassifications** — household-as-family, community-as-company
- **memberCounts** — members per group
- **relationshipCount** — organization_relationships rows
- **topLevelViolations** — households without parent_group_id

## Founder validation

| Entity | Expected category |
| --- | --- |
| Amazon | COMPANY |
| Kforce | COMPANY (STAFFING) |
| Clever Programmer Bootcamp | INSTITUTION (BOOTCAMP) |
| Los Goths | COMMUNITY / SCENE |
| My Family | FAMILY |
| Tía Grace Household | HOUSEHOLD → child of My Family |
| Anaheim Family Home | HOUSEHOLD |
| Abuela Household | HOUSEHOLD |

## Success criteria

- No family appears as a company
- No household appears as a family (`group_type`)
- No community appears as a company
- Households have `parent_group_id` → family
- Los Goths links venues: Club Metro, First Street Pool, Gothicumbia
