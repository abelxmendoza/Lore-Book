# Working Memory Assembler Performance Report

**Date:** 2026-06-16  
**Component:** `apps/server/src/services/chat/workingMemoryAssembler.ts`  
**Consumer:** `ragBuilderService.ts` (every chat turn with recall intent)

## Executive Summary

The Working Memory Assembler (WMA) was the largest remaining runtime cost after the Evolution sprint. Each chat turn issued **~15–16 sequential Supabase queries**, including **full-table character and people_places scans** on every targeted question.

This sprint added instrumentation, request-local query deduplication, targeted entity filtering with quality-preserving fallback, parallel candidate loading, and elimination of redundant character fetches — **without changing ranking or retrieval selection logic**.

---

## Phase 1: Trace Results

### `assembleWorkingMemory()` breakdown (typical PERSON_QUERY)

| Phase | Before | After |
|-------|--------|-------|
| Entity resolution | ~5 queries (sequential batch) | ~5 queries (same batch, filtered scans) |
| Person candidates | ~5 queries (after entity phase) | ~4 queries (parallel with textual) |
| Textual candidates | ~6 queries (after person phase) | ~6 queries (parallel with person) |
| Ranking | in-process (~1ms) | in-process (~1ms) |
| **Total DB queries** | **16** | **15** |
| **Wall-clock DB phases** | **sequential (~16 RTTs)** | **parallel (~11 RTTs)** |

Timing is now exposed on every assembly via `result.timing`:

```typescript
{
  totalMs: number;
  entityResolutionMs: number;
  candidateGenerationMs: number;
  rankingMs: number;
  queryCount: number;       // uncached DB round-trips only
  queries: WmaQueryRecord[]; // per-table purpose, ms, rowCount, cached flag
}
```

---

## Phase 2: Query Inventory (Before)

| # | Table | Purpose | Required | Duplicate | Cacheable |
|---|-------|---------|----------|-----------|-----------|
| 1 | `characters` | Full user scan for name/alias match | Yes | **Yes** (protagonist path) | Per-request |
| 2 | `locations` | Target ilike | Yes | No | Per-request |
| 3 | `organizations` | Target ilike | Yes | No | Per-request |
| 4 | `people_places` | Full user scan | Yes | No | Per-request |
| 5 | `projects` | Target ilike (resolve) | Yes | Partial (textual also hits projects) | Per-request |
| 6 | `character_memories` | Person depth | Conditional | No | Per-request |
| 7 | `character_timeline_events` | Person events | Conditional | No | Per-request |
| 8 | `character_relationships` | Person edges | Conditional | No | Per-request |
| 9 | `entity_facts` | Person facts | Conditional | No | Per-request |
| 10 | `characters` | maybeSingle for person record | Conditional | **Yes** (row already in #1) | Per-request |
| 11 | `journal_entries` | Recent episodes | Yes | No | Per-request |
| 12 | `chat_messages` | Thread or target match | Yes | No | Per-request |
| 13 | `character_timeline_events` | Recent timeline | Yes | No | Per-request |
| 14 | `character_timeline_events` | Event target search | EVENT_QUERY only | No | Per-request |
| 15 | `projects` | Recent projects (textual) | Yes | Partial (#5) | Per-request |
| 16 | `narrative_accounts` | Biography context | Yes | No | Per-request |

---

## Phase 3: Entity Scan Audit

### `resolveTargetEntities()` — before

| Scan | Pattern | Growth impact |
|------|---------|---------------|
| `characters` | `SELECT * WHERE user_id = ?` (no name filter) | **O(all characters)** — full table per query |
| `people_places` | `SELECT * WHERE user_id = ?` (no filter) | **O(all people_places)** |
| `locations`, `organizations`, `projects` | ilike on target | O(matches) — bounded |

Client-side fuzzy matching on normalized names ran over **every returned row**.

### After

| Scan | Pattern | Fallback |
|------|---------|----------|
| `characters` | `.or(name.ilike.%token%)` per target tokens | Full scan if zero client matches (alias-only edge cases) |
| `people_places` | `.or(name.ilike.%token%)` | Full scan if zero exact normalized matches |
| Other tables | unchanged | — |

**Quality preserved:** fallback to full scan when filtered query misses alias-only or edge-case matches. Same client-side `characterMatchesTarget()` / `peoplePlaceMatchesTarget()` logic unchanged.

---

## Phase 4: Optimizations Implemented

| Optimization | Type | Queries saved | Latency impact |
|--------------|------|---------------|----------------|
| `WmaRequestScope` request-local cache | Memoization | 1–2 per assemble | Eliminates duplicate RTTs |
| Reuse character row in `loadPersonCandidates` | Duplicate elimination | 1 on person queries | ~1 RTT |
| Share `characters:all` between resolve fallback + protagonist | Cache reuse | 1 on household+resolve overlap | ~1 RTT |
| Target-filtered character/people_places queries | Targeted filtering | 0 queries; fewer rows scanned | Lower DB load at scale |
| Parallel `loadPersonCandidates` + `loadTextualCandidates` | Parallelization | 0 queries | ~max(4,6) RTTs instead of 10 sequential |
| Per-query timing instrumentation | Observability | — | Enables ongoing measurement |

**Not changed:** ranking weights, budget selection, intent classification, candidate scoring, packet format.

---

## Phase 5: Quality Verification

All **17 existing WMA tests pass** unchanged, covering:

- Person queries (Alex, Sam Chen, Grandma Rose, Tio Juan)
- Place queries (Blue Room, Costco)
- Project queries (LifeLedger)
- Event queries (Morgan Gray graduation)
- Organization vs person disambiguation (Amazon)
- Budget/ranking behavior
- Packet text format

New tests verify query-count reduction and timing presence without altering recall assertions.

---

## Phase 6: Before / After

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| DB queries (PERSON_QUERY) | 16 | 15 | **−1** |
| DB queries (household) | 8 | 8 | 0 (1 char query, cached if overlap) |
| Character table accesses (person query) | 2 | **1** | **−50%** |
| Sequential candidate phases | 2 | **1 parallel** | **~40% wall-time reduction** |
| Full character table scans (typical) | Always | **Filtered** (fallback rare) | Lower row scan at scale |
| Full people_places scans (typical) | Always | **Filtered** (fallback rare) | Lower row scan at scale |
| Instrumentation | None | Full per-query timing | — |

---

## Remaining Hotspots (P2)

| Issue | Impact | Notes |
|-------|--------|-------|
| `projects` queried twice (resolve ilike + textual limit 6) | 2 queries | Different filters; merging risks retrieval change |
| `character_timeline_events` twice on EVENT_QUERY | 2 queries | Different sort/filter semantics |
| No cross-request cache (Redis/TTL) | Repeat questions re-hit DB | Safe future optimization |
| Protagonist path still needs full character list | 1 full scan | Required to find "me" / protagonist |

---

## Related Docs

- [wma-query-map.md](./wma-query-map.md) — exact query flow per intent
- [wma-optimization-results.md](./wma-optimization-results.md) — change log and metrics
