# Scaling Hotspots

Date: 2026-06-16 · Audit only. The few places that break first as users/messages grow. Ranked by blast radius.

## The hot path is the whole story
Cost at scale = (per-message work) × (messages). Anything on the **chat ingest path** or the **chat retrieval path** multiplies by total message volume. Everything else is rounding error. The audit therefore ranks by "does this run per message?"

## Hotspot ranking

| # | Hotspot | Trigger | Complexity | Breaks at | Mitigation status |
|---|---|---|---|---|---|
| 1 | **`workingMemoryAssembler`** (retrieval) | every chat turn | 19 queries + N+1 per-entity, O(entities × queries) | high message volume × entity-rich users | ❌ not optimized — **top priority** |
| 2 | **Per-message OpenAI fan-out** (ingest) | every chat turn | multiple sequential LLM calls/turn (extraction, normalization, transition, knowledge-type, emotion) | OpenAI TPM/RPM quota → 429 | ⚠️ partial (hybrid router); see `openai-cost-audit.md` |
| 3 | **`relationshipFoundationService`** (recovery) | debounced/30min | O(n²) char-pairs + N+1 | users with many characters | ✅ throttled by `graphRecoveryTrigger` |
| 4 | **`eventRecoveryService.collectCorpus`** (recovery) | debounced/30min | reads 800 msgs + all sessions + 2000 facts/run | corpus growth × active users | ✅ throttled; ⚠️ re-reads full corpus |
| 5 | **RLS `auth.uid()` per-row** (all queries) | every query | 281 policies re-eval per row | large tables under load | ❌ pure-SQL fix available |
| 6 | **Background workers** (`memoryExtraction`, `groupDetection`, continuity, decay jobs) | cron / 15-min cycles | "all active users" loops | user-count growth (currently 2) | ⚠️ fine now; watch the "all active users" fan-out |

## Single points of failure
- **OpenAI quota** — already hitting `429` on `societyResolver` (Railway logs). At scale the per-message LLM fan-out (#2) is the hard ceiling. This is the **first thing that breaks** and it already is. Mitigation = reduce calls/message (Phase 4) + raise quota.
- **Service-role key** — one key, full DB access, used by all backend queries. Not a scaling limit but a reliability/security SPOF (see security report S10).
- **In-memory state** — `graphRecoveryTrigger` cooldowns, embedding LRU cache, and any per-process memoization are **single-instance**. If Railway scales to >1 instance, cooldowns won't coordinate (recovery could run per-instance) and caches won't share. Note before horizontal scaling.

## What is NOT a hotspot (don't optimize)
- `threadSummaryService`, `threadIntelligenceService` — cheap, gated.
- `memoryCoverageAudit` — diagnostics only.
- The 200 unused indexes — a write-speed paper-cut, not a scaling wall.

## The three fixes that buy the most headroom
1. **Cut per-message OpenAI calls** (#2) — directly addresses the active 429 ceiling. Highest ROI.
2. **Batch + memoize `workingMemoryAssembler`** (#1) — removes the per-message N+1 query multiplier.
3. **`(select auth.uid())` RLS rewrite** (#5) — one migration, speeds every query under load.

Before horizontal scaling: externalize the in-memory cooldown/cache state (or accept per-instance duplication).
