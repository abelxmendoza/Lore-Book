# Goals & Life Direction Activation Report

**Sprint:** Goals & Life Direction Activation  
**Date:** 2026-06-16  
**Status:** Complete — production schema live, goals retrieving into prompt

## Summary

Goals were fully wired in code but **blocked by a missing production table**. Migration applied, goal worker backfilled 3 records from journal entries, and WMA now surfaces goals on life-direction questions.

---

## Phase 1 — Goals Migration Audit

### Migration file

`supabase/migrations/20250222000065_goal_tracking_engine.sql`

**Note:** An older GVAE migration (`20250102000006_goal_value_alignment_engine.sql`) defines a *different* `goals` schema (uppercase status, `goal_type`, `confidence`). Production uses the **20250222000065** schema, which matches `GoalStorage`, `GoalEngine`, and WMA.

### Schema (applied)

| Table | Key columns |
|-------|-------------|
| `goals` | `title`, `description`, `status` (active/paused/abandoned/completed), `milestones` JSONB, `probability`, `source` (entry/task/arc/manual), `source_id`, `metadata` |
| `goal_insights` | `type` (progress/stagnation/milestone/…), `message`, `related_goal_id`, `confidence` |

### Indexes

- `idx_goals_user_status`
- `idx_goals_user_updated`
- `idx_goals_source`
- `idx_goal_insights_user_goal`, `_user_type`, `_timestamp`

### RLS

Enabled on both tables with per-user SELECT/INSERT/UPDATE/DELETE policies.

### Production state (after apply)

```
Applied via: psql $DATABASE_URL -f supabase/migrations/20250222000065_goal_tracking_engine.sql
```

| Metric | Count |
|--------|-------|
| **Goal rows** | 3 |
| **Goal insight rows** | 4 |
| **Sources** | `entry`: 3 |

| Status | Count |
|--------|-------|
| active | 2 |
| abandoned | 1 |
| completed | 0 |

---

## Phase 2 — Goal Data Inventory

### How goals are created today

| Source | Path | Status |
|--------|------|--------|
| **Journal (entry)** | `GoalEngine` → `GoalExtractor.fromEntries()` → `GoalStorage.saveGoals()` | **Active** — 3 goals backfilled |
| **Tasks** | `GoalExtractor.fromTasks()` via `taskEngineService` | Available when tasks marked as goals |
| **Arcs** | `GoalExtractor.fromArcs()` | Available when arc data present |
| **Manual** | `GoalStorage.saveGoals()` / quest linker | Supported via `source: 'manual'` |
| **Chat** | Indirect — journal/chat content ingested as entries, then extracted | No direct chat→goal write yet |
| **Derived** | `GoalEngine` insights (stagnation, milestones, success_probability) | 4 insights saved |

### Goal worker

```bash
# Single user backfill
npx tsx -e "import { runGoals } from './src/workers/goalWorker.ts'; runGoals('<userId>')"
```

### Fixes applied during activation

- **`GoalStorage.normalizeGoalId()`** — extractor IDs like `goal_entry_<uuid>` coerced to valid UUIDs (uses `source_id`)
- **Insight FK fix** — `related_goal_id` normalized before insert into `goal_insights`

---

## Phase 3 — Goal Query Validation

Audit: `npx tsx apps/server/scripts/goalsActivationAudit.ts`

| Question | Intent | Goals retrieved | In prompt |
|----------|--------|-----------------|-----------|
| What are my goals? | GOAL_QUERY | 2 | ✓ |
| What am I working toward? | GOAL_QUERY | 2 | ✓ |
| What have I abandoned? | GOAL_QUERY | 1 (abandoned filter) | ✓ |
| What matters most? | GOAL_QUERY | 2 | ✓ |

---

## Phase 4 — Goal Utilization Trace

```
goals table
  → loadGoalCandidates() [+ goal_insights for progress/blockers]
  → assembleWorkingMemory() [intent quota: min 3 goals on GOAL_QUERY]
  → buildWorkingMemoryPacket() [**Goals** section]
  → ragBuilderService.foundationRecallBlock
  → scoreContext() [pass-through preserved]
  → buildSystemPrompt()
  → model
```

All four canonical goal questions show `inPrompt=true` with **Goals** section in working memory block.

---

## Phase 5 — Identity / Life Direction Questions

| Question | Intent | Goals in WMA |
|----------|--------|--------------|
| Who am I? | IDENTITY_QUERY | **2** (identity quota) |
| What am I trying to do with my life? | GOAL_QUERY | **2** |
| What matters most to me? | GOAL_QUERY | **2** |
| What should I focus on? | GOAL_QUERY | **2** |

Pattern additions: life-direction phrasing routes to `GOAL_QUERY`; `IDENTITY_QUERY` reserves goal slots in budget.

---

## Phase 6 — Revalidation (before / after)

### chatMemoryUtilizationAudit (22 questions)

| Metric | Before activation | After |
|--------|-------------------|-------|
| Goal retrieval (non-zero rate) | **0%** | **14%** (3/22 — all GOAL_QUERY hits) |
| GOAL_QUERY questions | goal=0 | **goal=2** each |
| Skills | 14% | 14% |
| Projects | 41% | 41% |
| Communities | 9% | 9% |
| Zero-event rate | 23% | 23% |

### lifeReconstructionScore

Re-run: `RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/lifeReconstructionScore.ts`

Verdict unchanged at **YES — significant improvement** (recall benchmarks still pass). Goals add a new memory dimension not previously scored in the harness.

---

## Success criteria

| Criterion | Status |
|-----------|--------|
| Production `goals` + `goal_insights` schema | ✓ Applied |
| Goal rows in DB | ✓ 3 (entry-sourced) |
| Goal queries retrieve real records | ✓ |
| Goals reach model via WM block | ✓ |
| Life-direction questions use goals | ✓ |
| Abandoned goal query works | ✓ |

## Next steps (optional)

1. **Apply migration to Supabase migration history** — track in `supabase_migrations` if using CLI deploy pipeline
2. **Seed richer goals** — run goal worker for all active users; add manual goals via API
3. **Improve extraction quality** — current 3 goals are journal-shaped narratives, not crisp goal titles; tune `GoalExtractor` keywords
4. **Deploy `projects` table** — parallel blind spot for structured project entities (org fallback works today)
5. **Add goals to lifeReconstructionScore** — new weighted component for life-direction recall

## Commands

```bash
# Full goals activation audit
npx tsx apps/server/scripts/goalsActivationAudit.ts

# WMA coverage
npx tsx apps/server/src/scripts/chatMemoryUtilizationAudit.ts

# Backfill goals for founder
npx tsx -e "import './src/config'; import { runGoals } from './src/workers/goalWorker.ts'; runGoals(process.env.OWNER_USER_ID!)"
```
