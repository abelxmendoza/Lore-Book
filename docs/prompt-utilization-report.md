# Prompt Utilization Report

**Sprint:** Working Memory Completion — Phase 7  
**Date:** 2026-06-16

## Pipeline trace

```
assembleWorkingMemory()
  → buildWorkingMemoryPacket()
  → ragBuilderService.foundationRecallBlock
  → scoreContext()  [foundationRecallBlock pass-through preserved]
  → buildSystemPrompt()
  → model
```

## Measurements (20-question full pipeline audit)

| Metric | Value |
|--------|-------|
| WM block in prompt | **Yes** (`wmInPrompt: true` on all traced questions) |
| Avg WMA items selected | ~20 / 20 budget |
| Avg WM block tokens | ~2,400 |
| Avg system prompt tokens | ~8,800 |
| Context scoring reduction | ~28% token compression |
| `confirmedSkills` in scored lore | Present when skills exist in RAG path |

## Retrieved → prompt verification

| Memory class | Enters WMA packet section | Survives scoring | Reaches model |
|--------------|---------------------------|------------------|---------------|
| Goals | **Goals** section | Pass-through via `foundationRecallBlock` | Yes (when data exists) |
| Projects | **Projects** section | Pass-through | Yes |
| Skills | **Skills** section + RAG `confirmedSkills` | Both paths | Yes (WMA quota ensures packet inclusion) |
| Communities | **Communities** section (new) | Pass-through | Yes |
| Relationships | **Relationships** section | Pass-through | Yes |
| Events | **Events** + timeline | Pass-through | Yes |
| Entity dossier/arc | RAG blocks | Pass-through (prior sprint fix) | Yes when present |

## Unused retrieval / drops

Context scoring **excludes** (typical run):

- `romanticRelationships` — when message has no romantic keywords
- `corrections`, `workoutEvents`, `recentBiometrics`, `topInterests`, `recentInterpretations` — low relevance to recall questions

These are intentional OPTIONAL blocks — not working-memory packet content.

## Duplication note

Skills may appear in both:

1. WMA **Skills** section (intent-quota guaranteed on SKILL_QUERY)
2. RAG **CONFIRMED SKILLS** block from `skillIndexService`

Both reach the model. Future optimization: dedupe when `intent === 'SKILL_QUERY'` and WMA skills are non-empty.

## Token allocation (specialized queries)

Example: `What projects am I working on?`

- Intent: `PROJECT_QUERY`
- WMA selected: 11 project items (org + journal fallback)
- WM block includes **Projects** section with structured status/milestone text
- Episodes deprioritized by intent quota — projects no longer crowded out by generic journal snippets

Example: `What communities am I part of?`

- Intent: `COMMUNITY_QUERY`
- WMA selected: 3 community items (organizations)
- WM block includes **Communities** section with Los Goths, My Family, etc.

## Revalidation

Re-run after changes:

```bash
npx tsx apps/server/scripts/chatMemoryUtilizationAudit.ts
npx tsx apps/server/src/scripts/chatMemoryUtilizationAudit.ts
```

Compare `intent`, `retrieved.*` counts, `prompt.wmInPrompt`, and `prompt.wmBlockTokens` per question in JSON output.
