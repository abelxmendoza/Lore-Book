# Prompt Context Report

**Date:** 2026-06-17  
**Sprint:** Chat Memory Utilization  
**Method:** Prompt assembly trace via `chatMemoryUtilizationAudit.ts` + code audit

---

## Executive Summary

The model receives a **large system prompt (~8,600 tokens avg)** with Working Memory as the authoritative per-question block (~2,800 tokens). Context scoring prunes **~29% of broad lore** but was **silently dropping entity dossier, entity arc, crystallized knowledge, and skills** until fixed in this sprint.

| Metric | Typical value |
|--------|---------------|
| System prompt tokens | ~8,629 |
| Working Memory block | ~2,800 (33% of system) |
| WMA budget | 20 items selected, ~2 rejected |
| Context scoring reduction | ~29% of lore blocks |
| Conversation history budget | Remainder after system (128k–256k window) |

---

## Phase 3 — Prompt Assembly

### Message array sent to LLM

```typescript
[
  { role: 'system', content: finalSystemPrompt },  // ALL retrieved memory
  ...truncatedHistory,                              // prior turns, newest-first fill
  { role: 'user', content: message }               // current message, plain text
]
```

Retrieved memory is **never** appended to the user message — it lives entirely in the system prompt.

### System prompt block order

| Section | Source | Typical size | Scored? |
|---------|--------|--------------|---------|
| Runtime identity + rules | Static | ~2,000 tokens | N/A |
| Recent Timeline Entries | Orchestrator | 20 events shown | Optional |
| **WORKING MEMORY** | WMA packet | ~2,800 tokens | **CORE — never dropped** |
| Known Relationships (WM) | WMA | ≤5 items | CORE |
| Timeline from WM | WMA | ≤5 items | CORE |
| Entity Dossier | RAG per mentioned entity | Variable | **Was dropped — fixed** |
| Entity Continuity Arc | Entity-scoped retrieval | Variable | **Was dropped — fixed** |
| Characters / Locations | Lore graph | ≤25 / ≤20 | Scored (tiers) |
| Episodic Events | `resolved_events` | 8–20 | Scored |
| Confirmed Skills | Skill index | ≤20 | **Was dropped — fixed** |
| Crystallized Knowledge | Claims | ≤6 | **Was dropped — fixed** |
| Knowledge Gaps | Gap detector | Small | **Was dropped — fixed** |
| Essence / Identity | Profile engines | Variable | Scored optional |

---

## Context scoring behavior

**File:** `contextScoringService.ts`

Target: 30–40% token reduction on broad lore blocks.

### Always included (CORE)

- `foundationRecallBlock` / Working Memory packet
- `foundationRelationships`, `foundationTimeline`
- `workingMemory`, `workingMemoryPacket`

### Conditionally included

| Block | Include when |
|-------|--------------|
| Characters | Composite ≥ 0.15 OR entity mentioned |
| Locations | Composite ≥ 0.15 OR place keywords |
| Episodic events | Composite ≥ 0.15 (8–15 cap) |
| Romantic relationships | Entity mentioned in message |
| Workouts/biometrics | Fitness keywords in message |

### Bug fixed (2026-06-17)

These blocks were built by `ragBuilderService` but **not copied** to `filteredLoreData` in `scoreContext()` — effectively **never reaching the model**:

- `entityDossierBlock`
- `entityArcNarrativeBlock`
- `knowledgeGapBlock`
- `crystallizedKnowledge`
- `confirmedSkills`
- `romanticContext`

**Fix:** Pass-through added after Working Memory blocks in `scoreContext()`.

### Typical dropped blocks (expected)

From 20-question audit, commonly excluded (low relevance):

- `romanticRelationships` (when no romantic entity in question)
- `corrections`, `workoutEvents`, `recentBiometrics`
- `topInterests`, `recentInterpretations`

---

## Token budget analysis

### Working Memory Assembler

