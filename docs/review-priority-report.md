# Review Priority Report

**Sprint:** Knowledge Coverage & Trust Center — Phase 5  
**Service:** `apps/server/src/services/trust/reviewPriorityService.ts`

## Purpose

Rank what the user should review **next**: conflicts first, then authority decisions, then high-priority unknowns, then suggested entities.

## Inputs

1. `unknowns[]` from `unknownDetectionService`
2. `classified[]` entity rows from `knowledgeStateService`
3. Contradiction engine report
4. Active contradiction alerts
5. Pending `entity_authority_decisions` (`applied = false`)

## Output channels

| Channel | Max items | Contents |
|---------|-----------|----------|
| `conflicts` | 30 | Contradictions, alerts, duplicate entities |
| `review_queue` | 40 | Authority, unknowns, suggested entities |

Both sorted by `priority` descending.

## Domain weights

Higher-weight domains bubble up in suggested-entity and conflict tie-breaks:

| Domain | Weight |
|--------|--------|
| characters | 100 |
| relationships | 95 |
| projects | 80 |
| locations | 75 |
| events | 70 |
| organizations | 65 |
| goals | 60 |
| skills | 55 |
| households | 50 |
| communities | 45 |

## Priority bands

| Source | Base priority | Notes |
|--------|---------------|-------|
| Contradiction (high severity) | 100 | `contradictionEngine.getReport` |
| Contradiction (medium) | 95 | |
| Contradiction alert | 85 | `contradictionAlertService` |
| Entity authority pending | 88 | `entity_authority_decisions` |
| Duplicate entity (conflicted state) | 80 + domain×0.1 | Same-name characters |
| Unknown gaps | gap.priority | Top 25 unknowns |
| Suggested entities | 60 + domain×0.2 | Top 15 suggested |

## Review item actions

| action | Meaning |
|--------|---------|
| `review_contradiction` | Open contradiction flow |
| `review_alert` | Belief vs behavior alert |
| `merge_or_dismiss` | Duplicate entity resolution |
| `entity_authority` | Authority decision apply/dismiss |
| `fill_gap` | Chat prompt to fill unknown |
| `confirm_or_reject` | Promote or dismiss suggestion |

## Founder validation examples

| Item | Channel | Why ranked high |
|------|---------|-----------------|
| Duplicate relationship edges | conflicts | Same partners linked twice |
| Tío Ray (unknown) | review_queue | High-priority person gap |
| Pending authority merge | review_queue | User/system disagreement |
| Suggested new contact | review_queue | Awaiting confirmation |
| Abuela | — | Known — should not appear |
| LoreBook project | — | Known — should not appear |

## API

```
GET /api/trust/review-queue
GET /api/trust/overview  # includes conflicts + review_queue
```

## UI

Trust Center **Review next** panel shows top 8 `review_queue` items with "Tell LoreBook" → `/chat`.

## Dependencies

- `contradictionEngine` — must not throw (caught, empty fallback)
- `entity_authority_decisions` table — optional; empty if migration not applied
