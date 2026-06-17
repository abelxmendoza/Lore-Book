# Story-Aware Chat Report

**Sprint:** Story-Aware Chat  
**Date:** 2026-06-16  
**Status:** Complete

## Mission

Make LoreBook answer from **story intelligence first**, not just memory retrieval. No new storage, extraction, or entity systems.

---

## Pipeline (Phase 1)

```
Question
  ↓ classifyIntent() — workingMemoryAssembler
Intent (ARC_QUERY | CHAPTER_QUERY | …)
  ↓ assembleWorkingMemory() — retrieval budget
WMA packet
  ↓ buildRAGPacket()
StoryContext (if isStoryIntent) — storyContextService
  ↓ scoreContext() — pass-through
  ↓ buildSystemPrompt()
STORY CONTEXT block + WORKING MEMORY + response-type rules
  ↓
Model
```

### Injection frequency (founder, 50-question audit)

| Signal | When injected | Rate (story questions) |
|--------|---------------|------------------------|
| **Story context block** | `isStoryIntent(intent)` | **98%** (41/42) |
| **Current chapter** | Inside story block | 98% |
| **Arcs** | Inside story block | 98% |
| **Conflicts** | Inside story block | 100% of conflict questions |
| **Momentum** | Inside story block | 98% |
| **Provenance (WHY)** | Inside story block | 98% |

Non-story queries (person, event, skills, projects) **do not** receive story synthesis — retrieval-only.

---

## Key files

| File | Role |
|------|------|
| `storyContextService.ts` | StoryContext packet + response types |
| `workingMemoryAssembler.ts` | Story intent routing |
| `ragBuilderService.ts` | Conditional story injection |
| `systemPromptBuilder.ts` | STORY CONTEXT in prompt |
| `contextScoringService.ts` | Pass-through guard |

---

## Response type architecture (Phase 5)

| Type | Intents | Prompt rule |
|------|---------|-------------|
| `STORY_RESPONSE` | CHAPTER_QUERY, ARC_QUERY, IDENTITY_QUERY | Lead with chapter + arcs |
| `DIRECTION_RESPONSE` | DIRECTION_QUERY, MOMENTUM_QUERY, GOAL_QUERY | Lead with life direction |
| `INSIGHT_RESPONSE` | CONFLICT_QUERY | Lead with tensions |
| `MEMORY_RESPONSE` | PERSON, PLACE, RELATIONSHIP, EVENT | Lead with retrieved memories |
| `FACT_RESPONSE` | PROJECT, SKILL, COMMUNITY | Lead with concrete facts |

---

## Why do you think that? (Phase 4)

Every story context block includes:

```
**WHY (provenance — cite when explaining story claims):**
I believe your Family Arc is growing because of: …
I believe your LoreBook Arc is growing because of: …
Conflict signal: LoreBook build vs employment (high) — …
```

Model instructed to quote provenance when explaining story claims.

---

## Success criteria

| Question | Mechanism |
|----------|-----------|
| Who am I? | IDENTITY_QUERY → STORY_RESPONSE |
| What chapter am I in? | CHAPTER_QUERY → currentChapter |
| What story am I living? | ARC_QUERY → topArcs |
| Where is life heading? | DIRECTION_QUERY → lifeDirection |
| What conflicts keep repeating? | CONFLICT_QUERY → activeConflicts |

---

## Run audit

```bash
npx tsx apps/server/scripts/storyAwareChatAudit.ts
cd apps/server && npm test -- --run tests/services/storyQueryRouting.test.ts
```
