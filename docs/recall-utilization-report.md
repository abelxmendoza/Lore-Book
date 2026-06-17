# Recall Utilization Report

**Date:** 2026-06-17  
**Sprint:** Chat Memory Utilization  
**Method:** 20-question trace via `chatMemoryUtilizationAudit.ts` on founder account  
**Script:** `apps/server/scripts/chatMemoryUtilizationAudit.ts`

---

## Executive Summary

### Is LoreBook using what it knows?

# **Partially — with major gaps by memory type**

Working Memory Assembler (WMA) **does reach the model** for most recall questions (~3k tokens avg WM block in an ~8.6k token system prompt). But several extracted memory types **never enter WMA retrieval**, and intent misclassification routes project/goal questions to generic life review.

| Memory type | Retrieved by WMA? | Reaches model? | Verdict |
|-------------|-------------------|----------------|---------|
| Entities | ✅ When resolved | ✅ WM + character blocks | Works for named people |
| Relationships | ✅ Relationship queries | ✅ WM (12 max household) | Strong for family |
| Events | ⚠️ 60% of questions | ✅ When retrieved | Event-query intent helps |
| Episodes | ✅ 85% of questions | ✅ Journal/thread episodes | Working |
| Skills | ❌ Not in WMA | ✅ RAG `confirmedSkills` only | Bypasses WMA |
| Goals | ❌ Not in WMA | ❌ No goals table query | **Not used** |
| Projects | ❌ Intent misclassified | ❌ 0 projects in 20 traces | **Not used** |
| Communities | ❌ Not in WMA | ⚠️ RAG optional block | Rarely relevant |

---

## Phase 2 — 20-Question Recall Trace

### Aggregate metrics

| Metric | Value |
|--------|-------|
| Questions traced | 20 |
| Avg WMA items selected | **15** / 20 budget |
| Avg WMA items rejected | **2** |
| Avg system prompt tokens | **~8,629** |
| Avg WM block tokens | **~2,800** |
| Questions with 0 events | **12 / 20 (60%)** |
| Questions with 0 relationships | **10 / 20 (50%)** |
| Questions with 0 episodes | **3 / 20 (15%)** |

### Benchmark recall (7 trust-scorecard queries)

| Question | Intent | Episodes | Events | Relationships | WMA selected |
|----------|--------|----------|--------|---------------|--------------|
| Who lives with me? | RELATIONSHIP_QUERY | 3 | 4 | **12** | 20 |
| What happened with Sol? | RELATIONSHIP_QUERY | 7 | 3 | 1 | 13 |
| What did I do with Abuela? | EVENT_QUERY | 6 | **11** | 0 | 18 |
| Who is Andrew? | PERSON_QUERY | — | — | — | — |
| What role did Kelly play? | — | — | — | — | — |
| Tio Juan relation? | — | — | — | — | — |
| Leslie's Graduation? | EVENT_QUERY | — | — | — | — |

*(Full per-question JSON in audit output — run script to reproduce.)*

### Extended questions — utilization gaps

| Question | Expected intent | Actual intent | Projects | Goals | Skills (WMA) |
|----------|-----------------|---------------|----------|-------|--------------|
| What skills do I have? | SKILL_QUERY | LIFE_REVIEW | 0 | 0 | 0 |
| What are my current goals? | GOAL_QUERY | LIFE_REVIEW | 0 | 0 | 0 |
| What projects am I working on? | PROJECT_QUERY | **LIFE_REVIEW** | **0** | 0 | 0 |
| What communities am I part of? | — | LIFE_REVIEW | 0 | 0 | 0 |

**Root cause:** WMA has no `GOAL_QUERY` or `SKILL_QUERY` intent; `PROJECT_QUERY` regex doesn't match "What projects am I working on?" → falls through to `LIFE_REVIEW` which loads generic journal episodes, not projects/goals tables.

---

## What reaches the model

### Path (default, `WORKING_MEMORY_PRIMARY=true`)

```
User question
  → assembleWorkingMemory (20-item budget)
  → buildWorkingMemoryPacket → foundationRecallBlock
  → buildRAGPacket (lore graph, skills, events, dossier)
  → scoreContext (prunes broad lore ~29% avg)
  → buildSystemPrompt (single system message)
  → tokenBudgetService.buildBudgetedHistory
  → LLM
```

### WMA selection by intent

| Intent | Typical retrieval |
|--------|-------------------|
| RELATIONSHIP_QUERY | Household edges (12), person bundle, episodes |
| EVENT_QUERY | Timeline events (4–11), target-matched events |
| PERSON_QUERY | Character memories, facts, relationships |
| PLACE_QUERY | Locations, place-tagged events |
| PROJECT_QUERY | Projects table (6) — **when intent fires** |
| LIFE_REVIEW | Generic journal episodes (11), timeline (9) — **catch-all** |

### What does NOT reach the model

1. **Rejected WMA candidates** — avg 2/question; reason: score < 0.45 or outside 20-item budget
2. **Full `relatedEntries`** — journal semantic search results used for background/essence, not prompt text
3. **Goals table** — no query path in WMA or RAG builder
4. **Communities** — optional RAG block, often scored out
5. **Fresh omega extraction** — async ingestion; not in same-turn prompt
6. **User message wrapper** — current message sent as plain text without inline retrieval

---

## Why users report weak recall

| Symptom | Cause | Evidence |
|---------|-------|----------|
| Generic answers | LIFE_REVIEW catch-all loads journal snippets not targeted facts | Goals/skills/projects questions → same 11 episodes |
| "It forgot X" | Entity not in characters book + not in WM entity resolution | `entities: 0` on many queries |
| Missing relationships | 50% of questions retrieve 0 relationship edges | Non-relationship intents skip household loader |
| Missing events | 60% retrieve 0 events | Intent must be EVENT_QUERY or target match |
| Episodes don't help recall | Zero entity IDs on episodes (prior sprint) | Episode text is time-gap labels |

---

## Recommendations

| Priority | Action | Expected impact |
|----------|--------|-----------------|
| P0 | Add GOAL_QUERY + goals table loader in WMA | Goal questions answered from stored goals |
| P0 | Fix PROJECT_QUERY patterns ("working on", "projects am I") | Project recall works |
| P1 | Add SKILL_QUERY intent routing to skills table in WMA | Skills via WMA not just RAG side channel |
| P1 | Promote entity_ids on messages → episode/participant retrieval | Entity-targeted recall |
| P2 | Surface WMA rejected items in diagnostics UI | User trust / transparency |
| P2 | Log per-turn `ragStats` in SSE metadata client-side | Debug generic responses |

---

## Re-run

```bash
npx tsx apps/server/scripts/chatMemoryUtilizationAudit.ts 2>/tmp/mem-audit.log > /tmp/mem-audit.json
```

API alternative:

```bash
POST /api/diagnostics/working-memory
{ "question": "Who lives with me?" }
```
