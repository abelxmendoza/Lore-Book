# Temporal Intelligence Audit (Phase 1)

## Problem

LoreBook conflated **when something happened** with **when it was written down**, causing:
- "What did I do today?" returning old events
- Timelines sorted by `created_at` / `timestamp` (backfilled from ingestion)
- Future-dated LLM extraction defaults polluting arcs/episodes

## Canonical model

| Field | Meaning |
|-------|---------|
| `date` / `start_time` / `event_date` | **Event occurred at** (authoritative for retrieval) |
| `created_at` / `updated_at` | Ingestion / record lifecycle |
| `time_precision` / `time_confidence` | How sure we are about occurrence time |

## Query types (WMA)

`TODAY_QUERY`, `YESTERDAY_QUERY`, `THIS_WEEK_QUERY`, `THIS_MONTH_QUERY`, `TIME_RANGE_QUERY`, `TEMPORAL_COMPARISON_QUERY`, `TIMELINE_QUERY`

Resolved via `temporalQueryService.ts` + `temporalAnchorResolver.ts`.

## Retrieval rules (temporal intents)

- Filter `journal_entries.date`, `resolved_events.start_time`, `character_timeline_events.event_date`
- Exclude biography, goals, skills, identity summaries unless modified in window
- Chat messages filtered by `created_at` (conversation time) when in temporal window

## Fixes shipped

1. `memoryRetriever.ts` — fallback order uses `date` not `timestamp`
2. `workingMemoryAssembler.ts` — temporal intents + window filters
3. `temporalQueryService.ts` — classification + `occurredInWindow`
4. Migration `20260617120000_temporal_timestamp_backfill.sql` — sync `timestamp` ← `date`

## Remaining (Phases 6–8)

- Wire user timezone in `timeEngine` middleware
- Clamp future dates at extraction (`eventExtractionService`, `ingestionPipelineClass`)
- Arc/episode synthesis: use min/max source event times, not `last_seen_at` alone
- Validation audit script for the 8 golden temporal questions
