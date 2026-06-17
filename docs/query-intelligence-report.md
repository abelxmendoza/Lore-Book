# Query Intelligence Report

**Sprint:** Working Memory Completion & Query Intelligence — Phase 1  
**Date:** 2026-06-16

## Goal

Audit how incoming chat questions are classified and identify misroutes into `LIFE_REVIEW` when specialized intents should fire.

## Method

`npx tsx apps/server/scripts/queryClassificationAudit.ts` — 18 canonical questions with expected intents.

## Results

**Classification accuracy: 18/18 (100%)**

| Expected intent | Actual | Count |
|-----------------|--------|-------|
| GOAL_QUERY | GOAL_QUERY | 3 |
| PROJECT_QUERY | PROJECT_QUERY | 3 |
| SKILL_QUERY | SKILL_QUERY | 3 |
| COMMUNITY_QUERY | COMMUNITY_QUERY | 3 |
| RELATIONSHIP_QUERY | RELATIONSHIP_QUERY | 2 |
| PERSON_QUERY | PERSON_QUERY | 1 |
| EVENT_QUERY | EVENT_QUERY | 1 |
| LIFE_REVIEW | LIFE_REVIEW | 1 |
| IDENTITY_QUERY | IDENTITY_QUERY | 1 |

## Before → After (key misroutes fixed)

| Question | Before | After |
|----------|--------|-------|
| What projects am I working on? | LIFE_REVIEW | **PROJECT_QUERY** |
| What are my current goals? | LIFE_REVIEW (intent sometimes OK, retrieval 0) | **GOAL_QUERY** |
| What skills do I have? | LIFE_REVIEW / generic | **SKILL_QUERY** |
| What communities am I part of? | LIFE_REVIEW | **COMMUNITY_QUERY** |
| Summarize what you know about my family | LIFE_REVIEW | **RELATIONSHIP_QUERY** |
| What happened last summer? | LIFE_REVIEW | **EVENT_QUERY** |

## Root causes (pre-fix)

1. **`PROJECT_QUERY` regex used `\bproject\b`** — did not match plural "projects"
2. **`LIFE_REVIEW` ranked too early** — broad "recently/lately" patterns stole specialized questions
3. **No `COMMUNITY_QUERY` intent** — community questions fell through to catch-all
4. **Family phrasing** not in `RELATIONSHIP_QUERY` patterns

## Changes

- Reordered `INTENT_RULES` — specialized intents before `LIFE_REVIEW`
- Expanded patterns for goals, skills, projects (plural), communities, family, temporal events
- Added `COMMUNITY_QUERY` to `WorkingMemoryIntent`
- Exported `classifyIntentForAudit()` for regression testing

## Remaining routing notes

- Mode router (`FOUNDATION_RECALL`, `MEMORY_RECALL`) is separate from WMA intents; with `WORKING_MEMORY_PRIMARY=true` (default), WMA is authoritative for packet assembly
- RAG `intentRouter` (factual/temporal/relational) controls hybrid retrieval weights — orthogonal to WMA intent labels