| Limit | Value |
|-------|-------|
| Max selected items | 20 |
| Relevance floor | score < 0.45 → rejected |
| Journal snippet | 700 chars max |
| Chat snippet | 600 chars max |
| Narrative account | 900 chars max |

### Conversation history (`tokenBudgetService`)

- Reserves 5% for response
- Fills history newest-first until budget exhausted
- Drops oldest turns → triggers async compaction
- Estimate: chars / 4

### Full prompt rarely truncates

At ~8.6k system tokens + history, total usage is well within 128k windows. **Truncation is not the primary recall failure mode** — missing retrieval and intent misrouting are.

---

## Retrieval volume by question type

| Question type | WM items | WM tokens | Entity dossier | Entity arc |
|---------------|----------|-----------|----------------|------------|
| Relationship ("Who lives with me?") | 20 | ~2,988 | Often absent | Absent |
| Event ("Abuela") | 18 | ~4,273 | Present when entity matched | Sometimes |
| Person ("Tell me about Sol") | 13 | ~2,522 | Absent | Present when arc loads |
| Life review ("goals", "skills") | 20 | ~2,363 | Absent | Absent |

**Entity arc loads only when** `isEntityQuery(message)` AND entity name match AND arc exists in DB.

---

## Is retrieved context dropped?

| Layer | Dropped? | Notes |
|-------|----------|-------|
| WMA selected items | ❌ No | CORE in scorer |
| WMA rejected items | ✅ Yes | By design — below threshold/budget |
| Entity dossier/arc | ✅ Was yes | **Fixed this sprint** |
| Skills/crystallized | ✅ Was yes | **Fixed this sprint** |
| relatedEntries (full journal) | ✅ Yes | Never in prompt — background only |
| Scored-out characters | ⚠️ Partial | Stubbed to name-only below 0.40 confidence |

---

## Why responses feel generic

1. **LIFE_REVIEW intent** loads the same 11 journal episodes for unrelated questions (goals, skills, projects)
2. **Entity dossier was dropped** — model lacked verified facts for entity queries (now fixed)
3. **No goals in prompt path** — goal questions get generic journal context
4. **60% of questions get 0 WMA events** — model must infer from episodes/characters
5. **Behavioral prompt dominates** — ~2,000 tokens of instructions vs ~2,800 tokens of memory; model may prioritize style over specificity

---

## Recommendations

| Priority | Action |
|----------|--------|
| P0 | ✅ Pass entity dossier/arc/skills through context scorer (done) |
| P1 | Add prompt token telemetry to SSE metadata (`wmTokens`, `loreTokens`, `historyTokens`) |
| P1 | Weight WORKING MEMORY instruction: "Answer ONLY from this block when applicable" |
| P2 | Reduce static behavioral prompt size — frees budget for memory without truncation |
| P2 | Include rejected WMA summary in debug mode for power users |

---

## Inspection commands

```bash
# Full 20-question prompt trace
npx tsx apps/server/scripts/chatMemoryUtilizationAudit.ts 2>/dev/null > audit.json

# Single question WMA assembly
POST /api/diagnostics/working-memory
{ "question": "What happened with Sol?" }

# Enable context scoring debug logs
LOG_LEVEL=debug npm run dev
# → [ContextScoring] per-block INCLUDE/EXCLUDE decisions
```

---

## Key files

| Concern | Path |
|---------|------|
| WMA assembly | `apps/server/src/services/chat/workingMemoryAssembler.ts` |
| RAG packet | `apps/server/src/services/chat/ragBuilderService.ts` |
| Context scoring | `apps/server/src/services/chat/contextScoringService.ts` |
| System prompt | `apps/server/src/services/chat/systemPromptBuilder.ts` |
| Token budget | `apps/server/src/services/chat/tokenBudgetService.ts` |
| Chat orchestration | `apps/server/src/services/omegaChatService.ts` |
