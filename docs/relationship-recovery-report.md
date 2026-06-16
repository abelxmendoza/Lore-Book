# Relationship Recovery Report

**Date:** 2026-06-15  
**Sprint:** Relationship Graph Recovery

---

## Summary

Extended the existing `relationshipFoundationService` to mine **entity_facts**, **chat messages**, and **journal co-mentions** — then backfilled Abel's account.

**Before:** 0 `character_relationships`  
**After:** 21 `character_relationships` with fact-backed evidence

---

## What was built (no new architecture)

| Change | File |
|--------|------|
| Fact parser (`parseRelationshipFact`) | `relationshipFoundationService.ts` |
| `extractRelationshipsFromEntityFacts` | same |
| `extractRelationshipsFromChatCoMention` (per-person snippets) | same |
| `recoverRelationshipGraph` orchestrator | same |
| Type precedence: facts > chat | same |
| `POST /api/diagnostics/recover-relationships` | `diagnostics.ts` |
| Household + kinship recall patterns | `workingMemoryAssembler.ts` |
| `loadProtagonistRelationshipCandidates` | same |
| Tests | `relationshipFoundation.test.ts` |

---

## Phase 2 — Extraction sources

| Source | Pairs processed | Edges created/updated |
|--------|-----------------|----------------------|
| Journal / character_memories | 21 | protagonist linkage |
| entity_facts | 9 | kinship, romantic inter-character, social, career |
| Chat co-mention | 21 | per-person context snippets |

**Extraction types supported:** parent, child, grandparent, sibling, aunt, uncle, cousin, friend, coworker, manager/mentor, recruiter, romantic, ex-romantic (status), teammate (pattern), household (partial — needs sharper facts).

---

## Phase 3 — Family graph

| Person | Edge | Type | Kinship |
|--------|------|------|---------|
| Abuela | Me ↔ Abuela | family | grandmother |
| Tío Juan | Me ↔ Tío Juan | family | uncle |
| Mom | Me ↔ Mom | family | — |
| Step Dad Ben | Me ↔ Step Dad Ben | family | — |
| Tía Grace | Me ↔ Tía Grace | edge exists | needs kinship refinement |
| Tío Ralph | edge exists | — | — |
| Leslie | Me ↔ Leslie | family | — |
| James | edge exists | — | — |
| Jerry | edge exists | — | — |

**Household edges:** Organizations exist (`Tía Grace's Household`, `My Family`) but not wired as `character_relationships` household_member type yet.

---

## Phase 4 — Social graph

| Person | Status |
|--------|--------|
| Andrew | ✅ friend (met at bar, Instagram) |
| Hell Fairy | ✅ edge exists |
| Daisy | ⚠️ only via Tío Juan ↔ Daisy romantic |
| Oscuri.dad | ✅ edge exists |
| Baby Bats | ✅ friend |
| Mr. Chino | ✅ edge exists |
| Goth Tio | ✅ edge exists |

---

## Phase 5 — Career graph

| Entity | Status |
|--------|--------|
| Kelly | ✅ coworker / recruiter (fact-backed) |
| Rafeh Qazi | ✅ mentor (name heuristic + edge) |
| Amazon | ❌ org exists, no character edge |
| Armstrong Robotics | ❌ not in DB |
| Serve Robotics | ❌ not in DB |
| LoreBook | ❌ project edge not in character_relationships |

---

## Phase 6 — Romantic graph

| Person | Status |
|--------|--------|
| Sol | ✅ romantic edge; 4 rows in romantic_relationships with evidence |
| Ashley De La Cruz | ✅ romantic edge |

Evidence stored in `metadata.fact_ids` and `romantic_relationships.metadata.evidence` — no hallucinated edges.

---

## Phase 8 — Recall improvement

| Question | Before | After |
|----------|--------|-------|
| Who lives with me? | Generic 15 items, no entities | **12 relationship edges** returned (still no explicit household) |
| Who is Andrew? | ✅ entities | ✅ entities + **friend** relationship |
| How am I related to Tio Juan? | LIFE_REVIEW fallback | **RELATIONSHIP_QUERY + family** |
| What happened with Sol? | ✅ entities + items | ✅ + **romantic** relationship |
| Who is Kelly? | ✅ entities | ✅ + **coworker** relationship |
| What role did Rafeh play? | Generic fallback | **RELATIONSHIP_QUERY + mentor** edge |

---

## Remaining issues

1. Chat co-mention still creates some `romantic` edges where context is ambiguous (Tía Grace, etc.)
2. `romantic_relationships` table not auto-synced to `character_relationships`
3. Organization membership (Amazon, LoreBook) needs org↔character edges — out of scope for character_relationships table
4. Household / "lives with" needs sharper facts or group_candidates → edges
5. Daisy lacks direct protagonist edge

---

## Commands

```bash
cd apps/server
npm test -- relationshipFoundation
RECOVERY_USER_ID=<userId> npx tsx src/scripts/generateRelationships.ts
```
