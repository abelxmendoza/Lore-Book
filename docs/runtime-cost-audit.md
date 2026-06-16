# Runtime Cost Audit

Date: 2026-06-16 · Audit only. Evidence: static analysis of service query patterns (`.from()` call counts, loop constructs) + known read shapes. No profiler was run; figures are structural estimates, flagged where measured vs inferred.

## Method
Per service: count DB round-trips, identify reads vs writes, loops issuing per-item queries (N+1), and whether the service runs **per chat message** (hot path) or **on demand/batch** (cold path). Hot-path cost dominates at scale.

## Per-service findings

### `workingMemoryAssembler` — **HOT PATH (every chat message)** ⚠️ highest scaling risk
- 772 LOC, **19 `.from()` calls**, 17 loop constructs. Invoked from `ragBuilderService` on every user turn.
- **Reads:** assembles entities, events, timeline, relationships per question — multiple sequential queries + per-entity follow-ups (N+1 shape across the 17 loops).
- **Writes:** none (read-only). **Egress:** proportional to retrieved context size, per message.
- **Cost driver:** at N messages/user/day this is the single largest DB-read multiplier. O(entities × queries) per turn.
- **ROI fix (later):** batch the per-entity follow-up queries into `IN (…)` lookups; cache the assembled packet for the turn (it already builds a `workingMemoryPacket`). **Do not** add a new cache system — memoize within the request.

### `relationshipFoundationService.recoverRelationshipGraph` — cold path (debounced) ✅ already throttled
- 836 LOC, **20 `.from()` calls**, 21 loops — the heaviest single service.
- Reads characters + `character_memories` + facts + chat, then **loops over character pairs** → O(n²) in character count for pair evaluation, with per-pair queries (N+1).
- **Writes:** upserts `character_relationships`; observed ~57 UPDATEs per run even when idle (re-touches existing rows).
- **Mitigation already shipped:** `graphRecoveryTrigger` debounces to ≤1 run / 30 min / user (cooldown + pending gate), and only writes diagnostics when the graph grew. This converts a per-message O(n²) hazard into a bounded background cost.
- **Residual:** the ~57 idle UPDATEs/run are write amplification (bounded by cooldown to ~48×57 ≈ 2.7k UPDATEs/user/day). Quick win: skip the UPDATE when no field changed. **Do not rewrite the service** — add a dirty check.

### `eventRecoveryService.recoverMissingEvents` — cold path (debounced) ✅
- 280 LOC, 8 `.from()`, 9 loops. `collectCorpus` reads **up to 800 `chat_messages` + all `conversation_sessions` metadata + up to 2000 `entity_facts`** per run — **~0.5–1 MB egress/run** (measured shape).
- Idempotent (skips existing event titles). Bounded by the same 30-min cooldown.
- **ROI fix (later):** `collectCorpus` re-reads the full corpus every run; scope it to messages since `last_run` instead of `limit(800)`.

### `threadSummaryService` — cheap on DB ✅
- 235 LOC, **0 `.from()` calls** — pure functions + LLM. DB cost is nil; **cost is OpenAI** (see `openai-cost-audit.md`). Staleness-gated, so it doesn't summarize every turn.

### `threadIntelligenceService` — cheap ✅
- 228 LOC, 5 `.from()`, 1 loop. Reads/writes `conversation_sessions.metadata.threadMeta` (single-row upsert per turn). Low cost. Note: 3 of its 6 fields (projects/episodes/open_loops) are unfed (see `dead-code-report.md`).

### `memoryCoverageAudit` — cold path (diagnostics only) ✅
- 209 LOC, 9 `.from()`, 9 loops. Runs only on the `/intelligence` dashboard + scorecard script. Per-entity loops (N+1) but not on any hot path → acceptable.

## DB cost ranking (highest → lowest scaling risk)
1. **`workingMemoryAssembler`** — hot path, per message, 19 queries + N+1. **Top priority.**
2. `relationshipFoundationService` — O(n²) but throttled. Add dirty-check on UPDATEs.
3. `eventRecoveryService` — heavy corpus read but throttled. Scope to delta.
4. `memoryCoverageAudit` — cold, fine.
5. `threadIntelligence` / `threadSummary` — cheap on DB.

## Cross-cutting DB issues (from performance advisor, 649 lints)
- **`auth_rls_initplan` — 281 occurrences.** RLS policies call `auth.uid()` **per row** instead of once. Wrap as `(select auth.uid())`. Affects every query on `chapters`, `people_places`, `event_candidates`, `life_arcs`, `arc_*`. **Highest-ROI DB perf fix** — pure SQL, touches no app code.
- **`multiple_permissive_policies` — 130.** Redundant policy evaluation on the same hot tables. Consolidate (see `security-hardening-report.md` MERGE list).
- **`duplicate_index` — 5** (`extracted_units`, `locations`, `resolved_events`, `skills`, `utterances`): drop one of each — free write-speed + disk win.
- **`unindexed_foreign_keys` — 33**, **`unused_index` — 200** (consider dropping; they slow writes).

## Top-3 ROI (DB)
1. **Wrap `auth.uid()` → `(select auth.uid())`** across RLS policies (281 lints, one migration, no app change).
2. **Batch `workingMemoryAssembler`'s per-entity queries** + per-turn memoize (hot path).
3. **Drop 5 duplicate indexes** + consolidate permissive policies (free wins).
