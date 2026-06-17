# WMA Query Map

**Date:** 2026-06-16  
**Source:** `apps/server/src/services/chat/workingMemoryAssembler.ts`

## Assembly Flow

```
assembleWorkingMemory(question, userId, threadId?)
│
├─ classifyIntent(question)                    [in-process]
├─ extractQuestionTarget(question)           [in-process]
│
├─ PHASE 1: resolveTargetEntities(scope)       [entityResolutionMs]
│   ├─ characters     → fetchCharactersForResolve (filtered → fallback all)
│   ├─ locations      → ilike(name, target)
│   ├─ organizations  → ilike(name, target)
│   ├─ people_places  → fetchPeoplePlacesForResolve (filtered → fallback all)
│   └─ projects       → ilike(name, target)
│
├─ PHASE 2: candidate generation (parallel)    [candidateGenerationMs]
│   ├─ loadPersonCandidates OR loadProtagonistRelationshipCandidates
│   └─ loadTextualCandidates
│
└─ PHASE 3: selectBudget + distribute          [rankingMs]
```

---

## Query Map by Intent

### PERSON_QUERY / RELATIONSHIP_QUERY (e.g. "What do you know about Alex?")

| Step | Table | Cache Key | Filter | Limit |
|------|-------|-----------|--------|-------|
| 1 | `characters` | `characters:filtered:{key}` | name ilike tokens | all matches |
| 2 | `locations` | `locations:{key}` | ilike name | — |
| 3 | `organizations` | `organizations:{key}` | ilike name | — |
| 4 | `people_places` | `people_places:filtered:{key}` | name ilike tokens | — |
| 5 | `projects` | `projects:resolve:{key}` | ilike name | — |
| 6 | `character_memories` | `memories:{charId}` | character_id | 8 |
| 7 | `character_timeline_events` | `events:character:{charId}` | character_id | 6 |
| 8 | `character_relationships` | `relationships:character:{charId}` | source/target or | 6 |
| 9 | `entity_facts` | `facts:character:{charId}` | entity_type=character, active | 6 |
| ~~10~~ | ~~`characters`~~ | ~~maybeSingle~~ | **Eliminated** — row from step 1 | — |
| 10 | `journal_entries` | `journal_entries:{intent}` | user_id, order date | 6 |
| 11 | `chat_messages` | `chat_messages:target:{key}` | ilike content | 6 |
| 12 | `character_timeline_events` | `timeline_events:recent:{intent}` | order event_date | 4 |
| 13 | `projects` | `projects:textual` | user_id | 6 |
| 14 | `narrative_accounts` | `narrative_accounts:{intent}` | order recorded_at | 2 |

**Total uncached: 14** (was 16)

---

### PLACE_QUERY (e.g. "What happened at Blue Room?")

Same as above except **no person candidate branch** (primary entity is place, not character).

| Step | Table | Notes |
|------|-------|-------|
| 1–5 | resolve tables | Same |
| 6–9 | person depth | **Skipped** |
| 10–14 | textual | Same |

**Total uncached: 10** (was 11)

---

### PROJECT_QUERY (e.g. "How is LifeLedger progressing?")

| Step | Table | Notes |
|------|-------|-------|
| 1–5 | resolve | projects match via ilike |
| 6–9 | person depth | **Skipped** (entity type PROJECT) |
| 10–14 | textual | projects table also loaded in textual pass |

**Total uncached: 10**

---

### EVENT_QUERY (e.g. "What happened at Morgan Gray's graduation?")

| Step | Table | Notes |
|------|-------|-------|
| 1–5 | resolve | Same |
| 6–9 | person depth | **Skipped** (intent === EVENT_QUERY) |
| 10–14 | textual | + extra `timeline_events:target` query |

**Total uncached: 11**

---

### LIFE_REVIEW / IDENTITY_QUERY (no specific target)

| Step | Table | Notes |
|------|-------|-------|
| 1–5 | resolve | **Skipped** (no target) |
| 6–9 | person depth | **Skipped** |
| 10–14 | textual | Higher limits (8 entries, 8 events, 4 narratives) |

**Total uncached: 6**

---

### Household (e.g. "Who lives with me?")

| Step | Table | Notes |
|------|-------|-------|
| 1–5 | resolve | **Skipped** (no target extracted) |
| 6 | `characters` | `characters:all` — find protagonist |
| 7 | `character_relationships` | protagonist edges, limit 12 |
| 8–13 | textual | Standard textual pass |

**Total uncached: 8**

---

## Cache Key Reference

| Key Pattern | Shared By |
|-------------|-----------|
| `characters:all` | Protagonist path; resolve fallback |
| `characters:filtered:{key}` | Resolve (first attempt) |
| `characters:resolve:{key}` | Resolve wrapper (includes fallback logic) |
| `characters:single:{id}` | Person depth (only if row not already cached) |
| `people_places:filtered:{key}` | Resolve first attempt |
| `people_places:all` | Resolve fallback |
| `projects:textual` | Textual candidates |
| `projects:resolve:{key}` | Resolve (separate from textual — different filter) |

---

## Instrumentation Access

```typescript
const assembly = await assembleWorkingMemory({ question, userId, threadId });
console.log(assembly.timing);
// {
//   totalMs, entityResolutionMs, candidateGenerationMs, rankingMs,
//   queryCount,  // uncached DB calls only
//   queries: [{ table, purpose, ms, rowCount, cached }]
// }
```

Diagnostics route `/api/diagnostics/working-memory` can surface this timing in responses (future enhancement).
