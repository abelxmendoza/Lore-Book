# Runtime Truth Validation

**Date:** 2026-05-27  
**Phase:** Continuity Validation + Runtime Truth  
**Trigger:** Realization that architecture was built without observability to validate it.

---

## What We Know Works

### Pipeline Execution (Confirmed by Code)

| Component | Status | Evidence |
|---|---|---|
| `ingestionQueue` priority queue | **Works** | Live code, enqueues after every chat message |
| `pipeline_runs` table write (start/complete/fail) | **Works** | `pipelineRunService.start()` called in queue |
| 12-step ingestion pipeline (Steps 1–6) | **Likely works** — synchronous path | No swallowed errors before step 6 |
| Knowledge units extraction | **Likely works** | Core synchronous step |
| Entity extraction (Step 4) | **Likely works** | Core synchronous step |
| Title generation (`ConversationTitleService`) | **Works** | DB write confirmed |
| Thread subtitle persistence | **Works** | `metadata.subtitle` written |

### Architecture That Exists But Is Unvalidated

| Component | Status | Gap |
|---|---|---|
| Event assembly (Step 12) | **Exists, unobserved** | Fire-and-forget, failures debug-logged only |
| Event candidates (Step 12.8.5) | **Exists, unobserved** | `eventCandidateService.processResolvedEvent` called but errors silently dropped |
| Recurring scene detection | **Exists, unobserved** | Same fire-and-forget wrapper |
| Provenance edges | **Failing in tests** | Pre-commit tests show repeated `"Provenance edge write failed"` — likely schema mismatch |
| `pipelineRunService.recordStep()` | **Never called** | API exists, 0 callers in pipeline code |
| `dominantEntities` in thread metadata | **Was never populated** | Field existed in type, write logic missing until 2026-05-27 |
| Entity merge / deduplication | **Unknown** | No test covers "Mom"/"my mom"/"Ma" → one entity |

---

## Known Silent Failure: Provenance Edges

**Evidence:** Pre-commit test suite shows `"Provenance edge write failed"` 10+ times per run.  
**Impact:** `provenanceEdgeService.createEdge()` is failing, likely due to schema or RLS issue.  
**Risk level:** DAMAGING — provenance edges underpin the `entityContinuityVerifier` health check and the `EntityProvenancePanel` UI.  
**Next step:** Query `provenance_edges` directly and check if any rows exist for any user. Compare schema against migration `20260211000000_provenance_edges.sql`.

---

## Observability Infrastructure Added (2026-05-27)

### 1. Pipeline Production Summary

`ingestionQueue.captureProductionSummary()` now runs after every successful pipeline execution. Queries result tables by time window and calls `pipelineRunService.recordStep('production_summary', ...)` with:

```json
{
  "knowledge_units_created": 5,
  "knowledge_units_touched": 7,
  "events_assembled": 1,
  "entities_created": 2,
  "event_candidates_created": 0
}
```

This surfaces in `pipeline_runs.step_results` — queryable directly.

### 2. Dev Continuity Trace Endpoint

```
GET /api/diagnostics/continuity-trace/:userId?limit=10&windowHours=24
```

Returns:
- Recent `pipeline_runs` with production summaries
- `entityContinuityVerifier` result (ingested → extracted → entityized → provenance gap analysis)
- Window production counts (entities, events, knowledge_units, event_candidates, provenance_edges)
- Queue health snapshot

**Dev/ENABLE_EXPERIMENTAL only.** This is the primary tool for answering "did the loop close?"

### 3. UI Refresh Timing Fix

Replaced the fixed 3-second setTimeout with two refreshes: 4s and 11s. The ingestion pipeline can take 8–15s end-to-end when LLM-backed steps (event assembly, interest extraction) are involved. The 3s delay was consistently too short.

### 4. Thread Entity Chips — Full Loop Closed

Previously: `dominantEntities` field existed in the `ChatThread` type and was rendered in `ChatThreadList`, but was never populated.

Now:
- `ConversationTitleService.generateTitle()` queries `knowledge_units.entities` for the thread if no entities are passed by the caller
- Merges with any existing `dominantEntities` (accumulates over time)
- Returns `dominantEntities` in the title API response
- Frontend `useConversationRuntime` applies them immediately via `updateThread()`
- `useChatThreads.updateThread()` now accepts and stores `dominantEntities`

---

## Validation Test Plan

Run these manually to validate the continuity loop. Record results in this document.

### Test 1 — Named Entity Continuity

**Message to send:** "I talked to Abuela today. She's not doing well."  
**Wait:** 15 seconds  
**Query:**
```sql
SELECT name, confidence, created_at FROM characters 
WHERE user_id = '<your-user-id>' 
AND name ILIKE '%abuela%'
ORDER BY created_at DESC;
```
**Pass:** Row exists with `name` matching "Abuela" (or alias)  
**Fail:** No row, or multiple fragmented rows  
**Status:** [ ] Not yet run

---

### Test 2 — Recurring Entity Reinforcement

