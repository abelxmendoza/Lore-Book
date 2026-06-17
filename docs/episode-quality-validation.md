# Episode Quality Validation

**Date:** 2026-06-17  
**Sprint:** Episode Quality & Reconstruction Validation  
**Script:** `apps/server/scripts/episodeQualityValidation.ts`  
**Accounts:** Founder (admin) + Developer (auth role lookup)

---

## Executive Summary

Episodes are **live in production** and segmenting real threads, but **quality is not yet strong enough to improve reconstruction**. Boundary detection and title heuristics work; entity and event linkage are effectively absent. Duplicate generic titles dominate the sample.

| Dimension | Score (0–100) | Verdict |
|-----------|---------------|---------|
| Title quality | **80** | Acceptable (time-gap labels) |
| Boundary quality | **83** | Good (time/topic shifts detected) |
| Entity quality | **35** | Poor — 0% entity coverage |
| Event quality | **47** | Weak — 13% event coverage (founder) |
| Confidence (composite) | **58** | Below target |
| Duplicate title rate | **94%** | Critical |

**Bottom line:** Episodes add structure to ~29% of founder threads but do not yet carry the entity/event provenance needed to lift reconstruction scores.

---

## Phase 1 — Episode Coverage

Measured by running `episodeSegmentationTrigger.runNow()` across all threads per account, then aggregating persisted rows.

### Founder account

| Metric | Value |
|--------|-------|
| Threads processed | 52 |
| Threads with episodes | 15 (29%) |
| Episode count | 48 |
| Avg messages / episode | 13.8 |
| Avg entities / episode | **0.0** |
| Avg events / episode | 0.29 |
| Avg relationships / episode | **0.0** |
| Entity coverage (% episodes with ≥1 entity) | **0%** |
| Event coverage (% episodes with ≥1 event) | **13%** |

### Developer account

| Metric | Value |
|--------|-------|
| Threads processed | 7 |
| Threads with episodes | 1 (14%) |
| Episode count | 3 |
| Avg messages / episode | 22.7 |
| Avg entities / episode | **0.0** |
| Avg events / episode | **0.0** |
| Entity coverage | **0%** |
| Event coverage | **0%** |

### Coverage interpretation

- **71% of founder threads produced zero episodes** despite having messages (e.g. 14–33 message threads with `episodeCount: 0`). Segmentation requires sufficient boundary signals; threads without time gaps or entity shifts may collapse or fail minimum evidence checks.
- **Entity linkage is the dominant coverage gap.** Zero episodes across both accounts carry `source_entity_ids`. This aligns with entity resolution running in shadow mode — `chat_messages.entity_ids` is not backfilled on historical messages.
- Event linkage is sparse (13% founder) — event recovery exists but is not wired into episode provenance at scale.

---

## Phase 2 — Episode Quality (50-episode sample)

Sample drawn from all persisted episodes (founder + developer), sorted by message count (largest episodes first).

### Average scores

| Metric | Score |
|--------|-------|
| Title | 80 |
| Boundary | 83 |
| Entity | 35 |
| Event | 47 |
| Confidence | 58 |
| Duplicate titles | 94% |

### Title patterns observed

| Pattern | Example | Score |
|---------|---------|-------|
| Time-gap + topic-shift | `33h gap · topic-shift` | 85 |
| Thread start | `Thread start` | 70 |
| Generic episode index | `Episode 3` | 35 |

Most high-message episodes use the same time-gap title template. **11 duplicate title groups** exist across 51 total episodes (e.g. `33h gap · topic-shift` × 4).

### Sample episodes (top by message count)

| Title | Msgs | Entities | Events | Boundary reason | Confidence |
|-------|------|----------|--------|-----------------|------------|
| 33h gap · topic-shift | 26 | 0 | 0 | time-gap(33h)+topic-shift | 54 |
| 76h gap · topic-shift | 8 | 0 | 0 | time-gap(76h)+topic-shift | 54 |
| 176h gap · topic-shift | 8 | 0 | 0 | time-gap(176h)+topic-shift | 64 |
| 14h gap · topic-shift | 7 | 0 | 0 | time-gap(14h)+topic-shift | 54 |

### Quality verdict

- **Boundaries:** Time-gap detection is reliable; no under-segmentation (>40 msgs) in sample.
- **Titles:** Descriptive enough for debugging, not human-meaningful for recall.
- **Entities/events:** Nearly all sampled episodes lack graph links — limits WMA episode retrieval value.

---

## Phase 4 — Thread Intelligence (embedded in validation)

| Metric | Founder | Developer |
|--------|---------|-------------|
| `threadMeta.episodes` rate | 29% | 14% |
| Avg episode labels / thread | 3.2 | 3.0 |
| Summary rate | 12% | 0% |
| Open-loop rate | 0% | 0% |
| Continuity card rate | 37% | 14% |

Continuity cards that include episodes show generic labels (`176h gap · topic-shift`) rather than participant names — consistent with zero entity linkage.

---

## Infrastructure note

During this sprint, the `episodes` table was confirmed missing from the production Supabase project used by the app (`.env` / `DATABASE_URL`). Migration `20260616180000_episodes.sql` was applied directly to production; the CLI-linked project (`mwtyck…`) is a separate database. Future migrations must target the app’s `DATABASE_URL`, not `--linked` alone.

---

## Recommendations (measurement-driven)

| Priority | Action | Expected impact |
|----------|--------|-----------------|
| P0 | Backfill `chat_messages.entity_ids` from entity resolution | Entity coverage 0% → 60%+ |
| P0 | Include participant names in episode titles when entities present | Title quality + recall |
| P1 | Dedupe title templates across threads (add thread context) | Duplicate rate 94% → <30% |
| P1 | Wire event recovery IDs into `source_event_ids` on segmentation | Event coverage 13% → 50%+ |
| P2 | Investigate threads with messages but zero episodes | Coverage 29% → 60%+ |

---

## Re-run

```bash
npx tsx apps/server/scripts/episodeQualityValidation.ts > /tmp/ep-val.json 2>/tmp/ep-val.log
```

Requires `OWNER_EMAIL` or admin auth user; developer resolved via `app_metadata.role === 'developer'`.
