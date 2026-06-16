# Episode Schema Report

Date: 2026-06-16 · Minimal provenance-first schema for `episodeSegmentationCore` output.

## Design principles

1. **Evidence required** — no row without `source_message_ids`
2. **Single table** — junction tables deferred; UUID arrays carry provenance in v1
3. **Thread-scoped** — `source_thread_id` matches `conversation_sessions.id` / `chat_messages.session_id`
4. **Idempotent re-segment** — delete + insert per thread on each run (boundaries may shift as messages accumulate)

## Table: `episodes`

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | Stable episode reference |
| `user_id` | uuid FK → auth.users | RLS owner scope |
| `source_thread_id` | uuid | Thread the episode belongs to |
| `episode_index` | int ≥ 0 | Order within thread (from core `index`) |
| `title` | text | Deterministic label (location · people · boundary) |
| `start_at` / `end_at` | timestamptz | From first/last message in segment |
| `boundary_reason` | text | Core signal (`thread-start`, `time-gap(6h)+entity-shift`, …) |
| `source_message_ids` | uuid[] | **Required evidence** — chat message IDs |
| `source_entity_ids` | uuid[] | Resolved participants mentioned in segment |
| `source_location_ids` | uuid[] | Resolved locations mentioned in segment |
| `source_event_ids` | uuid[] | `resolved_events` overlapping time + participants |
| `participant_ids` | uuid[] | Denormalized copy of segment participants |
| `location_ids` | uuid[] | Denormalized copy of segment locations |
| `created_at` / `updated_at` | timestamptz | Audit |

### Constraints

```sql
UNIQUE (user_id, source_thread_id, episode_index)
CHECK (cardinality(source_message_ids) > 0)
CHECK (end_at >= start_at)
```

### Indexes

| Index | Columns | Use |
|---|---|---|
| `episodes_user_thread_idx` | `(user_id, source_thread_id, episode_index)` | Thread episode list |
| `episodes_user_time_idx` | `(user_id, start_at DESC)` | Cross-thread timeline queries |
| `episodes_source_messages_gin` | GIN(`source_message_ids`) | Message → episode lookup |

### RLS

Owner-only SELECT/INSERT/UPDATE/DELETE for `authenticated` role (same pattern as `entity_conversation_links`).

## Provenance links (Phase 5)

| Field | Source |
|---|---|
| `source_message_ids` | `chat_messages.id` from `loadThreadMessages` |
| `source_thread_id` | `conversation_sessions.id` passed to segmentation |
| `source_entity_ids` | Union of `metadata.entity_ids` across segment messages |
| `source_location_ids` | Union of `metadata.location_ids` across segment messages |
| `source_event_ids` | `resolved_events` where `start_time ∈ [start_at, end_at]` and `people && participant_ids` |

**No synthetic episodes:** rows with empty `source_message_ids` are rejected at insert time.

## Deferred junction tables

Examples from the sprint brief (`episode_entities`, `episode_relationships`, `episode_events`) are **not created in v1**. Arrays on `episodes` are sufficient for activation and validation. Junction tables become useful when:

- Episode ↔ relationship graph queries need indexed joins
- Partial episode updates (without full re-segment) are required
- UI needs paginated entity/event drill-down per episode

## Message metadata contract

`chat_messages.metadata` gains (written at ingest):

```json
{
  "entity_ids": ["uuid", "..."],
  "location_ids": ["uuid", "..."]
}
```

Populated from `omegaMemoryService.resolveEntities` output in `ingestFromChatMessage`.

## Thread metadata contract

`conversation_sessions.metadata.threadMeta.episodes` stores **human-readable titles** (strings), synced via `replaceEpisodes` after each segmentation run. Active episode UUID available on `ThreadTurn.episodeId` for future deep links.
