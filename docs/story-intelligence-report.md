# Story Intelligence Report

**Sprint:** Life Arc & Story Intelligence — Full Pipeline  
**Date:** 2026-06-16  
**Status:** Complete — narrative synthesis active in chat prompt

## Mission

Turn memory into narrative using **existing** retrieval systems. No new extraction. No new storage.

LoreBook now answers story-level questions with evidence-backed synthesis rather than isolated facts.

---

## Architecture

```
journal_entries ─┐
goals ───────────┤
organizations ───┼──► lifeArcSynthesisService ──► lifeArcSynthesisBlock
resolved_events ─┤         │                              │
relationships ───┤         ├─ signal inventory            ▼
life_arcs ───────┘         ├─ candidate arcs      systemPromptBuilder
                           ├─ momentum                  │
                           ├─ current chapter           ▼
                           ├─ conflicts            Chat model
                           └─ life direction
```

### Key files

| File | Role |
|------|------|
| `apps/server/src/services/continuityRuntime/arcs/lifeArcSynthesisService.ts` | Synthesis engine |
| `apps/server/src/services/chat/ragBuilderService.ts` | Invokes synthesis per turn |
| `apps/server/src/services/chat/systemPromptBuilder.ts` | Injects `**LIFE ARC SYNTHESIS**` block |
| `apps/server/src/services/chat/contextScoringService.ts` | Pass-through guard |
| `apps/server/src/services/chat/workingMemoryAssembler.ts` | Story question intent routing |
| `apps/server/scripts/lifeArcSynthesisAudit.ts` | Validation script |

---

## Phase coverage

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 Arc signal inventory | `life-arc-detection-report.md` | ✅ |
| 2 Arc detection | Rule-based + `life_arcs` rows | ✅ |
| 3 Arc momentum | growing / stable / declining / completed | ✅ |
| 4 Current chapter | Narrative + evidence | ✅ |
| 5 Conflict detection | goal / project / relationship / time | ✅ |
| 6 Life direction | moving toward, fading, attention | ✅ |
| 7 Reconstruction validation | Audit + prompt utilization | ✅ |
| 7 UI readiness | `arc-ui-readiness.md` (design only) | ✅ |

---

## Momentum model (Phase 3)

Per arc, compare journal mentions in last 30d vs prior 30d:

| Condition | Momentum |
|-----------|----------|
| 1–2 mentions in 30d, no prior baseline | **emerging** |
| Recent > prior + 1 | **growing** |
| Recent = 0, older exists | **declining** |
| Recent > 0, flat | **stable** |
| Goal marked completed | **completed** |
| Sparse | **declining** |

Founder snapshot: **5/5 detected arcs = growing**, none declining.

---

## Story question routing (Phase 7)

WMA `GOAL_QUERY` patterns extended for:

- "what chapter of life"
- "what story am I living"
- "what is changing"

### Validation results (founder)

| Question | Intent | Goals in WMA | Arc block in prompt |
|----------|--------|--------------|---------------------|
| What chapter of life am I in? | GOAL_QUERY | 2 | yes |
| What story am I living? | GOAL_QUERY | 2 | yes |
| What is changing? | GOAL_QUERY | 2 | yes |
| What matters most right now? | GOAL_QUERY | 2 | yes |
| Where is life moving? | GOAL_QUERY | 2 | yes |
| What is gaining momentum? | LIFE_REVIEW | 0 | yes |
| What deserves attention? | LIFE_REVIEW | 0 | yes |

**7/7** story questions receive arc synthesis block (~2096 chars).  
**5/7** also retrieve goals via WMA (momentum/attention questions route to LIFE_REVIEW).

---

## Baseline vs arc-enabled LoreBook

| Dimension | Before | After |
|-----------|--------|-------|
| Story coherence | Isolated facts from WMA slots | Named arcs + chapter narrative |
| Chapter accuracy | Biography era label only | Multi-arc synthesis with evidence |
| Goal awareness | Goals in WMA for GOAL_QUERY | Goals + arc conflicts + direction |
| Identity accuracy | Entity dossiers | Domain signal inventory + arc categories |

### Limitations

- `life_arcs` table empty — arcs are **inferred**, not persisted
- Relationship arc under-detected when romantic keywords sparse in 90d window
- LIFE_REVIEW questions get arc block but not goal quota — acceptable; arc block carries goal conflicts
- Python bridge / `engine_results` errors during full RAG audit are non-fatal

---

## Success criteria

LoreBook can now answer with memory evidence:

| Question | Mechanism |
|----------|-----------|
| "What chapter of life am I in?" | `currentChapter.narrative` |
| "What story am I living?" | `candidateArcs` + signal inventory |
| "What is changing?" | momentum labels + life direction |
| "What matters most right now?" | `deservesAttention` + conflicts |

---

## Run audit

```bash
# Fast: synthesis + cross-account (founder + developer if present)
npx tsx apps/server/scripts/lifeArcSynthesisAudit.ts

# Full: includes RAG/prompt validation per story question
npx tsx apps/server/scripts/lifeArcSynthesisAudit.ts --full-rag
```

See also: [`arc-ui-readiness.md`](arc-ui-readiness.md) for Phase 7 UI design.
