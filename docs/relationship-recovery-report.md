# Relationship Recovery Report

**Date:** 2026-06-15 (updated — Life Reconstruction Recovery sprint)  
**Sprint:** Relationship Graph Recovery + Family Integrity

---

## Summary

Extended the existing `relationshipFoundationService` to mine **entity_facts**, **chat messages**, **journal co-mentions**, and **household organizations** — then backfilled Abel's account.

**Before:** 0 `character_relationships`  
**After:** **21** `character_relationships` with evidence-backed metadata  
**Family benchmark:** **9/9** (Mom, Step Dad Ben, Abuela, Juan, Grace, Ralph, Leslie, James, Jerry)

**Relationship Accuracy: 8 → 79**

---

## Phase 2 — Family graph (verified)

| Person | Edge | Type | Kinship |
|--------|------|------|---------|
| Mom | Me ↔ Mom | family | mother |
| Step Dad Ben | Me ↔ Step Dad Ben | family | — |
| Abuela | Me ↔ Abuela | family | grandmother / household |
| Tío Juan | Me ↔ Tío Juan | family | uncle |
| Tía Grace | Me ↔ Tía Grace | family | household |
| Tío Ralph | Me ↔ Tío Ralph | family | uncle |
| Leslie | Me ↔ Leslie | family | sibling |
| James | Me ↔ James | family | household (repaired from romantic) |
| Jerry | Me ↔ Jerry | family | household |

**Household:** Organization rosters (`extractRelationshipsFromOrganizations`) now wire `kinship: household` edges.

**Repair pass:** `repairMisclassifiedRelationships()` fixed 5 chat-noise romantic edges on family-titled characters (e.g. James).

---

## Extraction sources (latest run)

| Source | Edges |
|--------|-------|
| Journal / character_memories | 21 |
| entity_facts | 9 |
| Chat co-mention | 21 |
| Organizations (household) | 6 |
| Repaired misclassified | 5 |

---

## Phase 6 — Cleanup

- Relationship pairs deduped via `upsertRelationship` normalizePair — no duplicate A↔B paths.
- Remaining: Tio/Tío Juan character duplicates (entity merge, not relationship system).
- Mr. Chino retains romantic type due to attached fact_id (manual fact review needed).

---

## Run recovery

```bash
RECOVERY_USER_ID=789bd607-e063-466f-a9ef-f68d24e8bb57 npx tsx apps/server/src/scripts/generateRelationships.ts
```

API: `POST /api/diagnostics/recover-relationships`
