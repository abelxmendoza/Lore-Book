# Memory Accuracy Report

**Date:** 2026-06-15  
**Account:** Abel Mendoza (`789bd607-e063-466f-a9ef-f68d24e8bb57`)

---

## Summary

| Metric | Value | Grade |
|--------|-------|-------|
| Total entities | 171 | — |
| Healthy entities (coverage ≥ 60) | 1 (0.6%) | F |
| Weak entities | 163 (95%) | F |
| Orphaned entities | 7 (4%) | D |
| Average coverage score | **26/100** | F |
| entity_facts rows | 1,270 | — |
| Facts linked to character evidence | ~0 in audit | F |
| character_relationships | **0** | F |
| character_timeline_events | 7 (none match benchmarks) | F |

**Memory accuracy verdict:** **Poor (26/100)** — data exists but is fragmented, unlinked, and weakly evidenced.

---

## What memory gets right

- **Named people persist:** Abuela, Mom, Tío Juan, Kelly, Sol, Leslie, Ashley, Jerry, James, Step Dad Ben, Rafeh Qazi, Andrew, Goth Tio, Baby Bats, Mr. Chino, Oscuri.dad
- **Places persist:** Club Metro, Abuelas House, Moms House, Moreno Valley (as place after repair)
- **Chat history survives:** 97 chat_messages + metadata.messages in conversation_sessions
- **Entity facts volume:** 1,270 active facts — raw material exists for reconstruction
- **Recall for direct names:** Working memory assembler resolves Andrew, Sol, Kelly, Tío Juan with confidence ≥ 0.9

---

## What memory gets wrong

### Storage fragmentation
Same person often exists in 2–3 stores without merge:
- Abuela: `characters` + `people_places` + `omega_entities`
- Tío Juan: `Tio Juan` + `Tío Juan` + `Juan's group`
- Ashley: full name + `Ashley` alias entity

### Evidence disconnect
- `entity_facts`: 1,270 rows
- Character `evidence` count in coverage audit: **0** for nearly all characters
- Facts are not surfacing in character cards or recall scoring

### Session/message split
- `conversation_sessions.id` ≠ `chat_messages.session_id` for many threads
- Messages recoverable via `metadata.messages` merge path
- Systems that read only `chat_messages` see **0 messages** (summaries, continuity, ingestion)

### Pollution (fixed this sprint)
Products/apps/places were Character cards. Repair removed/retyped 11 rows. **0 pollution hits remain.**

### Timeline void
Benchmark life events (Costco, graduation, Amazon onboarding, Sol breakup) have **no** structured timeline records despite rich chat threads discussing them.

---

## Domain reconstruction scores

| Domain | Score | Evidence |
|--------|-------|----------|
| Family | 35 | People exist; no edges; kinship honorifics work in classifier |
| Career | 30 | Amazon/LoreBook entities + chat; no arc |
| LoreBook project | 45 | Threads + PROJECT_QUERY recall works |
| Romantic | 25 | Sol/Ashley entities; no relationship model |
| Nightlife/social | 40 | Club Metro, Hell Fairy, Goth Tio entities |
| Fitness | 20 | Gym thread exists; no structured memory |
| Education | 5 | No entities/events found |

---

## Recommendations (fix-only, no new architecture)

1. Backfill `character_relationships` from existing entity_facts mentioning kinship
2. Align `chat_messages.session_id` to `conversation_sessions.id` on write
3. Link entity_facts to character evidence in coverage scoring
4. Merge accent duplicates (Tio/Tío) via existing characterRegistry merge
5. Promote thread-discussed events to `character_timeline_events` via existing ingestion pipeline

---

## Test commands

```bash
cd apps/server
npx tsx scripts/lifeReconstructionAudit.ts
curl -H "Authorization: Bearer $TOKEN" /api/diagnostics/memory-coverage
curl -X POST -H "Authorization: Bearer $TOKEN" /api/diagnostics/repair-entity-pollution?dryRun=true
```