**Messages to send (3 different sessions):**
1. "Talked to my mom about the move"
2. "My mom called again, same situation"
3. "Finally resolved things with mom"

**Query:**
```sql
SELECT name, alias, confidence, updated_at FROM characters
WHERE user_id = '<your-user-id>'
AND (name ILIKE '%mom%' OR alias::text ILIKE '%mom%' OR name ILIKE '%mother%')
ORDER BY confidence DESC;
```
**Pass:** One entity, confidence increasing across sessions, alias array contains variants  
**Fail:** Three separate entities, or one entity with no alias merging  
**Status:** [ ] Not yet run

---

### Test 3 — Pipeline Trace Loop Closure

**After sending any message, call:**
```
GET /api/diagnostics/continuity-trace/<userId>?limit=1&windowHours=1
```

**Pass criteria:**
- `pipelineRuns[0].status === 'completed'`
- `pipelineRuns[0].productionSummary.knowledge_units_created > 0`
- `continuityVerification.overallHealth !== 'broken'`
- `windowProduction.entitiesCreated >= 0` (not -1, which means query failed)

**Status:** [ ] Not yet run

---

### Test 4 — Persistence Survives Reload

1. Start conversation, mention a named person
2. Wait 15 seconds
3. Hard reload browser
4. Navigate back to the same thread
5. Open thread — entity chip should appear

**Pass:** Entity chip visible before first message in thread  
**Fail:** Thread shows no chips, or chips were lost on reload  
**Status:** [ ] Not yet run

---

### Test 5 — Retrieval Truthfulness

1. In one session: "I started working at Anthropic last month"
2. Wait 15 seconds
3. New session (new thread): "Where do I work?"

**Pass:** Response references Anthropic without being told in this session  
**Fail:** Response says "I don't have information about where you work" or asks  
**Status:** [ ] Not yet run

---

### Test 6 — No Hallucinated Continuity

1. Start fresh (new user, or cleared DB)
2. Ask: "What have we talked about before?"

**Pass:** Response acknowledges no prior record — doesn't invent conversations  
**Fail:** Response fabricates prior interactions  
**Status:** [ ] Not yet run

---

## Continuity Failure Mode Risk Assessment

| Failure | Risk Level | Current Mitigation | Validated? |
|---|---|---|---|
| Hallucinated continuity | CATASTROPHIC | Continuity identity block in system prompt; "sparse authentic" rule | No |
| False persistence claim ("I've saved this" when write failed) | CATASTROPHIC | None — backend writes are fire-and-forget | No |
| Identity fragmentation ("Mom"/"my mom"/"Ma" = 3 entities) | CATASTROPHIC | Entity resolution exists; threshold unknown | No |
| Provenance edge write failure | DAMAGING | Pre-commit tests show it's already failing silently | Confirmed failing |
| Silent pipeline failure (extraction runs but produces nothing) | DAMAGING | `captureProductionSummary` now records row_count=0 | Partially |
| Stale UI after pipeline completes | IRRITATING | Double refresh (4s + 11s) added | Yes |
| Thread entity chips missing | IRRITATING | Full loop closed 2026-05-27 | Yes |

---

## What Only Exists Architecturally (Not Yet Validated)

1. **Event candidates → recurring scene reinforcement**: The call chain exists. Whether entity overlap thresholds are correct and whether rows actually appear in `event_candidates` is unknown.

2. **Cross-thread continuity**: Architecture assumes entity persistence across threads. Not tested. A named entity from Thread A should surface in Thread B's context — this requires the RAG retrieval to actually pull from the entity store.

3. **Salience-ranked retrieval**: `entityContinuityVerifier` checks that entities were created, but not that the retrieval layer is weighting them correctly by recency/frequency.

4. **Jaro-Winkler entity stabilization**: Exists in code, never validated against real near-duplicate name pairs.

---

## Synchronization Gaps

| Layer | Current behavior | Ideal behavior |
|---|---|---|
| Knowledge units | Queried 4s + 11s after message | Supabase Realtime subscription |
| Characters | Queried 4s + 11s after message | Supabase Realtime subscription |
| Event candidates | Never reactively updated | Supabase Realtime subscription |
| Thread entity chips | Set once at title generation | Updated on each ingestion cycle |

The double-refresh is a pragmatic fix. The correct long-term solution is Supabase Realtime subscriptions on `knowledge_units`, `characters`, and `event_candidates` for the current user. This would make continuity surfaces update as soon as the pipeline completes, not on a timer.

---

## Priority Defects to Investigate

1. **Provenance edge failure** — `"Provenance edge write failed"` in every test run. Check `provenance_edges` table schema vs. `provenanceEdgeService.createEdge()` parameter shape.

2. **Entity merge coverage** — Run Test 2. If three separate entities appear for "mom"/"my mom"/"Ma", the merge threshold needs tuning.

3. **`pipelineRunService.recordStep()` never called in pipeline** — The per-step tracking API exists but only records run-level start/complete/fail. Add `recordStep` calls at Steps 4, 6, and 12 in `ingestionPipelineClass.ts` to get per-step visibility.
