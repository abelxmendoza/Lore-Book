# Episode Quality Report

Date: 2026-06-16 · Validation framework and expected coverage patterns.

## Measurement dimensions (Phase 6)

| Metric | Definition |
|---|---|
| Episodes created | Count of `episodes` rows per user/thread |
| Messages per episode | `avg(cardinality(source_message_ids))` |
| Entity coverage | % messages with `metadata.entity_ids` **or** % episodes with `participant_ids` |
| Event coverage | % episodes with non-empty `source_event_ids` |
| Relationship coverage | Indirect — via `source_entity_ids` overlap with relationship graph (not stored on episode row in v1) |

## Validation script

```bash
# Abel benchmark account (set EPISODE_USER_ID — never hardcode in repo)
EPISODE_USER_ID=<your-user-uuid> npx tsx apps/server/scripts/episodeActivationAudit.ts
```

**Prerequisite:** apply migration `20260616180000_episodes.sql`.

### Output shape

```json
{
  "userId": "...",
  "threadsProcessed": 42,
  "threadsWithEpisodes": 38,
  "totals": {
    "episodeCount": 156,
    "threadCount": 38,
    "avgMessagesPerEpisode": 4.2,
    "entityCoveragePct": 72,
    "eventCoveragePct": 41
  },
  "perThread": [ ... ]
}
```

## Expected patterns

### Abel benchmark (set `EPISODE_USER_ID` locally — do not commit UUIDs)

- **High message volume threads** → more episodes via time-gap boundaries (6h default)
- **Family/location threads** (Costco, Grandma Rose) → episodes with strong entity + location coverage
- **Technical threads** (LifeLedger) → topic-shift boundaries; fewer location IDs
- **Event coverage** depends on `resolved_events` recovery state — expect 30–60% until events are backfilled for older threads

### Developer account

- Smaller corpus → often 1 episode per thread (`thread-start` only)
- Entity coverage rises sharply after **new messages** post-activation (metadata backfill is forward-only on ingest)

## Coverage limitations (v1)

| Limitation | Impact | Mitigation path |
|---|---|---|
| Historical messages lack `entity_ids` metadata | Weaker entity-shift boundaries on old threads | Backfill script from `entity_conversation_links` (future) |
| Full re-segment replaces all episodes | Episode UUIDs change on re-run | Acceptable for v1; stable fingerprinting later |
| Event link is time + participant heuristic | May miss events without `people` array populated | Tighten when event recovery improves |
| No relationship IDs on episode row | Relationship coverage not directly measurable | Add `source_relationship_ids` when relationship ↔ message linking exists |

## Quality gates

| Gate | Target |
|---|---|
| Zero episodes without messages | 100% (enforced by CHECK) |
| Threads with ≥3 messages get segmentation | >95% after audit run |
| Continuity card shows episode titles | Visible when `replaceEpisodes` sync runs |
| Chat latency impact | 0ms (background trigger only) |

## Re-run cadence

Live path: debounced every 5min per active thread. Batch validation: run audit script after migration deploy or before trust scorecard updates.

**Note:** Run the audit locally against your Supabase instance to populate measured numbers in this document. Numbers below are structural expectations until a live run completes.

| Account | Episodes (est.) | Avg msgs/ep | Entity cov. | Event cov. |
|---|---|---|---|---|
| Abel benchmark | Run audit | 3–8 | 60–80% forward | 30–50% |
| Developer | Run audit | 1–3 | 40–70% forward | 10–30% |
