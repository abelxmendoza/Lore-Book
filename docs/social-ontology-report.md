# Social Ontology Report

## Canonical hierarchy

```
GROUP
├── Organization
│   ├── Company
│   ├── Nonprofit
│   ├── Government
│   └── Institution
├── Community
│   ├── Scene
│   ├── Club
│   ├── Interest Group
│   └── Online Community
├── Family
│   ├── Family
│   └── Household
├── Team
├── Band
└── Friend Group
```

## Persistence

Migration `20260617130000_social_group_ontology.sql`:

| Field | Column | Example |
| --- | --- | --- |
| rootType | `root_type` | GROUP |
| category | `social_category` | FAMILY, HOUSEHOLD, COMPANY |
| subcategory | `social_subcategory` | STAFFING, BOOTCAMP, GOTH_SCENE |
| parent | `parent_group_id` | household → family UUID |

Extended `group_type` CHECK: `household`, `team`, `project`, `event_group`.

## Classifier

`apps/server/src/services/ontology/groupIntelligence.ts`

Pipeline:

1. Known entities (Amazon, Los Goths)
2. Possessive household (`Tía Grace Household`)
3. Family vs household disambiguation
4. Institution / company / community / band / team keywords
5. Stored `group_type` fallback

## API

```
GET  /api/organizations/audit
POST /api/organizations/normalize
GET  /api/organizations/merge-suggestions
GET  /api/organizations?normalize=true
```

## UI taxonomy

`apps/web/src/lib/groupTaxonomy.ts` mirrors server classification for:

- Category tabs (Companies, Communities, Families, Households, Teams)
- `isTopLevelGroup()` — hides event groups from All
- `computeChildHouseholds()` — family drill-down
