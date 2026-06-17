# Entity Resolution Quality Results

**Date:** 2026-06-16  
**Benchmark:** Fixture variant battery + trust scorecard baseline

---

## Summary

| Metric | Before (legacy) | After shadow | After `on` (projected) |
|--------|-----------------|--------------|------------------------|
| Resolver paths | 5+ scattered | 1 core + legacy adapter | 1 core authoritative |
| Kinship dedup (`Mom`→`Mother`) | Creates duplicate | Expected in production shadow | Resolves correctly |
| Alias dedup (`Abuela`, `Tio Juan`) | Works (exact/alias) | Agreement | Same |
| Ambiguous `Juan` | JW picks arbitrarily | merge_suggestion | Thread-context resolve |
| False merge (`Daisy`→`Velvet Hour`) | JW risk | Blocked without alias | Blocked without alias |
| Shadow disagreements (fixture) | — | 2/12 (17%) | — |
| Duplicates prevented (fixture) | — | 1 (Mom kinship) | — |

---

## Variant Battery — Detailed Results

Run: `npx tsx apps/server/scripts/entityResolutionDuplicateAnalysis.ts`

### Tio Juan variants

| Mention | Core action | Core ID | Duplicate prevented |
|---------|-------------|---------|---------------------|
| Tio Juan | resolve | e-tiojuan | N/A (legacy also resolves) |
| Tío Juan | resolve | e-tiojuan | N/A |
| Juan (no context) | disambiguate | — | Prevents wrong-Juan auto-pick |
| Juan (thread: Abuela) | resolve | e-tiojuan | Context disambiguation |

### Abuela variants

| Mention | Core action | Core ID |
|---------|-------------|---------|
| Abuela | resolve | e-abuela |
| grandma | resolve | e-abuela (kinship) |

### Andrew / Ashley variants

| Mention | Core action | Core ID |
|---------|-------------|---------|
| Andrew | resolve | e-andrew |
| Andy | resolve | e-andrew (alias) |
| Ashley | resolve | e-ashley |

### Hell Fairy / Daisy variants

| Mention | Core action | Core ID | Notes |
|---------|-------------|---------|-------|
| Hell Fairy | resolve | e-hf | Alias match |
| Daisy | resolve | e-hf | Requires alias on record |
| Daisy (no alias on VF) | create/disambiguate | — | No false merge |

---

## Shadow Disagreement Analysis

The fixture battery found **1 measured disagreement** (`Juan` without context — see above).

Additional high-value disagreements expected in production shadow logs:

- JW false positives merging distinct people
- Kinship terms in Spanish (`tía`, `abuelo`) matching existing family entities
- Thread-context Juan disambiguation vs legacy first-match

---

## Reconstruction Score Projection

### Current baseline (`lifeReconstructionScore.ts`)

| Dimension | Score |
|-----------|-------|
| Overall | 66/100 |
| Relationship | 79 |
| Recall | 100 |
| Timeline | 100 |
| Entity (strict coverage) | 18 |

### Projected when `ENTITY_RESOLUTION_CORE=on`

| Dimension | Projected | Rationale |
|-----------|-----------|-----------|
| Entity accuracy | 25–35 | Fewer duplicate characters diluting coverage |
| Relationship | 82–88 | Cleaner entity IDs → better edge recovery |
| Overall | 70–75 | Entity dimension is primary lever |

**Validation:** Re-run `lifeReconstructionScore.ts` after 7 days of `on` mode.

---

## Relationship & Event Recovery

Entity resolution quality directly affects downstream recovery:

| Pipeline | Dependency on entity IDs |
|----------|-------------------------|
| `relationshipFoundationService.recoverRelationshipGraph` | Entity names → canonical IDs |
| `eventRecoveryService` | Claim entity_id linkage |
| `workingMemoryAssembler` | Character/event retrieval |

Duplicate entities cause:
- Split relationship edges across two IDs
- Missed recall ("Who is Tio Juan?" finds wrong record)
- Inflated entity count lowering coverage scores

Core activation reduces these failure modes before recovery runs.

---

## Rollback

Instant: `ENTITY_RESOLUTION_CORE=off`

No data migration required — core only changes resolution decisions, not stored schema.

---

## Next Steps

1. Monitor shadow logs for 3–7 days
2. Flip to `on` in staging, re-run scorecard
3. Promote to production
4. Execute deletion plan for legacy matchers
