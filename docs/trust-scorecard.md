# Trust Scorecard

**Date:** 2026-06-15  
**Benchmark:** Abel Mendoza real history (`789bd607-e063-466f-a9ef-f68d24e8bb57`)

---

## Final answer

### Can LoreBook accurately reconstruct a person's life today?

# **NO**

**Evidence:** 171 entities with **26/100** average coverage, **0** relationship edges, **0/8** benchmark timeline events, **10/25** weak recall answers, and thread intelligence empty until this sprint's backfill fix. Named-people lookup works; life-story reconstruction does not.

---

## Scores (0–100)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Memory Accuracy** | **26** | Live audit avg coverage; 1/171 healthy; 1270 facts unlinked |
| **Entity Accuracy** | **58** | 19/20 benchmark people exist; pollution fixed; duplicates remain |
| **Timeline Accuracy** | **12** | 7 timeline rows, none match benchmarks; swimlanes unvalidated |
| **Relationship Accuracy** | **8** | 0 character_relationships; family tree impossible |
| **Recall Accuracy** | **44** | 11/25 strict-good; 25/25 lenient non-empty |
| **Thread Continuity** | **42** | Summaries backfill on open (fix); metadata people/places sparse |
| **Biography Quality** | **28** | No synthesized narrative; chat fragments only |

### **Overall trust score: 31/100**

---

## Score detail

### Memory Accuracy — 26
- `buildMemoryCoverageAudit`: avg 26, 163 weak, 7 orphaned
- entity_facts volume high but evidence score 0 on characters
- Chat persists; cross-session linking broken

### Entity Accuracy — 58
- ✅ Abuela, Mom, Tío Juan, Kelly, Sol, Leslie, family honorifics
- ✅ Pollution removed: Amazon Ring, Find My, High Noons, Moreno Valley
- ❌ Hell Fairy triple-type; Andrew duplicate; Tio/Tío split
- ❌ Bare nicknames (Daisy, Leslie) UNKNOWN without context — correct classifier behavior but blocks auto-card

### Timeline Accuracy — 12
- No Costco, graduation, Amazon onboarding, Kelly interview, Sol breakup in timeline store
- Arc inference fixes (prior sprint) don't help if events never ingested

### Relationship Accuracy — 8
- Zero rows in `character_relationships`
- Romantic relationships table not populated for Sol/Ashley despite chat
- Household naming tests pass in code; not reflected in live graph

### Recall Accuracy — 44
- Strong: direct "Who is X?" for known characters
- Weak: relational, activity, household questions fall to LIFE_REVIEW

### Thread Continuity — 42
- Before fix: 0/20 threads had summaries
- After fix: deterministic summaries on open via `loadThreadMessages`
- LLM summaries blocked by OpenAI quota
- threadMeta people/places empty on most threads

### Biography Quality — 28
- Threads contain rich life narrative ("Building Lorebook At Abuelas", Leslie graduation)
- Not compiled into biography/episodes at useful depth
- User would not trust a generated "life story" today

---

## What would move the score to YES (>70 overall)

| Action | Impact |
|--------|--------|
| Align chat_messages.session_id with conversation_sessions | +15 thread continuity |
| Backfill character_relationships from facts | +20 relationship |
| Ingest benchmark events to timeline | +18 timeline |
| Merge duplicate entities | +8 entity |
| Link entity_facts → character evidence | +12 memory |
| Run ingestion on historical threads | +10 continuity |

**Estimated score after safe fixes (no new architecture): ~68–72** — approaching trust threshold but not there yet.

---

## Fixes applied this sprint (trust impact)

| Fix | Trust impact |
|-----|--------------|
| Entity pollution repair | Entity +12 |
| Thread summary uses merged messages | Thread continuity +18 |
| syncFromStoredMessages on thread open | Thread continuity +10 |
| Diagnostics repair endpoint | Ops visibility |

---

## Related docs

- [life-reconstruction-audit.md](./life-reconstruction-audit.md)
- [memory-accuracy-report.md](./memory-accuracy-report.md)
- [recall-benchmark.md](./recall-benchmark.md)
- [ship-readiness-report.md](./ship-readiness-report.md)
