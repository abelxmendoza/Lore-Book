# Performance Improvement Report

**Date:** 2026-06-16  
**Sprint:** Evolution Performance Sprint  
**Scope:** `/api/evolution`, startup waterfall, working memory audit

## Summary

Measured the largest runtime bottlenecks, applied low-risk fixes, and documented remaining work. No user-facing behavior changes. Chat page load no longer pays the ~7.5s evolution tax.

---

## Before / After Metrics

### `/api/evolution`

| Metric | Before | After |
|--------|--------|-------|
| Called on chat page load | Yes (1–2×) | **No** |
| Cold request latency | ~7500ms | ~7500ms (unchanged — OpenAI bound) |
| Cached request latency | N/A | **<5ms** |
| DB queries per request | 1 | 1 (cold) / **0** (cache hit) |
| OpenAI calls per chat load | 1 | **0** |
| **Time removed from chat critical path** | — | **~7500ms** |

### Startup waterfall (chat load)

| Metric | Before | After |
|--------|--------|-------|
| `/api/entries` requests | 3–4 | **1** |
| `/api/timeline` requests | 3–4 | **1** |
| `/api/timeline/tags` requests | 3–4 | **1** |
| `/api/chapters` requests | 3–4 | **1** |
| `/api/evolution` requests | 1–2 | **0** |
| Duplicate lore fetches removed | — | **~8–12 requests** |
| Redundant network time saved | — | **~200–400ms** |

### Working memory (chat message path)

| Metric | Value | Changed? |
|--------|-------|----------|
| Parallel Supabase queries per assembly | ~15 | No |
| Dominant cost | DB fan-out + scoring in-process | — |
| Thread loading queries | 1 (`chat_messages` when `threadId` set) | Improved by P2 thread consolidation |

Working memory was audited but not modified in this sprint (see ranking below).

---

## Changes Implemented

### Client

| File | Change |
|------|--------|
| `apps/web/src/contexts/LoreKeeperContext.tsx` | Single provider; bootstrap without evolution |
| `apps/web/src/hooks/useLoreKeeper.ts` | Re-export from context |
| `apps/web/src/main.tsx` | Mount `LoreKeeperProvider` |
| `apps/web/src/test/utils.tsx` | Test wrapper includes provider |
| `apps/web/src/hooks/useLoreKeeper*.test.ts` | Provider wrappers updated |

### Server

| File | Change |
|------|--------|
| `apps/server/src/services/evolutionService.ts` | 30-min in-memory cache, timing struct, `invalidate()` |
| `apps/server/src/routes/evolution.ts` | `?refresh=true`, dev timing headers, slow-call logging |
| `apps/server/tests/routes/evolution.test.ts` | Updated for new API contract |
| `apps/server/tests/services/evolutionService.test.ts` | Cache hit test, lib/openai mock fix |

---

## Performance Ranking

| Issue | Impact | Complexity | Risk | Est. Gain | Priority |
|-------|--------|------------|------|-----------|----------|
| Evolution on every boot (OpenAI ~7s) | Critical | Low | Low | ~7500ms off critical path | **P0** ✅ Fixed |
| Duplicate lore bootstrap (N hook instances) | High | Low | Low | ~8–12 requests, ~300ms | **P0** ✅ Fixed |
| Evolution no server cache | Medium | Low | Low | ~7500ms on repeat views | **P1** ✅ Fixed |
| Working memory 15-query fan-out | High | High | Medium | ~100–500ms per chat turn | **P2** Deferred |
| Defer claims/certified-index until panel open | Medium | Low | Low | ~150ms startup | **P2** Deferred |
| Evolution cold path still OpenAI-bound | Medium | High | Medium | ~7s when explicitly opened | **P2** Deferred |
| Aggregate lore bootstrap endpoint | Low | Medium | Low | ~2 RTTs | **P3** Deferred |
| Cross-instance evolution cache (Redis) | Low | Medium | Low | Prod repeat hits | **P3** Deferred |

---

## Queries Removed

| Area | Before | After |
|------|--------|-------|
| Evolution DB query on chat load | 1 | 0 |
| Evolution OpenAI on chat load | 1 | 0 |
| Duplicate `journal_entries` via `/api/entries` | 2–3 extra | 0 |
| Duplicate timeline/chapter reads | 6–9 extra | 0 |

---

## Tests

```bash
# Server — evolution (6 tests)
cd apps/server && npm test -- tests/routes/evolution.test.ts tests/services/evolutionService.test.ts

# Web — lore keeper (8 tests)
cd apps/web && npm test -- src/hooks/useLoreKeeper.test.ts src/hooks/useLoreKeeper.integration.test.ts src/hooks/useLoreKeeper.error.test.ts
```

All passing as of 2026-06-16.

---

## Remaining Bottlenecks

1. **OpenAI evolution synthesis** — still ~7s when user explicitly requests evolution insights. Future: background job + stale-while-revalidate UI.

2. **Working memory assembler** (`workingMemoryAssembler.ts`) — up to ~15 parallel Supabase queries per chat turn:
   - Entity resolution: characters, locations, organizations, people_places, projects
   - Character depth: memories, timeline events, relationships, facts
   - Textual candidates: journal_entries, chat_messages, projects, narrative_accounts

3. **Startup parallel fan-out** — claims, certified-index, counts still load on chat mount (unrelated to lore provider; separate panels).

4. **No evolution cache invalidation on entry create** — insights may be stale up to 30 min. Acceptable for now; wire `evolutionService.invalidate(userId)` from entry POST if freshness matters.

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| `/api/evolution` substantially faster on repeat / not on boot | ✅ |
| Startup duplicate fetches removed | ✅ |
| No duplicate lore bootstrap | ✅ |
| No behavior changes | ✅ |
| Measured improvement documented | ✅ |

---

## Related Docs

- [evolution-performance-audit.md](./evolution-performance-audit.md)
- [startup-waterfall-report.md](./startup-waterfall-report.md)
