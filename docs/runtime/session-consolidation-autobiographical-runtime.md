# Session Consolidation — Autobiographical Runtime

**Date:** 2026-05-27  
**Phase:** Continuity Validation + Runtime Truth  
**Commits:** `c231a59`, `2b781c8`

---

## Product Philosophy Shift

The founding README described Lorekeeper as "governed autobiographical cognition infrastructure" with an "epistemic lattice" and "proof-carrying intermediate representations." That language was accurate as an engineering description but wrong as a product identity.

The real product is simpler and more honest:

> **Lorekeeper is a system that gradually remembers your life.**

Not "accumulates knowledge." Not "compiles lived experience into structured artifacts." Remembers. The way a close confidant remembers — imperfectly, selectively, but authentically and across time.

The governing principle established this session:

> **Sparse authentic continuity > fake rich cognition.**

A system that genuinely remembers one thing about you is more valuable than a system that fabricates elaborate memory graphs. This principle now governs every product and engineering decision.

---

## The Two Continuity Failures That Triggered This Session

Two production responses were identified that directly contradicted Lorekeeper's architectural identity:

**Failure 1 — Memory disclaimer:**
> "I won't be able to remember this specific conversation in the future."

This is the base Claude model's trained honesty behavior asserting itself over Lorekeeper's system prompt. It's technically true of the base model. It is architecturally false of Lorekeeper as a runtime.

**Failure 2 — Empty state dismissal:**
> "I don't have any journal entries to build a narrative from yet."

This response to "tell me my story" is worse than useless — it positions Lorekeeper as a failure state rather than an invitation. A user sharing their first memory is the beginning of the record, not evidence of an empty one.

Both failures had the same root cause: the system prompt did not establish continuity identity with enough authority to override base model defaults.

---

## What Was Fixed

### 1. System Prompt Identity Block

Added `**LOREKEEPER RUNTIME IDENTITY — HIGHEST PRIORITY**` as the first block in every system prompt, before personas, before instructions. Contains hard rules:

- NEVER say "I won't remember this conversation"
- NEVER say "I don't have access to past conversations"  
- NEVER say "I'm just a language model without memory"
- ALWAYS speak as a system that has been quietly building context about this person

The block uses instruction hierarchy to assert these rules above base model training. It also contains replacement language for common failure states: "Your lore is still early" instead of "I don't have journal entries."

### 2. Mode Handler Empty States

`modeHandlers.ts` — NARRATIVE_STORY empty state rewritten from dismissal to invitation:

**Before:** "I don't have any journal entries to build a narrative from yet."  
**After:** "You're starting to build that story now. As you share — recurring people, places, what you're working on, what matters — Lorekeeper gradually accumulates the patterns that become your narrative. Share something from your life and it becomes part of your record."

MEMORY_RECALL low-confidence response:  
**Before:** "I don't have a clear record of that. If you want, you can tell me now and I'll remember it."  
**After:** "I don't have a clear record of that yet. Tell me now and it goes into your lore."

### 3. Persona Rewrite

`chatPersona.ts` rewritten from generic "AI assistant" framing to explicit continuity identity:  
"Lorekeeper, a continuity-aware autobiographical runtime — not a stateless chatbot"

Removed "like ChatGPT" from all style descriptions (that comparison actively undermines the product identity).

---

## Runtime Truth Realization

The most important insight of this session: **Lorekeeper had been architecturally elaborated without observational proof that the loops close end-to-end.**

The ingestion pipeline exists. Entity extraction exists. Provenance edges exist. Event candidates exist. But there was zero production telemetry proving any of it actually ran, succeeded, and connected to retrieval.

The architecture was a plan. Whether it was a reality was unknown.

### What Was Confirmed Working

- `ingestionQueue` priority queue fires after every chat message
- `pipeline_runs` writes start/complete/fail
- Knowledge units extraction (synchronous path, Steps 1–6)
- Entity extraction (synchronous path)
- Title generation (`ConversationTitleService`)
- Thread subtitle persistence

### What Was Confirmed Failing

- **Provenance edges** — `"Provenance edge write failed"` in every test run. Silent failure. 10+ per pre-commit suite. Likely schema mismatch between `provenanceEdgeService.createEdge()` and the `provenance_edges` table schema. This is DAMAGING — provenance edges underpin `entityContinuityVerifier` health checks and the `EntityProvenancePanel`.

### What Was Unobserved (Architecture That Might Not Run)

