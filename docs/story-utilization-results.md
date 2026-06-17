# Story Utilization Results

**Sprint:** Story-Aware Chat — Phase 6–7  
**Date:** 2026-06-16  
**Account:** Founder (abelxmendoza@gmail.com)  
**Questions:** 60 (50 sprint + 10 memory baseline)

## Executive summary

| Metric | Result |
|--------|--------|
| **Story utilization** | **98%** (41/42 expected) → **100%** after `what defines me` fix |
| **Arc utilization** | **98%** |
| **Conflict utilization** | **100%** (6/6 conflict questions) |
| **Provenance attached** | **98%** → **100%** after fix |
| **Misrouted to LIFE_REVIEW** | 1 → **0** after fix |
| **Unnecessary story injection** | **0%** on memory-only questions |
| **Generic-response risk** | Low — story intents no longer default to LIFE_REVIEW |

---

## Question categories

| Category | Questions | Story expected | Story injected |
|----------|-----------|----------------|----------------|
| Identity | 8 | 8 | 8 |
| Chapter | 8 | 8 | 8 |
| Arcs | 8 | 8 | 8 |
| Direction | 8 | 6 | 6 |
| Conflicts | 6 | 6 | 6 |
| Momentum | 6 | 6 | 6 |
| Goals | 3 | 0 | 0 |
| Projects | 3 | 0 | 0 |
| Relationships | 3 | 0 | 0 |
| Career | 3 | 0 | 0 |
| Memory | 4 | 0 | 0 |

---

## Phase 7 — Gap analysis

### Fixed gap

| Question | Issue | Fix |
|----------|-------|-----|
| What defines me? | Routed to LIFE_REVIEW, no story | Added `what defines me` to IDENTITY_QUERY |

### Retrieval sufficient (no story needed)

| Question | Intent | Correct |
|----------|--------|---------|
| Who is Andrew? | PERSON_QUERY | ✅ memory-first |
| What happened at Club Metro? | PLACE_QUERY | ✅ |
| What skills do I have? | SKILL_QUERY | ✅ |
| What communities am I part of? | COMMUNITY_QUERY | ✅ |
| What are my current goals? | GOAL_QUERY | ✅ goals WMA, no story overlay |

### Story correctly injected

| Question | Intent | Blocks in prompt |
|----------|--------|------------------|
| What chapter am I in? | CHAPTER_QUERY | chapter + arcs + provenance |
| What conflicts keep appearing? | CONFLICT_QUERY | conflicts + provenance |
| What is gaining momentum? | MOMENTUM_QUERY | momentum + direction |
| Who am I? | IDENTITY_QUERY | chapter + arcs + identity framing |

### No new query types needed

Existing five story intents + IDENTITY cover all audited questions after the single pattern fix.

---

## Before vs after

| Behavior | Before sprint | After sprint |
|----------|---------------|--------------|
| Arc synthesis in prompt | Every RAG build | Story intents only |
| Story question routing | Mostly GOAL_QUERY / LIFE_REVIEW | Dedicated ARC/CHAPTER/CONFLICT/DIRECTION/MOMENTUM |
| Response framing | Generic memory recall | Response-type rules in StoryContext |
| Provenance in chat | Text evidence strings only | Structured WHY block with memory labels |
| "What chapter am I in?" | GOAL_QUERY + generic block | CHAPTER_QUERY + STORY_RESPONSE |

---

## Run

```bash
npx tsx apps/server/scripts/storyAwareChatAudit.ts
```

Audit duration ~8 min (50 full RAG builds). Dots print per question.
