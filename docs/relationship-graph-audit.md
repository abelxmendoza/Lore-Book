# Relationship Graph Audit

**Date:** 2026-06-15  
**Benchmark user:** Abel Mendoza (`789bd607-e063-466f-a9ef-f68d24e8bb57`)

---

## Phase 1 — Inventory (before recovery)

| Store | Count | Notes |
|-------|-------|-------|
| `character_relationships` | **0** | Primary graph — empty |
| `romantic_relationships` | 4 | Sol + others; not linked to character_relationships |
| `entity_facts` (relationship category) | 43 | Rich kinship data unused by graph |
| `entity_facts` (total active) | 1,270 | Career, history, general |
| `character_memories` | 10 | Journal links — co-mention possible |
| `characters` | 22 | Including Me, family, social, career |
| `group_candidates` | 30 | Household/family groups proposed, not edges |
| `organizations` | 6 | Amazon, My Family, Tía Grace's Household, Los Goths, Kforce, Clever Programmer |
| `family_trees` table | — | Not used; no dedicated table in schema |

### Relationship types (before)

None — graph was empty.

### Missing relationships (before)

All protagonist → family edges (Mom, Abuela, Tío Juan, Step Dad Ben, Tía Grace, Tío Ralph, Leslie, James, Jerry), social (Andrew, Goth Tio, Baby Bats, Mr. Chino), career (Kelly, Rafeh Qazi), romantic (Sol, Ashley).

### Root cause

`relationshipFoundationService` existed but only mined `character_memories` + `journal_entries`. Abel's data lives primarily in **entity_facts** and **chat/metadata messages**. The backfill script was never run against facts/chat.

---

## Phase 1 — Inventory (after recovery)

| Store | Count |
|-------|-------|
| `character_relationships` | **21** |
| By type | family: 5, friend: 2, romantic: 8, coworker: 1, mentor: 1, unknown: 4 |

### Evidence sources (metadata.sources)

- `entity_facts` — kinship with fact_ids (highest trust)
- `journal_comention` — protagonist linkage from character_memories
- `chat_comention` — per-person message snippets (lower confidence)

### Key edges recovered

| A | B | Type | Kinship | Evidence |
|---|---|------|---------|----------|
| Me | Abuela | family | grandmother | entity_facts |
| Me | Tío Juan | family | uncle | entity_facts |
| Me | Mom | family | — | chat + journal |
| Me | Step Dad Ben | family | — | name + chat |
| Me | Kelly | coworker | recruiter | entity_facts |
| Me | Andrew the Club Connection | friend | — | entity_facts |
| Me | Sol | romantic | — | chat (blocked/ended signals) |
| Tío Juan | Daisy | romantic | boyfriend | entity_facts (inter-character) |

### Still missing

- Daisy (no protagonist edge — only Juan↔Daisy)
- Amazon / Armstrong Robotics / Serve Robotics (org membership edges)
- LoreBook project collaborator edges
- Household "lives with" edges (facts too vague: "Lives with someone")
- `romantic_relationships` not synced into character_relationships

---

## Coverage by benchmark group

| Group | Covered |
|-------|---------|
| Family (9 names) | **9/9** have at least one edge |
| Social (7 names) | **6/7** (Daisy missing protagonist link) |
| Career (6 names) | **2/6** (Kelly, Rafeh) |
| Romantic (2 names) | **2/2** (Sol, Ashley) |

---

## Run recovery

```bash
cd apps/server
RECOVERY_USER_ID=789bd607-e063-466f-a9ef-f68d24e8bb57 npx tsx src/scripts/generateRelationships.ts
# or authenticated API:
POST /api/diagnostics/recover-relationships
```
