# Reconstruction Impact Report — Episodes

**Date:** 2026-06-17  
**Baseline:** `docs/trust-scorecard.md` (2026-06-15, pre-episode activation)  
**After:** Episode activation + first production backfill via validation sprint  
**Method:** Same scorecard dimensions as `lifeReconstructionScore.ts`, run inside `episodeQualityValidation.ts`

---

## Executive Summary

### Do episodes materially improve reconstruction quality today?

# **NO — not yet**

Episodes are persisted and appear in working memory for 86% of founder recall queries, but **core reconstruction dimensions are unchanged or regressed**. The episode layer adds structure without provenance (entities, events, relationships), so it cannot lift accuracy scores.

| Dimension | Before | After (Founder) | Δ |
|-----------|--------|-----------------|---|
| **Overall reconstruction** | 66 | 65 | **−1** |
| Memory accuracy | 32 | 32 | 0 |
| Entity accuracy | 18 | 18 | 0 |
| Relationship accuracy | 79 | 79 | 0 |
| Timeline accuracy | 100 | 100 | 0 |
| Recall accuracy | 100 | 100 | 0 |
| Thread continuity | 40 | 26 | **−14** |

**Developer account** (sparse data, 7 threads): overall **22** — not comparable to founder benchmark; included for coverage only.

---

## Phase 3 — Before / After Comparison

### Life reconstruction score (founder)

The composite score weights: memory 15%, entity 15%, relationship 25%, timeline 20%, recall 15%, thread continuity 10%.

```
Before:  66/100
After:   65/100  (Δ −1)
```

No dimension except thread continuity moved. Recall held at **7/7** benchmark passes — episodes did not break existing WMA paths.

### Timeline score

| Benchmark event | Before | After |
|-----------------|--------|-------|
| costco_abuela | ✅ | ✅ |
| lorebook_abuela_house | ✅ | ✅ |
| club_metro | ✅ | ✅ |
| leslie_graduation | ✅ | ✅ |
| kelly_interview | ✅ | ✅ |
| amazon_onboarding | ✅ | ✅ |
| sol_breakup | ✅ | ✅ |

**Timeline: 100% (unchanged).** Event recovery remains the timeline source of truth; episodes do not replace it.

### Relationship score

Family + social + career + romantic benchmarks: **79% (unchanged).**  
Episodes carry zero relationship IDs — no incremental graph signal.

### Recall score

| Query | Before | After |
|-------|--------|-------|
| Who lives with me? | ✅ | ✅ |
| What happened with Sol? | ✅ | ✅ |
| What did I do with Abuela? | ✅ | ✅ |
| Who is Andrew? | ✅ | ✅ |
| What role did Kelly play? | ✅ | ✅ |
| How am I related to Tio Juan? | ✅ | ✅ |
| Leslie's Graduation Party? | ✅ | ✅ |

**Recall: 7/7 (100%, unchanged).**

New metric — **episode context in recall:** 86% of benchmark queries returned ≥1 episode in WMA assembly. Episodes are *present* in retrieval but not improving hit quality because they lack entity/event content.

### Continuity score

Thread continuity composite (continuity cards 30%, summaries 30%, episode meta 40%):

| Component | Before | After | Δ |
|-----------|--------|-------|---|
| Continuity card rate | ~42% (est.) | 37% | −5 |
| Summary rate | low | 12% | — |
| Episode meta rate | 0% | 29% | +29 |
| **Thread continuity** | **40** | **26** | **−14** |

Episode labels in `threadMeta` increased, but overall continuity **regressed** because summary and card quality did not improve proportionally. Cards often show message counts or generic gap titles instead of scene summaries.

---

## What episodes *did* change

| Signal | Before | After | Notes |
|--------|--------|-------|-------|
| Episodes in DB | 0 | 51 | Founder 48 + developer 3 |
| WMA episode items | 0 | Present in 86% recall queries | Structure without substance |
| `threadMeta.episodes` | 0% threads | 29% founder threads | Labels like `33h gap · topic-shift` |
| Continuity cards mentioning episodes | No | Yes (developer sample) | Generic event list |

---

## Why no lift?

1. **Zero entity provenance on episodes** — `source_entity_ids` empty on all episodes. WMA cannot rank episodes by participant relevance.
2. **Sparse event provenance** — 13% founder episode event coverage; events not linked at segmentation time for most threads.
3. **71% thread miss rate** — Most founder threads still have no episodes; continuity gains cannot propagate.
4. **Generic titles** — Time-gap labels do not help user-facing continuity or recall disambiguation.
5. **Thread continuity formula** — Episode meta weight (40%) is insufficient to offset flat summary/card quality.

---

## Path to material impact

Episodes will improve reconstruction when these preconditions are met (all measurable):

| Gate | Current | Target | Measurement |
|------|---------|--------|-------------|
| Entity coverage per episode | 0% | >50% | `loadEpisodeStats().entityCoveragePct` |
| Event coverage per episode | 13% | >40% | `loadEpisodeStats().eventCoveragePct` |
| Threads with episodes | 29% | >60% | Phase 1 coverage audit |
| Episode context improving recall | 86% present, 0% lift | Recall delta >0 | Re-run Phase 3 |
| Thread continuity | 26 | >45 | Summary backfill + entity titles |

**Re-test trigger:** Re-run validation after entity_ids backfill on `chat_messages` and event ID wiring in `episodePersistenceService`.

---

## Commands

```bash
# Full validation (Phases 1–5)
npx tsx apps/server/scripts/episodeQualityValidation.ts

# Standalone scorecard
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/lifeReconstructionScore.ts

# Episode coverage only
EPISODE_USER_ID=<uuid> npx tsx apps/server/scripts/episodeActivationAudit.ts
```
