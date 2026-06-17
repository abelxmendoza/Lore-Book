# WMA Optimization Results

**Date:** 2026-06-16  
**Sprint:** Working Memory Performance Sprint

## Changes Made

### Code

| File | Change |
|------|--------|
| `workingMemoryAssembler.ts` | `WmaRequestScope` cache + traced queries |
| `workingMemoryAssembler.ts` | `fetchCharactersForResolve` / `fetchPeoplePlacesForResolve` with filtered + fallback |
| `workingMemoryAssembler.ts` | `loadPersonCandidates` accepts cached `CharacterRow`, skips maybeSingle |
| `workingMemoryAssembler.ts` | `loadProtagonistRelationshipCandidates` reuses `characters:all` cache |
| `workingMemoryAssembler.ts` | Parallel `Promise.all` for person + textual candidate phases |
| `workingMemoryAssembler.ts` | `WorkingMemoryAssembly.timing` field |
| `workingMemoryAssembler.test.ts` | +3 performance tests (17 total) |

---

## Queries Removed

| Scenario | Removed Query | How |
|----------|---------------|-----|
| Person query with character match | `characters` maybeSingle | Pass resolved row from entity phase |
| Resolve fallback + protagonist | Duplicate `characters` full scan | `characters:all` request cache |
| (Future) Same table same key | Any duplicate | `WmaRequestScope.once()` |

---

## Queries Batched / Parallelized

| Before | After |
|--------|-------|
| `await personCandidates` then `await textualCandidates` | `Promise.all([person, textual])` |

Wall-clock candidate phase: **~10 sequential RTTs → ~6 parallel RTTs** (limited by slower branch).

---

## Row Scans Reduced

| Table | Before | After (typical) |
|-------|--------|-----------------|
| `characters` | All user rows | Name-token filtered subset |
| `people_places` | All user rows | Name-token filtered subset |

Fallback to full scan preserves recall for alias-only matches not caught by ilike filters.

---

## Latency Reduction (Estimated)

| Path | Before | After | Gain |
|------|--------|-------|------|
| PERSON_QUERY query count | 16 | 14–15 | 1–2 fewer RTTs |
| PERSON_QUERY candidate wall time | ~10 RTT sequential | ~6 RTT parallel | **~40%** |
| Character table calls | 2 | 1 | **50%** |
| Entity scan rows (100+ chars) | 100+ rows | ~1–5 rows typical | **90%+** transfer reduction |

*Absolute ms depends on Supabase latency and user data size; instrumentation provides per-request measurement.*

---

## Quality: Before = After

Verified by unchanged test assertions for:

| Prompt | Intent | Key recall |
|--------|--------|------------|
| "What do you know about Alex?" | PERSON_QUERY | Alex + Blue Room episodes |
| "What do you remember about Sam Chen?" | RELATIONSHIP_QUERY | romantic relationship |
| "What happened at Blue Room?" | PLACE_QUERY | Blue Room entities + content |
| "How is LifeLedger progressing?" | PROJECT_QUERY | LifeLedger project + episodes |
| "What do you know about Amazon?" | PERSON_QUERY | ORGANIZATION not PERSON |
| 9 target variants (each) | various | confidence > 0, budget ≤ 20 |

**Ranking, scoring, budget, and packet format: unchanged.**

---

## Tests

```bash
cd apps/server && npm test -- tests/services/workingMemoryAssembler.test.ts
# 17 passed
```

New tests:
- `avoids duplicate character table queries for person queries`
- `reuses character cache for household relationship queries`
- `records per-query timing breakdown`

---

## Remaining Hotspots

1. **`projects` double fetch** — resolve ilike vs textual limit-6 (different semantics; not merged)
2. **`character_timeline_events` double fetch** on EVENT_QUERY — recent + target search
3. **No cross-request TTL cache** — repeat identical questions re-query DB
4. **Protagonist discovery** — requires full character list (inherent to "find me" logic)
5. **WMA + RAG pipeline** — other services in `ragBuilderService` add queries beyond WMA

---

## Next Steps (Optional P2)

| Item | Risk | Gain |
|------|------|------|
| Redis/TTL cache for entity resolution (30s per user+target) | Low | Repeat question latency |
| Defer textual projects query when resolve already matched project | Low | −1 query on PROJECT_QUERY |
| Composite index on `characters(user_id, name)` | None | Faster filtered scans |
| Expose `timing` in diagnostics API response | None | Ops visibility |
