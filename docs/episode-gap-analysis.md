# Episode Gap Analysis

**Date:** 2026-06-17  
**Scope:** 51 episodes across founder (48) + developer (3) accounts  
**Source:** `episodeQualityValidation.ts` Phase 5 + Phase 1 coverage logs

---

## Executive Summary

Episode segmentation **works mechanically** but has five structural gaps blocking reconstruction lift:

1. **Missing entity links** — 0% coverage (P0)
2. **Missing event links** — 87% of multi-message episodes lack events (P0)
3. **Thread coverage gap** — 71% of founder threads produce zero episodes (P1)
4. **Duplicate titles** — 11 groups, 94% of quality sample flagged (P1)
5. **Over-segmentation** — 7 single-message non-thread-start episodes (P2)

No under-segmentation detected (0 episodes >40 messages).

---

## Gap 1 — Missing Entity Links

| Metric | Value |
|--------|-------|
| Episodes with ≥1 entity | **0 / 51 (0%)** |
| Episodes with ≥3 messages, zero entities | **35** |
| Avg entities per episode | 0.0 |

### Root cause

`episodeSegmentationCore` reads `entity_ids` from `chat_messages`. Entity resolution runs in **shadow mode** — IDs are not written back to historical messages. Segmentation therefore produces episodes with message evidence but no participant graph.

### Evidence

All 50 quality-sample episodes show `entityCount: 0` despite 7–26 messages per episode.

### Fix (no new architecture)

- Promote entity resolution from shadow → write on ingest
- Backfill `chat_messages.entity_ids` for founder/developer threads
- Re-run `episodeSegmentationTrigger.runNow()` to refresh `source_entity_ids`

### Success metric

`entityCoveragePct` ≥ 50% on next validation run.

---

## Gap 2 — Missing Event Links

| Metric | Value |
|--------|-------|
| Founder event coverage | 13% |
| Developer event coverage | 0% |
| Episodes with ≥5 messages, zero events | **21** |

### Root cause

`source_event_ids` populated only when events are recoverable from message window at segmentation time. Event recovery is live globally but not consistently invoked per-thread before episode persistence.

### Fix

- Ensure `episodePersistenceService` calls event recovery for episode message windows
- Map recovered event IDs into `source_event_ids` on insert

### Success metric

`eventCoveragePct` ≥ 40% founder; avg events/episode ≥ 0.5.

---

## Gap 3 — Missing Episode Boundaries (Thread Coverage)

### Threads with messages but zero episodes

Founder: **37 / 52 threads (71%)** returned `episodeCount: 0` despite non-zero message counts.

| Example thread sizes with 0 episodes | Messages |
|----------------------------------------|----------|
| Multiple dev/test threads | 14–33 |
| Short exchanges | 4–11 |

### Likely causes

1. **Insufficient boundary signals** — no time gap, entity shift, or topic shift detected; entire thread may not meet minimum segmentation criteria
2. **Missing entity_ids on messages** — entity-shift boundary detector never fires
3. **Threads below evidence threshold** — segmentation may require minimum message count + boundary

### Over-segmentation (inverse problem)

| Metric | Value |
|--------|-------|
| Single-message episodes (non-thread-start) | **7** |
| Examples | `10h gap · topic-shift`, `22h gap · topic-shift`, `7h gap · topic-shift` |

Time-gap alone creates 1-message episodes when the gap falls between two sparse messages — acceptable for provenance but noisy for continuity.

### Under-segmentation

| Metric | Value |
|--------|-------|
| Episodes with >40 messages | **0** |

Largest episodes: 26 messages — boundary detection splits long threads adequately when episodes are created.

---

## Gap 4 — Missing Relationship Links

| Metric | Value |
|--------|-------|
| Avg relationships per episode | 0.0 |
| Multi-entity episodes with no relationship | 0 (N/A — no multi-entity episodes) |

Relationships cannot link until entity IDs exist on episodes. This gap is **downstream of Gap 1**.

### Expected after entity fix

Episodes with ≥2 participants should resolve relationships via `character_relationships` where edges exist. Re-measure `episodesWithMultiEntityNoRelationship`.

---

## Gap 5 — Duplicate / Generic Titles

| Metric | Value |
|--------|-------|
| Duplicate title groups | **11** |
| Duplicate rate in 50-episode sample | **94%** |

### Top duplicate groups

| Title | Count |
|-------|-------|
| 33h gap · topic-shift | 4 |
| 76h gap · topic-shift | 3 |
| 14h gap · topic-shift | 3 |
| 15h gap · topic-shift | 3 |
| 29h gap · topic-shift | 3 |

### Impact

- Continuity cards list indistinguishable episode labels
- WMA cannot disambiguate scenes by participant
- User-facing thread intelligence shows generic "Recent events: 176h gap · topic-shift"

### Fix

`buildEpisodeTitle()` should prefer participant names when `source_entity_ids` present; append gap reason as suffix only.

---

## Gap 6 — Thread Intelligence Gaps

| Feature | Founder | Developer |
|---------|---------|-------------|
| `threadMeta.episodes` | 29% | 14% |
| Summaries | 12% | 0% |
| Open loops | 0% | 0% |
| Continuity cards | 37% | 14% |

Episodes in metadata without summaries or open loops produce thin continuity cards — explains thread continuity regression (−14).

---

## Prioritized backlog

| ID | Gap | Severity | Effort | Owner sprint |
|----|-----|----------|--------|--------------|
| G1 | Entity IDs on messages | P0 | Medium | Entity resolution promotion |
| G2 | Event IDs on episodes | P0 | Low | Episode persistence wiring |
| G3 | Thread coverage (0-episode threads) | P1 | Medium | Segmentation threshold audit |
| G4 | Duplicate titles | P1 | Low | Title builder |
| G5 | Over-segmentation (1-msg gaps) | P2 | Low | Boundary tuning |
| G6 | Summary/open-loop backfill | P2 | Medium | Thread intelligence |

---

## Validation checklist (next run)

- [ ] `entityCoveragePct` > 50%
- [ ] `eventCoveragePct` > 40%
- [ ] Founder threads with episodes > 60%
- [ ] Duplicate title rate < 30%
- [ ] Overall reconstruction Δ ≥ +3
- [ ] Thread continuity Δ ≥ +5

```bash
npx tsx apps/server/scripts/episodeQualityValidation.ts
```
