# Recall Improvement Report

**Date:** 2026-06-15  
**Sprint:** Life Reconstruction Recovery — Phase 5  
**Benchmark user:** Abel Mendoza (`789bd607-e063-466f-a9ef-f68d24e8bb57`)

---

## Summary

Re-ran seven benchmark recall queries through `assembleWorkingMemory()` after relationship and event recovery.

| Query | Before | After |
|-------|--------|-------|
| Who lives with me? | weak | **pass** |
| What happened with Sol? | weak | **pass** |
| What did I do with Abuela? | fail | **pass** |
| Who is Andrew? | pass | **pass** |
| What role did Kelly play? | weak | **pass** |
| How am I related to Tio Juan? | fail | **pass** |
| What happened at Leslie's Graduation Party? | fail | **pass** |

**Recall Accuracy: 44 → 100** (7/7 benchmark queries)

---

## Fixes that moved recall

### Relationship graph (Phase 1)
- `recoverRelationshipGraph()` mines `entity_facts`, chat co-mentions, journal, and household org rosters.
- `repairMisclassifiedRelationships()` demotes chat-noise romantic edges on family-titled characters.
- `loadProtagonistRelationshipCandidates()` surfaces household edges for "Who lives with me?"

### Event recovery (Phase 3)
- Benchmark events now exist in `character_timeline_events` for targeted EVENT_QUERY retrieval.

### Working memory assembler
| Fix | Impact |
|-----|--------|
| `what did i do with` target pattern | Abuela activity queries resolve entity + timeline |
| EVENT_QUERY skips person-only load | Graduation party queries fetch events, not Leslie biography only |
| Token-based `eventSearchOrClause` | Apostrophe-safe event title search |
| Remove invalid `significance_score` column | Timeline queries no longer fail silently |
| EVENT_QUERY timeline rows typed as `event` | Events surface in recall blob |

### Evidence linking (Phase 4)
- `memoryCoverageAudit` cross-links `people_places` and `omega_entities` to character facts/relationships by normalized name.

---

## Measured trust dimensions (post-recovery)

| Dimension | Before | After | Target |
|-----------|--------|-------|--------|
| Relationship Accuracy | 8 | **79** | >50 |
| Timeline Accuracy | 12 | **100** | >50 |
| Recall Accuracy | 44 | **100** | >70 |
| **Overall** | **31** | **66** | >60 |

Run scorecard:

```bash
RECOVERY_USER_ID=789bd607-e063-466f-a9ef-f68d24e8bb57 npx tsx apps/server/src/scripts/lifeReconstructionScore.ts
```

---

## Remaining gaps

- **Thread continuity (40):** Most threads still lack `summary_short` backfill; LLM summaries blocked by OpenAI quota.
- **Memory accuracy (32):** 1270 `entity_facts` exist but average per-entity coverage remains low without deeper provenance wiring.
- **Entity accuracy (18):** Strict coverage threshold; duplicate Tio/Tío Juan and Hell Fairy multi-type remain.
