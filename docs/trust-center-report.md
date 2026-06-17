# Trust Center Report

**Sprint:** Knowledge Coverage & Trust Center  
**Date:** 2026-06-17

## Mission

Users could not easily answer:

- What does LoreBook know?
- What is it unsure about?
- What should I review next?
- What information is missing?

The Trust Center centralizes epistemic honesty across all Books.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GET /api/trust/overview                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 knowledgeCoverage    knowledgeState      unknownDetection
    Service               Service               Service
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    reviewPriorityService
                              │
                              ▼
                     trustCenterService
```

## Phases delivered

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Per-domain coverage audit (10 domains) | ✅ `knowledgeCoverageService.ts` |
| 2 | Knowledge states (known/suggested/unverified/conflicted/archived) | ✅ `knowledgeStateService.ts` |
| 3 | `GET /api/trust/overview` | ✅ `routes/trust.ts` |
| 4 | Unknown detection (gaps, omega entities, missing relationships) | ✅ `unknownDetectionService.ts` |
| 5 | Review priority engine | ✅ `reviewPriorityService.ts` |
| 6 | Book integration (coverage line in headers) | ✅ `BookTrustSummary.tsx` |
| 7 | Founder validation + docs | ✅ This doc set |

## API surface

| Endpoint | Purpose |
|----------|---------|
| `GET /api/trust/overview` | Full dashboard: coverage, confidence, unknowns, conflicts, review_queue |
| `GET /api/trust/domains` | All domain summaries |
| `GET /api/trust/domains/:domain` | Single Book trust summary (used by Book headers) |
| `GET /api/trust/review-queue` | Prioritized review items + conflicts |
| `GET /api/trust/unknowns` | Gap detection only |

Auth: required (`requireAuth`). Registered as `CORE_RUNTIME` in `routeRegistry.ts`.

## Frontend

| Route | Component |
|-------|-----------|
| `/gaps` | `KnowledgeGapDashboard` — trust coverage panel + timeline voids |
| `/trust` | Redirects to `/gaps` |
| Book headers | `BookTrustSummary` — compact line linking to Knowledge Gaps |

Trust coverage is embedded in Knowledge Gaps (not a standalone page). `TrustCoveragePanel` renders the full rollup; `BookTrustSummary` shows per-domain coverage in Characters, Locations, Projects, and Skills books.

## Response shape (`TrustOverview`)

```json
{
  "generated_at": "ISO-8601",
  "overall_coverage_score": 62,
  "coverage": [{ "domain": "characters", "entity_count": 142, "coverage_score": 71, "states": { ... } }],
  "confidence": { "average": 62, "distribution": { "high": 0, "medium": 0, "low": 0, "none": 0 } },
  "unknowns": [{ "label": "Tío Ray", "prompt": "...", "priority": 85 }],
  "conflicts": [{ "title": "Duplicate name", "priority": 88 }],
  "review_queue": [{ "title": "...", "action": "fill_gap" }],
  "state_totals": { "known": 120, "suggested": 15, "unverified": 3, "conflicted": 4, "archived": 0 }
}
```

## Success criteria

Users can answer the four mission questions from a single surface without digging through multiple Books.

## Related docs

- [knowledge-coverage-audit.md](./knowledge-coverage-audit.md)
- [knowledge-coverage-report.md](./knowledge-coverage-report.md)
- [unknown-detection-report.md](./unknown-detection-report.md)
- [review-priority-report.md](./review-priority-report.md)
