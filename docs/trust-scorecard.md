# Trust Scorecard

**Date:** 2026-06-15 (Life Reconstruction Recovery sprint)  
**Benchmark:** Abel Mendoza real history (`789bd607-e063-466f-a9ef-f68d24e8bb57`)

---

## Final answer

### Can LoreBook reconstruct a user's life significantly better than before?

# **YES**

**Evidence:** Overall reconstruction rose from **31 → 66**. Relationship graph went from **0 → 21** edges with **9/9 family benchmark coverage**. Timeline went from **0/8 → 8/8** benchmark events. Recall benchmarks **7/7 pass** (was ~4/7). No new parallel architecture — fixes applied to existing foundation services.

---

## Scores (0–100)

| Dimension | Before | After | Target | Status |
|-----------|--------|-------|--------|--------|
| **Memory Accuracy** | 26 | **32** | — | Improved (evidence cross-link) |
| **Entity Accuracy** | 58 | **18**¹ | — | Strict coverage metric² |
| **Relationship Accuracy** | 8 | **79** | >50 | ✅ |
| **Timeline Accuracy** | 12 | **100** | >50 | ✅ |
| **Recall Accuracy** | 44 | **100** | >70 | ✅ |
| **Thread Continuity** | 42 | **40** | — | Flat (summary backfill pending) |

### **Overall reconstruction score: 66/100** (was 31)

¹ Entity accuracy uses `% characters with coverage score ≥ 40`; high entity count dilutes average.  
² Named-people lookup remains strong; benchmark people 19/20 exist.

---

## What changed this sprint

| Action | Impact |
|--------|--------|
| `recoverRelationshipGraph()` — facts, chat, orgs, repair pass | +71 relationship |
| `eventRecoveryService` — chat/facts → timeline | +88 timeline |
| `workingMemoryAssembler` — kinship, events, column fix | +56 recall |
| `memoryCoverageAudit` name cross-linking | +6 memory |

---

## Benchmark recall (7/7)

- ✅ Who lives with me?
- ✅ What happened with Sol?
- ✅ What did I do with Abuela?
- ✅ Who is Andrew?
- ✅ What role did Kelly play?
- ✅ How am I related to Tio Juan?
- ✅ What happened at Leslie's Graduation Party?

---

## Commands

```bash
# Relationship recovery
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/generateRelationships.ts

# Event recovery
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/recoverEvents.ts

# Full scorecard
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/lifeReconstructionScore.ts
```

API: `POST /api/diagnostics/recover-relationships`, `recover-events`, `life-reconstruction-score`

---

## Remaining work for >70 overall

| Gap | Est. impact |
|-----|-------------|
| Thread summary backfill | +10 thread continuity |
| Entity dedup (Tio/Tío, Andrew) | +8 entity |
| Provenance on entity_facts | +12 memory |
| Mr. Chino romantic misclassification (has fact_id) | +2 relationship |
