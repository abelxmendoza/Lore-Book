# Group Resolution Report

## Principles

- **Never auto-merge** — all consolidation is user-confirmed
- Review via existing `GroupMergePanel` + enhanced merge suggestions

## Duplicate detection

Three signals:

1. **Exact name** — normalized name match
2. **Overlap score** — `groupDuplicateScore()` ≥ 0.65
3. **Member overlap** — `organizationMergeService.findDuplicates()` (existing)

## Merge suggestions API

```
GET /api/organizations/merge-suggestions
```

Returns:

- sourceId / targetId
- confidence (0–1)
- reason (same group, overlap candidate)
- evidence (category comparison)

## Misclassification resolution

Normalization fixes without merging:

| Issue | Fix |
| --- | --- |
| Household stored as family | `group_type: household`, nest under family |
| Community stored as company | `social_category: COMMUNITY` |
| Event group as standing org | `group_type: event_group`, hidden from All tab |

## Review workflow

1. Open Organizations Book → merge panel
2. Review suggested clusters (name + confidence)
3. Pick survivor org
4. Confirm merge → `POST /api/organizations/merge`
5. Aliases preserved on survivor

## Company resolution

Amazon / Kforce remain distinct companies even if both are employers — merge only on exact alias (e.g. "AMZN" vs "Amazon").

Kforce subcategory `STAFFING` distinguishes recruiters/placements from product employers.
