# Episode Readiness Report

Date: 2026-06-16 · Audit only — **do not implement**. What it would take to activate `episodeSegmentationCore`, the minimum viable path.

## What already exists (ready)
| Piece | State |
|---|---|
| `episodeSegmentationCore.segmentEpisodes(messages, opts)` | **Built, pure, tested.** Deterministic boundary scoring: time-gap (6h), entity-shift (Jaccard), location-shift, topic-shift. Returns `Episode[]` with `messageIds`, `participants`, `locations`, `startAt/endAt`, `boundaryReason`. **No changes needed.** |
| `boundaryScore()` | exported, unit-tested |
| `ThreadIntelligence.episodes` + `updateOnMessage(turn.episodeId)` | **Consumer slot already wired** — accepts an episode id, currently never fed |
| Resolved entity/location IDs at ingest | The pipeline already resolves entities per message (`resolvedEntities`) — currently **discarded** after thread-meta collection |
| `buildContinuityCard` "Recent events" | renders `meta.episodes` (currently empty) |

## What is missing (the activation gap)
| Gap | Work | Size |
|---|---|---|
| **`episodes` table** | immutable scene log: `id, user_id, thread_id (ON DELETE SET NULL), message_ids[], participant_ids[], location_ids[], start_at, end_at, boundary_reason, title?, summary?` | 1 migration |
| **Pipeline step 12.9** | after entity resolution, build `SegMessage[]` (message id/role/content/created_at + resolved `entityIds`/`locationIds`) for the thread's open tail, call `segmentEpisodes`, upsert closed episodes, pass active `episodeId` → `threadIntelligence.updateOnMessage` | moderate |
| **Feed `entityIds`/`locationIds`** | the pipeline resolves these but doesn't carry them per-message into the SegMessage shape — thread them through instead of discarding | small |
| **(optional) LLM titling** | `boundary_reason` is enough to ship; human titles ("Costco With Abuela") can come later | deferrable |

## Minimum viable activation (smallest shippable)
1. Create the `episodes` table.
2. Add the post-message segmentation step (debounced/lazy on the open tail — segment only since the last boundary, not the whole thread each turn).
3. Carry per-message resolved `entityIds`/`locationIds` into `SegMessage`.
4. Pass `episodeId` into the existing `threadIntelligence.updateOnMessage`.

That alone populates `threadMeta.episodes` and the continuity card's "Recent events" — **no new UI required** and no timeline rework. Titling + a Life Log "Moments" browse come later.

## Integration notes / risks
- **Timeline is event-based, not episode-based today.** Episodes and `resolved_events` are different grains — episodes can later become the *anchor* for events, but activation should NOT try to reconcile them in v1. Ship episodes as an additive layer; leave timeline reading from events.
- **Segment lazily** (on thread idle or every N turns), not per message — a single message has no lookahead; the core needs a window to place boundaries well. Reuse the `graphRecoveryTrigger` debounce pattern.
- **Cost:** segmentation is pure/in-memory (no LLM unless titling) → cheap. The only DB cost is the upsert + reading the thread tail.

## Estimate
**Minimum activation ≈ 1 migration + 1 pipeline step + small plumbing** — no new services, no UI, no LLM. The core has been "dead" only for lack of a table and a 20-line wiring step. This is the lowest-effort path to making `episodeSegmentationCore` a KEEP that actually runs.
