# Sprint AL — Reality Gap Closure (Phase 1)

## Goal

Make real accounts feel as intelligent as demo accounts by **generating, scoring, and persisting** intelligence data — not by adding UI first.

## AL-1 — Character Importance Engine

**Service:** `apps/server/src/services/characters/characterImportanceService.ts`

Deterministic scoring (no LLM):

| Input | Weight |
|---|---|
| Mentions | up to 25 pts |
| Distinct memories | up to 20 pts |
| Distinct events / timeline | up to 25 pts |
| Relationships + type weight | up to 20 pts |
| Recency | up to 10 pts |
| Family bonus | +15 pts |

**Levels:** `legendary` (80+) · `major` (60+) · `supporting` (40+) · `minor` (20+) · `background`

Persisted to `characters.importance_score` and `characters.importance_level`.

**Backfill:** `pnpm tsx scripts/backfill-character-importance.ts --user <email>`

## AL-2 — Event Significance Engine

**Service:** `apps/server/src/services/events/eventSignificanceService.ts`

Signals: people, locations, source units, emotional intensity, impacts, life-change indicators, explicit meaning phrases.

Persisted to `resolved_events.significance_score` (0–100) and `significance_level`.

**Migration:** `supabase/migrations/20260615180000_al_reality_gap_columns.sql`

**Backfill:** `pnpm tsx scripts/backfill-event-significance.ts --user <email>`

## AL-3 — Relationship Scoring Engine

**Service:** `apps/server/src/services/relationships/relationshipScoringService.ts`

Wraps Sprint AD `romanticRelationshipScoring` — replaces 0.5 defaults with evidence-based scores and green/red flags.

Already wired in ingestion pipeline; backfill for existing rows:

**Backfill:** `pnpm tsx scripts/backfill-relationship-scores.ts --user <email>`

## AL-4 — Meaning Generation Engine

**Service:** `apps/server/src/services/meaning/eventMeaningService.ts`

Generates (confidence ≥ 0.5 only):

- `meaning_summary`
- `identity_impact`
- `life_lesson`
- `chapter_relevance`

Persisted to `event_meaning_cache` table.

Example: Costco + Abuela → *"The important part was not shopping… Abuela was still alive and present."*

## AL-5 — Character Biography Builder

**Service:** `apps/server/src/services/characters/characterBiographyService.ts`

Cached in `characters.metadata.al_biography`:

- `role_in_story` · `first_seen` · `last_seen`
- `major_moments` · `relationship_summary` · `narrative_summary`

Examples: Abuela → Family anchor. Kelly → Onboarding contact. Ashley → Metro chapter.

## AL-6 — Intelligence Health Dashboard

**Extended:** `GET /api/diagnostics/intelligence-health`

New `al_coverage` block:

- `character_importance_coverage_pct`
- `event_significance_coverage_pct`
- `relationship_scoring_coverage_pct`
- `meaning_generation_coverage_pct`
- `character_biography_coverage_pct`

**Helper:** `apps/server/src/services/diagnostics/intelligenceHealthCoverage.ts`

## AL-7 — Ingestion hooks

After event assembly (`ingestionPipelineClass.ts`), fire-and-forget:

1. Event significance scoring
2. Event meaning generation
3. Character importance scoring
4. Character biography build

## API fix

`GET /api/characters/list` now returns `importance_level` and `importance_score` (Sprint AJ gap).

## Tests

| File | Service |
|---|---|
| `characterImportance.test.ts` | AL-1 |
| `eventSignificance.test.ts` | AL-2 |
| `relationshipScoring.test.ts` | AL-3 |
| `eventMeaning.test.ts` | AL-4 |
| `characterBiography.test.ts` | AL-5 |

All core scoring is **deterministic — no LLM required**.

## Deploy checklist

1. `supabase db push` — applies `20260615180000_al_reality_gap_columns.sql`
2. Run backfills for existing users (importance → significance → relationships)
3. Check `GET /api/diagnostics/intelligence-health` for coverage percentages
