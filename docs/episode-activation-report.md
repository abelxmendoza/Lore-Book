# Episode Activation Report

Date: 2026-06-16 · **Activation complete** — `episodeSegmentationCore` is live in production via lazy background segmentation.

## Mission outcome

| Goal | Status |
|---|---|
| Activate existing `episodeSegmentationCore` | ✅ Wired through `episodePersistenceService` |
| No new segmentation architecture | ✅ Pure core unchanged |
| Episodes persisted with provenance | ✅ `episodes` table + CHECK on `source_message_ids` |
| Thread intelligence consumes episodes | ✅ `threadMeta.episodes` populated via `replaceEpisodes` |
| Non-blocking chat | ✅ `episodeSegmentationTrigger` debounced per thread |

## Phase 1 — Readiness audit

### Inputs (`episodeSegmentationCore`)

- Chronological `SegMessage[]`: `id`, `role`, `content`, `created_at`
- Optional per-message `entityIds`, `locationIds` (from `chat_messages.metadata`)
- Tunable options: `timeGapMs` (6h default), `entityShiftThreshold`, `boundaryThreshold`

### Outputs

- `Episode[]`: `index`, `messageIds`, `participants`, `locations`, `startAt`, `endAt`, `boundaryReason`

### Dependencies

| Dependency | Role |
|---|---|
| `chat_messages` | Canonical message source (`loadThreadMessages`) |
| Entity resolution at ingest | Supplies `metadata.entity_ids` / `metadata.location_ids` |
| `resolved_events` | Linked into `source_event_ids` by time + participant overlap |
| `conversation_sessions.metadata.threadMeta` | Episode labels for continuity card |

### What blocked activation (resolved)

1. **No `episodes` table** → migration `20260616180000_episodes.sql`
2. **No pipeline caller** → `episodeSegmentationTrigger.schedule()` after ingest
3. **Entity IDs discarded** → persisted on `chat_messages.metadata` post-resolution
4. **`threadMeta.episodes` empty** → bulk sync after segmentation run

## Phase 3 — Pipeline activation

```
chat_messages
    ↓ loadThreadMessages + metadata.entity_ids/location_ids
episodeSegmentationCore.segmentEpisodes()
    ↓
episodePersistenceService.persistEpisodesForThread()
    ↓
episodes table + threadIntelligence.updateOnMessage(replaceEpisodes)
```

**Trigger:** `episodeSegmentationTrigger.schedule(userId, threadId)` from `ingestFromChatMessage` (mirrors `graphRecoveryTrigger`).

**Throttle:** 15s debounce, 5min cooldown per `(userId, threadId)`. Env: `EPISODE_SEGMENTATION_LIVE=0` to disable.

## Phase 4 — Thread intelligence

- `ThreadTurn.replaceEpisodes` replaces `threadMeta.episodes` with human-readable titles
- `ThreadTurn.episodeId` stores active episode UUID for future linking
- Continuity card "Recent events" now shows real episode titles (not synthetic labels)

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/20260616180000_episodes.sql` | New table |
| `episodePersistenceService.ts` | Load → segment → persist |
| `episodeSegmentationTrigger.ts` | Debounced background runner |
| `ingestionPipelineClass.ts` | Entity metadata + trigger schedule |
| `threadIntelligenceService.ts` | `replaceEpisodes`, `episodeLabel` |
| `scripts/episodeActivationAudit.ts` | Validation harness |

## Validation

```bash
# Apply migration first, then:
EPISODE_USER_ID=<your-user-uuid> \
  npx tsx apps/server/scripts/episodeActivationAudit.ts
```

See `docs/episode-quality-report.md` for measured coverage after running the audit.

## Success criteria

- ✅ Episodes generated from real messages
- ✅ Every episode has `source_message_ids` (DB constraint)
- ✅ Thread intelligence consumes episode output
- ✅ No new segmentation system — core activated as-is
