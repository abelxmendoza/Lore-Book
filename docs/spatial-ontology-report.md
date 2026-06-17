# Spatial Ontology Report

## Canonical hierarchy

```
PLACE
├── GEOGRAPHIC
│   ├── Country
│   ├── State
│   ├── City
│   └── Neighborhood
│
├── PROPERTY
│   ├── Household
│   ├── Apartment
│   ├── House
│   └── Residence
│
├── ROOM
│   ├── Kitchen
│   ├── Bathroom
│   ├── Bedroom
│   └── Garage
│
├── VENUE
│   ├── Nightclub
│   ├── Music Venue
│   ├── Restaurant
│   ├── Bar
│   ├── Gym
│   └── Event Space
│
├── BUSINESS
│
└── LANDMARK
```

## Column mapping

| Ontology field | DB column | Example |
| --- | --- | --- |
| rootType | `root_type` | PLACE, EVENT |
| category | `spatial_category` | HOUSEHOLD, ROOM, VENUE |
| subcategory | `spatial_subcategory` | KITCHEN, NIGHTCLUB |
| parent | `parent_location_id` | room → household UUID |

## Spatial relationships

Stored in `metadata.spatial_relationship` and associated arrays:

| Relationship | Example |
| --- | --- |
| `INSIDE` | Kitchen → Anaheim Family Home |
| `PART_OF` | Room → Household |
| `HOSTED_AT` | Club Metro Anniversary → Club Metro |
| `LOCATED_IN` | Anaheim Family Home → Anaheim |
| `HOME_OF` | Abuela → Abuela's House |
| `LIVES_AT` | Kin possessive dwellings |
| `ASSOCIATED_WITH` | Tío Juan → Doctor Office |
| `OWNS` | Abuela → Abuela's Costco (business visit) |
| `VISITS` | Character → venue |

## Possessive intelligence

Pattern: `Owner's PlacePart`

```
Abuela + House     → HOUSEHOLD, LIVES_AT
Tío Juan + Doctor  → BUSINESS, ASSOCIATED_WITH
Abuela + Costco    → BUSINESS, OWNS/VISITS
```

Never create a single entity named "Abuela's House" without also linking Abuela as a character.

## Household intelligence

Rooms detected by keyword (`Family Kitchen`, `Bathroom in Home`) receive:

- `spatial_category: ROOM`
- `parent_location_id` → nearest household (family home, city-named home)
- Hidden from Places Book top-level grid

Household detail (future drill-down) shows: Residents, Rooms, Family Members, Memories, Events.

## Event vs location

Keywords: show, concert, festival, party, anniversary, graduation, birthday, meetup, gathering.

```
Club Metro Anniversary  → EVENT, linked_venue_name: Club Metro
Goth Show by Metro      → EVENT, linked_venue_name: Club Metro
```

## Venue normalization

`canonicalVenueName()` strips event noise:

- "Club Metro Anniversary" → "Club Metro"
- "Goth Show by Metro" → "Metro" / "Club Metro" (alias merge)

`placeDuplicateScore()` provides merge confidence 0–1.
