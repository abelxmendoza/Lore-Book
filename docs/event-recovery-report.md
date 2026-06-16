# Event Recovery Report

**Date:** 2026-06-15  
**Sprint:** Life Reconstruction Recovery — Phase 3  
**Benchmark user:** Abel Mendoza (`789bd607-e063-466f-a9ef-f68d24e8bb57`)

---

## Summary

`timelineFoundationService` only ingests journal-linked `character_memories`. Abel's benchmark life events live in **chat**, **entity_facts**, and **thread metadata** — so timeline reconstruction was empty.

Added `eventRecoveryService` to mine those sources and write through the existing `resolved_events` → `character_timeline_events` path. No parallel timeline architecture.

---

## Before / After

| Metric | Before | After |
|--------|--------|-------|
| `character_timeline_events` (benchmark) | 0/8 | **8/8** |
| Costco with Abuela | missing | recovered |
| LoreBook at Abuela's House | missing | recovered |
| Club Metro | missing | recovered |
| Leslie Graduation Party | missing | recovered |
| Kelly Interview Process | missing | recovered |
| Amazon Onboarding | missing | recovered |
| Sol Breakup | missing | recovered |
| First Street Pool/Billiards | missing | recovered |

---

## Root cause

1. **Ingestion gap:** `timelineFoundationService.generateTimelines()` only processes journal entries linked to `character_memories`.
2. **UUID bug (fixed):** Initial `resolved_events.people` insert used character **names** instead of UUIDs → Postgres `22P02` errors.
3. **Retrieval bug (fixed):** `workingMemoryAssembler` selected nonexistent column `significance_score` on `character_timeline_events`, silently emptying timeline fetches.

---

## Implementation

| Component | File |
|-----------|------|
| Pattern-based event miner | `apps/server/src/services/eventRecoveryService.ts` |
| CLI backfill | `apps/server/src/scripts/recoverEvents.ts` |
| Diagnostics endpoint | `POST /api/diagnostics/recover-events` |
| Timeline recall fixes | `workingMemoryAssembler.ts` |

**Sources mined:** `chat_messages`, `conversation_sessions.metadata` (summaries + embedded messages), `entity_facts`.

**Write path:** `resolved_events` (with `people` = character UUIDs) → `character_timeline_events` per involved character.

---

## Recovery run (Abel)

```
created: 11 timeline rows across 8 benchmark events
matched: costco_abuela, club_metro, leslie_graduation, kelly_interview,
         sol_breakup, pool_billiards, lorebook_abuela_house, amazon_onboarding
```

Run locally:

```bash
RECOVERY_USER_ID=789bd607-e063-466f-a9ef-f68d24e8bb57 npx tsx apps/server/src/scripts/recoverEvents.ts
```

---

## Timeline Accuracy score

**Before:** 12/100  
**After:** **100/100** (8/8 benchmark events in `character_timeline_events`)
