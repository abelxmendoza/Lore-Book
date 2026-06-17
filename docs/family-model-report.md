# Family Model Report

## Structure

```
My Family (FAMILY)
├── Members: Mom, Abuela, Tío Juan, Tío Ralph, Leslie
├── Family Tree (FamilyTreePanel)
├── Households
│   ├── Anaheim Family Home
│   ├── Tía Grace Household
│   └── Abuela Household
├── Events (derived + organization_events)
└── Relationships (organization_relationships)
```

## Key rules

1. **Family ≠ Household** — "My Family" is the kinship root; dwellings are `HOUSEHOLD` with `parent_group_id`.
2. **People belong to families** via `organization_members`.
3. **People live in households** via location links + possessive metadata.
4. **Tía Grace Household** nests under My Family, never competes as a second family card.

## Normalization

`organizationNormalizationService`:

- Classifies `My Family` → `social_category: FAMILY`, `group_type: family`
- Classifies `* Household` / `* Family Home` → `HOUSEHOLD`, sets `parent_group_id` to nearest family
- Fixes misclassifications where household was stored as `group_type: family`

## UI

`GroupDetailPanel` in Organization detail modal shows:

- Members grid
- Nested household chips (click to open household modal)
- Family tree shortcut

Organizations Book tabs: **Families** | **Households**
