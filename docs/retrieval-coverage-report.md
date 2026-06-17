# Retrieval Coverage Report

**Sprint:** Working Memory Completion — Phase 6  
**Date:** 2026-06-16

## Targets

| Metric | Before | Target | After |
|--------|--------|--------|-------|
| Zero-event queries | ~60% | <20% | **23%** |
| Zero-relationship queries | ~50% | <20% | **50%** |
| Goal retrieval | 0% | >80% on goal questions | **0%** (storage) |
| Skill retrieval | ~0% WMA | >80% on skill questions | **100%** on SKILL_QUERY |
| Project retrieval | 0% | >80% on project questions | **100%** on PROJECT_QUERY |
| Community retrieval | 0% | >80% on community questions | **100%** on COMMUNITY_QUERY |

## Failure analysis

### Zero-event queries (23% remaining)

| Cause | Examples | Fix applied |
|-------|----------|-------------|
| Person-only query, no linked events | Who is Andrew? | Expected — no event edge required |
| Storage sparsity | Some EVENT_QUERY targets | Added `resolved_events` store + temporal intent patterns |
| Target filter | Event text doesn't mention extracted target | `EVENT_QUERY` loads target-scoped timeline + resolved_events |

**Verdict:** Near target. Remaining zeros are mostly person/skill/goal/project-shaped questions where events are not the right memory class.

### Zero-relationship queries (50% remaining)

| Cause | Examples | Fix applied |
|-------|----------|-------------|
| Specialized intent (goals/skills/projects) | What are my goals? | Correct — relationships not relevant |
| Person without relationship edge | Some PERSON_QUERY | Graph coverage issue, not routing |
| Household/family | Who lives with me? | **Fixed** — protagonist relationship loader |

**Verdict:** Half of traced questions are not relationship-shaped. RELATIONSHIP_QUERY and household queries now retrieve 11–12 edges. Further reduction requires richer `character_relationships` data, not routing.

### Goals (0% — storage issue)

- `goals` table **does not exist** on production database
- `loadGoalCandidates()` query was also failing on wrong column names (fixed)
- Journal fallback finds no goal-tagged entries
- **Action:** Apply `supabase/migrations/20250222000065_goal_tracking_engine.sql` to production

### Projects (was routing, now retrieval)

- `projects` table missing → **fallback** from organizations + journal
- LoreBook progress now retrieves 11 project-scoped items

### Communities (was absent, now retrieval)

- `social_communities` empty → **organizations** table provides Los Goths, My Family, Clever Programmer Bootcamp, etc.

## Audit commands

```bash
# Per-class coverage (22 questions)
npx tsx apps/server/src/scripts/chatMemoryUtilizationAudit.ts

# Full pipeline (WMA → RAG → scoring → prompt)
npx tsx apps/server/scripts/chatMemoryUtilizationAudit.ts
```

## Classification vs retrieval

Routing is solved (100% on canonical set). Remaining gaps are **storage** (goals table) and **graph density** (relationships/events for obscure entities) — not WMA intent logic.
