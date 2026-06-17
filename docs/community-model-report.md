# Community Model Report

## Example: Los Goths

```
Los Goths (COMMUNITY / SCENE)
├── Members — goth scene participants
├── Venues — Club Metro, First Street Pool, Gothicumbia
├── Events — shows, anniversaries, gatherings
├── Relationships — affiliated groups, rivals
└── Locations — organization_locations + metadata.linked_venue_names
```

## vs Company / Organization

Communities are **participatory social circles**, not employers:

| Signal | Community | Company |
| --- | --- | --- |
| Keywords | scene, goth, crew, community | corp, staffing, employer, amazon |
| Members | scene participants | employees, recruiters |
| Venues | clubs, pools, hangouts | offices |
| User relationship | member, adjacent | employee, alumnus |

## Normalization

- `Los Goths` → `social_category: COMMUNITY`, `group_type: community`
- Venue names seeded in `metadata.linked_venue_names`
- Organization locations table supplements venue list

## UI

`GroupDetailPanel` community section shows:

- Member list
- Venue chips
- Link to Locations tab for full detail

Organizations Book tab: **Communities**
