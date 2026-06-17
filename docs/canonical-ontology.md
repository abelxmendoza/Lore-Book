# Canonical Entity Ontology

Status: implemented as the authoritative deterministic classifier in `apps/server/src/services/entities/entityClassifier.ts`.

## Core Rule

`Person` requires positive evidence. Unknown proper nouns remain `Unknown` until additional evidence, user confirmation, or repeated high-confidence extraction promotes them. Non-person categories are never eligible for Character cards.

## Canonical Types

| Type | Meaning | Legacy Storage Mapping | Character Eligible |
| --- | --- | --- | --- |
| Person | A real individual person, including kinship names when used as a person reference. | `people_places.type = person`, `omega_entities.type = PERSON` | Yes |
| Family | A named household, family branch, or family collective. | `organization` / `ORG` | No |
| Place | A city, region, venue, household, or location. | `place` / `LOCATION` | No |
| Organization | A company, institution, team, church, band, or named collective. | `organization` / `ORG` | No |
| Group | A crew, squad, band, or social group that is not a single person. | `organization` / `ORG` | No |
| Project | A named project or initiative. | `platform` / `PROJECT` | No |
| Event | A party, wedding, graduation, holiday, show, concert, ceremony, or dated occurrence. | `event` / `EVENT` | No |
| Product | A physical or commercial product. | `platform` / `PRODUCT` | No |
| Brand | A brand distinct from the company itself. | `organization` / `BRAND` | No |
| App | A software app or digital service. | `platform` / `APP` | No |
| Skill | A practiced skill, capability, trade, or craft. | `platform` / `SKILL` | No |
| Pet | An animal companion. | `platform` / `PET` | No |
| Vehicle | A car, motorcycle, bike, truck, or named vehicle. | `platform` / `VEHICLE` | No |
| Media | A show, book, game, song, franchise, or creative work. | `platform` / `MEDIA` | No |
| FoodDrink | A drink, food item, alcohol brand/item, snack, or consumable product. | `platform` / `FOOD_DRINK` | No |
| Unknown | A mention without enough evidence to classify. | `unclassified` / `UNKNOWN` | No |

## Deterministic Classifier Order

1. Exact lexicons for apps, food/drink, products, brands, organizations, bands, media, and skills.
2. Company-prefixed product patterns, such as `Amazon Ring`.
3. Household and possessive dwelling patterns, such as `Mom's House`.
4. Family/group suffixes.
5. Event suffixes.
6. Known places, geographic suffixes, venue suffixes, and locative context.
7. Person evidence: kinship/honorific prefix or person-action context.
8. Default to `Unknown`.

## Required Promotion Invariant

Only `Person` and unresolved `Unknown` mentions with sufficient repeat evidence may reach promotion review. Known non-person categories are blocked at registry and promotion boundaries.

Character lifecycle:

`Mention -> Entity -> Evidence -> Confidence -> Promotion Candidate -> Character`

No single mention should automatically create a Character card. Manual creation and user-confirmed merge resolution remain allowed, but automatic ingestion must earn promotion through repeat evidence and duplicate review.
