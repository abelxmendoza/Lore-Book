# Working Memory Completion Report

**Sprint:** Working Memory Completion & Query Intelligence — Phases 2–5  
**Date:** 2026-06-16

## Goal

Make goals, projects, skills, and communities enter Working Memory Assembly (WMA) with intent-aware retrieval — not `LIFE_REVIEW` journal fallbacks.

## Implementations

### GOAL_QUERY (Phase 2)

- Fixed **schema mismatch** in `loadGoalCandidates()` — was selecting non-existent columns (`goal_type`, `target_timeframe`, `confidence`) causing silent query failure
- Now loads: `title`, `description`, `status`, `milestones`, `probability`, `last_action_at`, `metadata`
- Joins **`goal_insights`** for progress, stagnation, dependency blockers
- Prompt sections: active / stalled / completed goals with progress + blocker text
- **Journal fallback** when `goals` table empty/missing
- Intent quota: minimum 3 goal items in budget when `GOAL_QUERY`

### PROJECT_QUERY (Phase 3)

- Fixed routing (`projects?` plural patterns)
- Dedicated **`loadProjectCandidates()`** with milestones/blockers from metadata
- **Fallback** when `projects` table missing: `organizations` (bootcamp/building mentions) + `journal_entries` (LoreBook/LifeLedger/project language)
- Intent quota: minimum 3 project items

### SKILL_QUERY (Phase 4)

- Fixed skills query — removed non-existent `proficiency_level` column
- Orders by `practice_count`; surfaces professional vs hobby via `skill_category`
- Intent quota: minimum 3 skill items
- Result: **3 skills retrieved** on all SKILL_QUERY test questions

### COMMUNITY_QUERY (Phase 5 — new)

- New intent + `community` item type
- **`loadCommunityCandidates()`**: `social_communities` + **`organizations`** (Los Goths, Tía Grace's Household, My Family, etc.)
- Prompt section: **Communities** in working memory packet
- Intent quota: minimum 3 community items
- Result: **3 communities** on COMMUNITY_QUERY test questions

### Intent-aware budget

- `INTENT_QUOTA` boosts relevance and reserves slots for intent-matching types
- Prevents journal episodes from crowding out goals/skills/projects/communities

## Coverage audit (founder account)

Run: `npx tsx apps/server/src/scripts/chatMemoryUtilizationAudit.ts`

| Memory class | Before (approx) | After | Notes |
|--------------|-----------------|-------|-------|
| Query routing | ~50% misrouted to LIFE_REVIEW | **100%** on canonical set | See query-intelligence-report |
| Skills | 0% via WMA | **100%** on SKILL_QUERY questions | 3 skills each |
| Projects | 0% | **100%** on PROJECT_QUERY questions | 11 items via org/journal fallback |
| Communities | 0% | **100%** on COMMUNITY_QUERY questions | 3 org-based communities |
| Goals | 0% | **0%** | **Storage gap**: `goals` table not deployed; no journal goal mentions |
| Events (zero-rate) | ~60% | **23%** | `resolved_events` + temporal intent patterns |
| Relationships (zero-rate) | ~50% | **50%** | Person-specific queries correctly return 0 when no edge exists |

## Storage gaps (not routing)

| Table | Production status | Impact |
|-------|-------------------|--------|
| `goals` | **Missing** | Goal queries classify correctly but return 0 until migration applied |
| `projects` | **Missing** | Fallback to organizations + journal works |
| `social_communities` | Empty | Organizations carry community retrieval |
| `skills` | 3 rows | Working |

## Files changed

- `apps/server/src/services/chat/workingMemoryAssembler.ts` — primary implementation
- `apps/server/src/services/chat/contextScoringService.ts` — topic keywords for goals/skills/projects
- `apps/server/scripts/queryClassificationAudit.ts` — new
- `apps/server/src/scripts/chatMemoryUtilizationAudit.ts` — communities counter
- `apps/server/scripts/chatMemoryUtilizationAudit.ts` — goals/skills/projects/communities metrics
