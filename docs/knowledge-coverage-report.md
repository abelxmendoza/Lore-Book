# Knowledge Coverage Report

**Sprint:** Knowledge Coverage & Trust Center  
**Date:** 2026-06-17

## Summary

LoreBook now computes **coverage_score** (0–100) for each of 10 domains and exposes aggregate **overall_coverage_score** on the Trust Center.

## Domain scoring logic

### Characters
Highest-weight domain. Score blends entity-to-fact ratio with a baseline floor. Archived characters tracked separately in `states.archived`.

**State rules:**
- `known` — ≥2 facts and coverage ≥50%
- `suggested` — zero facts, zero coverage (mentioned, thin profile)
- `conflicted` — duplicate normalized name
- `unverified` — default for partial evidence
- `archived` — `status = archived`

### Locations
- `known` — ≥1 location fact
- `unverified` — place exists, no facts

### Projects
- `known` — active project row
- `suggested` — `project_suggestions` with `status_row = pending`
- `archived` — `status = abandoned`

### Skills
- `known` — skill row
- `suggested` — `skill_suggestions` pending

### Events
- `known` — `resolved_events`
- `suggested` — `event_candidates`

### Organizations, Goals, Communities, Households
Default `known` for persisted rows. Households filtered from family orgs with household metadata or name heuristics.

### Relationships
Each romantic or character relationship edge counts as `known`.

## Book header examples (Phase 6)

```
Characters: 142 total · 15 suggested · 4 conflicts · 71% coverage
Projects: 8 total · 3 suggested · 80% coverage
Places: 24 total · 6 unverified · 45% coverage
Skills: 12 total · 2 suggested · 58% coverage
```

Rendered by `BookTrustSummary` → links to `/trust`.

## Confidence aggregation

`confidence.average` = mean of per-domain `coverage_score` values.

Per-domain `confidence_distribution` buckets entity counts by score tier (see [knowledge-coverage-audit.md](./knowledge-coverage-audit.md)).

## Gaps & limitations

1. Coverage heuristics are **estimates**, not ML confidence — they prioritize explainability.
2. Character suggestions computed on-the-fly in Character Book are not yet folded into state counts unless persisted.
3. Timeline void detection is listed in unknown kinds but not fully wired to chronology gaps yet.

## Verification

```bash
# Server tests
npm run test --workspace=apps/server -- tests/routes/trust.test.ts
```

Live: open `/trust` or `GET /api/trust/overview` when logged in.