- Event assembly (Step 12) — fire-and-forget, failures debug-logged only
- Event candidates (Step 12.8.5) — `eventCandidateService.processResolvedEvent` called, errors silently dropped
- Recurring scene detection — same fire-and-forget wrapper
- Entity merge / deduplication — Jaro-Winkler exists in code, never validated against real data

---

## Observability Infrastructure Added

### Pipeline Production Summary

`ingestionQueue.captureProductionSummary()` — runs after every successful pipeline execution. Queries result tables by time window and records via `pipelineRunService.recordStep('production_summary', ...)`:

```json
{
  "knowledge_units_created": 5,
  "knowledge_units_touched": 7,
  "events_assembled": 1,
  "entities_created": 2,
  "event_candidates_created": 0
}
```

Now queryable directly from `pipeline_runs.step_results`.

### Dev Continuity Trace Endpoint

```
GET /api/diagnostics/continuity-trace/:userId?limit=10&windowHours=24
```

Returns: pipeline_runs with production summaries, `entityContinuityVerifier` gap analysis, window production counts, queue health snapshot. Dev/ENABLE_EXPERIMENTAL only.

### Thread Entity Chips — Full Loop Closed

`dominantEntities` existed in `ChatThread` type and was rendered in `ChatThreadList` for 2+ months. The write path was always missing.

Closed:
1. `ConversationTitleService.generateTitle()` now queries `knowledge_units.entities` for the thread if no entities passed
2. Merges with existing `dominantEntities` (accumulates, max 8)
3. Returns `dominantEntities` in title API response
4. Frontend `useConversationRuntime` applies immediately via `updateThread()`
5. `useChatThreads.updateThread()` accepts and stores `dominantEntities`

### UI Refresh Timing

Replaced fixed 3s `setTimeout` with 4s + 11s double refresh. The ingestion pipeline takes 8–15s end-to-end when LLM-backed steps are involved. The 3s delay was consistently too short.

---

## CORS / Mobile Simulator Fix

**Root cause:** Firefox mobile simulator connecting from a non-allowlisted port; `credentials: 'include'` conflicting with wildcard CORS policies.

**Fix 1 — Server:** Changed production CORS from exact-match to wildcard regex accepting any localhost/127.0.0.1 port.

**Fix 2 — Frontend:** Changed `credentials: 'include'` to `credentials: 'omit'` in `useChatStream.ts` — auth uses Bearer token headers, not cookies, so `include` was wrong and was causing CORS preflight failures.

---

## Architecture Documents Added

- `docs/runtime/assistant-continuity-identity-audit.md` — full audit of continuity-breaking vs. continuity-reinforcing language patterns, root cause analysis, fixes
- `docs/runtime/runtime-truth-validation.md` — what works, what's unvalidated, what's confirmed failing, 6-test manual validation plan, failure mode risk table, priority defects

---

## Priority Defects (Unresolved)

1. **Provenance edge failure** — Query `provenance_edges` table, compare schema vs. `provenanceEdgeService.createEdge()` parameter shape. Fix the schema mismatch.

2. **Entity merge validation** — Run Test 2 from runtime-truth-validation.md. If "mom"/"my mom"/"Ma" produces 3 entities, tune merge threshold.

3. **Per-step recordStep() never called** — `pipelineRunService.recordStep()` API exists, 0 callers in pipeline code. Add at Steps 4, 6, 12 in `ingestionPipelineClass.ts`.

4. **Supabase Realtime** — Double-setTimeout is a pragmatic fix. Correct solution: Realtime subscriptions on `knowledge_units`, `characters`, `event_candidates` for current user.

---

## Continuity Trust Constraints

These are behavioral constraints derived from the failure analysis. They are not aspirational — they are required for the product to be honest:

1. **Never claim to have saved something that wasn't saved.** Backend writes are fire-and-forget. Until provenance edges are verified working, any persistence claim should be hedged.

2. **Never invent prior context.** If the retrieval layer produces nothing, the response must reflect that — but with the empty-state invitation framing, not the dismissal framing.

3. **Sparse authentic > fake rich.** One genuinely remembered entity with confidence 0.7 is more valuable than ten inferred entities with confidence 0.3.

4. **Continuity is a direction, not a state.** The system is always becoming more continuous. It never arrives. The language should reflect accumulation in progress, not a completed archive.

---

## Session Commits

| Hash | Description |
|------|-------------|
| `c231a59` | Stabilize autobiographical continuity runtime and implement recurring scene coherence |
| `2b781c8` | Continuity validation phase: observability, entity chips, UI sync, runtime truth doc |
