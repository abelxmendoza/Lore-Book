# Story Query Routing Report

**Sprint:** Story-Aware Chat — Phase 2  
**Date:** 2026-06-16

## New intents

| Intent | Example questions | Response type |
|--------|-------------------|---------------|
| `CHAPTER_QUERY` | "What chapter am I in?" | STORY_RESPONSE |
| `ARC_QUERY` | "What stories am I living?" | STORY_RESPONSE |
| `CONFLICT_QUERY` | "What conflicts keep appearing?" | INSIGHT_RESPONSE |
| `DIRECTION_QUERY` | "Where is my life heading?" | DIRECTION_RESPONSE |
| `MOMENTUM_QUERY` | "What is gaining momentum?" | DIRECTION_RESPONSE |

`IDENTITY_QUERY` remains for "Who am I?" — now triggers story injection.

Story patterns **removed** from `GOAL_QUERY` (goals-only retrieval).

---

## Pattern priority (first match wins)

1. DEBUG_QUERY  
2. CHAPTER_QUERY  
3. CONFLICT_QUERY  
4. MOMENTUM_QUERY  
5. DIRECTION_QUERY  
6. ARC_QUERY  
7. GOAL_QUERY  
8. … (existing intents)  
9. Default: `LIFE_REVIEW`

---

## Founder audit — intent distribution (42 story questions)

| Intent | Count |
|--------|-------|
| ARC_QUERY | 9 |
| CHAPTER_QUERY | 8 |
| IDENTITY_QUERY | 6 |
| DIRECTION_QUERY | 6 |
| CONFLICT_QUERY | 6 |
| MOMENTUM_QUERY | 6 |
| LIFE_REVIEW | 1 (gap — fixed) |

**Misroute rate:** 1/42 → fixed by adding `what defines me` to IDENTITY_QUERY.

---

## Routing examples

| Question | Intent | Story injected |
|----------|--------|----------------|
| What chapter am I in? | CHAPTER_QUERY | yes |
| What stories am I living? | ARC_QUERY | yes |
| What conflicts keep appearing? | CONFLICT_QUERY | yes |
| Where is my life heading? | DIRECTION_QUERY | yes |
| What is gaining momentum? | MOMENTUM_QUERY | yes |
| Who am I? | IDENTITY_QUERY | yes |
| Who is Andrew? | PERSON_QUERY | no |
| What are my current goals? | GOAL_QUERY | no |
| What skills do I have? | SKILL_QUERY | no |

---

## `isStoryIntent()` set

```typescript
ARC_QUERY | CHAPTER_QUERY | CONFLICT_QUERY | DIRECTION_QUERY | MOMENTUM_QUERY | IDENTITY_QUERY
```

Only these intents trigger `buildStoryContext()` in RAG.
