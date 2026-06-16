# Life Reconstruction Audit

**Date:** 2026-06-15  
**Benchmark user:** `789bd607-e063-466f-a9ef-f68d24e8bb57` (Abel Mendoza — primary account with real history)  
**Method:** Live Supabase query + `entityClassifier` + `buildMemoryCoverageAudit` + `assembleWorkingMemory` recall probes

---

## Executive answer

**Can LoreBook accurately reconstruct Abel's life today?**

## **NO**

It can reconstruct **fragments** — especially named people and recent chat topics — but not a coherent, trustworthy life story. Entity records exist for most benchmark names, yet relationships, timeline arcs, and cross-domain linking are largely missing.

---

## Phase 1 — Memory reconstruction (benchmark entities)

| Entity | Exists | Correct type | Relationships | Aliases | Timeline | Significance | Family placement |
|--------|--------|--------------|---------------|---------|----------|--------------|------------------|
| Abuela | ✅ (×3 stores) | ✅ PERSON | ❌ none | ⚠️ duplicate rows | ❌ | ⚠️ weak coverage | ⚠️ no household link |
| Tío Juan | ✅ | ✅ PERSON | ❌ | ⚠️ Tio/Tío split | ❌ | ⚠️ weak | ❌ |
| Mom | ✅ | ✅ PERSON | ❌ | ⚠️ vs Moms House place | ❌ | ⚠️ | ❌ |
| Step Dad Ben | ✅ | ✅ PERSON | ❌ | ✅ | ❌ | ⚠️ | ❌ |
| Sol | ✅ | ⚠️ person, not linked | ❌ | ✅ | ❌ | ⚠️ | ❌ |
| Ashley De La Cruz | ✅ | ✅ (+ duplicate Ashley) | ❌ | ⚠️ | ❌ | ⚠️ | ❌ |
| Leslie | ✅ | ⚠️ UNKNOWN classifier bare | ❌ | ✅ | ❌ | ⚠️ | ❌ |
| Tío Ralph | ✅ | ✅ (Tio Ralph) | ❌ | ⚠️ accent split | ❌ | ⚠️ | ❌ |
| Tía Grace | ✅ | ✅ | ❌ | ⚠️ | ❌ | ⚠️ | ❌ |
| James | ✅ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ❌ |
| Jerry | ✅ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ❌ |
| Kelly | ✅ | ✅ | ❌ | ⚠️ vs "meeting with Kelly" event | ❌ | ⚠️ | ❌ |
| Rafeh Qazi | ✅ omega only | ✅ | ❌ | ⚠️ merged with "My Coding Mentor" | ❌ | ⚠️ | ❌ |
| Andrew | ✅ | ✅ | ❌ | ⚠️ "Andrew the Club Connection" duplicate | ❌ | ⚠️ | ❌ |
| Daisy | ✅ people_place | ⚠️ UNKNOWN bare | ❌ | ✅ | ❌ | ⚠️ | ❌ |
| Hell Fairy | ✅ | ❌ PERSON+EVENT+CHARACTER triple | ❌ | ❌ | ❌ | ⚠️ | ❌ |
| Oscuri.dad | ✅ | ⚠️ UNKNOWN bare | ❌ | ⚠️ vs Oscuri | ❌ | ⚠️ | ❌ |
| Baby Bats | ✅ | ⚠️ UNKNOWN bare | ❌ | ✅ | ❌ | ⚠️ | ❌ |
| Mr. Chino | ✅ | ✅ | ❌ | ⚠️ vs Chino | ❌ | ⚠️ | ❌ |
| Goth Tio | ✅ | ⚠️ UNKNOWN bare | ❌ | ⚠️ vs Gothicumbia | ❌ | ⚠️ | ❌ |

**Coverage summary (live):** 171 entities, **1 healthy**, 163 weak, 7 orphaned, **avg score 26/100**.

---

## Phase 2 — Life story reconstruction gaps

| Domain | Can reconstruct from stored data? | Gap |
|--------|-----------------------------------|-----|
| Family life | **Partial** | People exist; **0** `character_relationships`; no family tree edges |
| Career history | **Partial** | Amazon/LoreBook mentions in chat + entity_facts; no career arc |
| LoreBook project | **Partial** | Threads + entities; no structured project timeline |
| Romantic history | **Weak** | Sol/Ashley exist; no relationship model populated |
| Nightlife/social | **Partial** | Club Metro, Hell Fairy, Goth Tio in entities; weak event linkage |
| Fitness history | **Weak** | Gym mentions in threads; no timeline events |
| Education history | **Missing** | No benchmark entities or events found |

**Orphaned entities:** 7 with zero episodes/events/relationships/evidence.  
**Missing links:** chat_messages `session_id` ≠ `conversation_sessions.id` for many threads — messages live in metadata JSON while summaries/continuity read `chat_messages`.

---

## Phase 3 — Thread continuity validation

Sampled 20 most recent threads on benchmark account:

| Check | Result |
|-------|--------|
| Thread summary exists | ❌ **0/20** before fix; backfill now produces deterministic summaries on open |
| Summary updates | ⚠️ Staleness-gated; LLM refresh blocked by OpenAI quota |
| Continuity card | ⚠️ Works from metadata when populated; most threads have empty people/places/projects |
| Open loops | ✅ Computed from message role gaps |
| People extraction | ⚠️ Ingestion-dependent; many threads never ran pipeline |
| Project extraction | ⚠️ LoreBook appears in some threads only |
| Location extraction | ⚠️ Club Metro present in entities, not consistently in threadMeta |

**Notable threads found:** "Building Lorebook At Abuelas", "Yesterday was my cousin Leslie's Graduatio…", "Adding Tío Juan to Book", "Remember what I told you about Ashley".

---

## Phase 4 — Timeline validation (benchmark events)

| Event | In timeline store | Correct lane | Correct date |
|-------|-------------------|--------------|--------------|
| Costco with Abuela | ❌ | — | — |
| Building LoreBook at Abuela's house | ❌ (thread title only) | — | — |
| Club Metro | ❌ | — | — |
| First Street Pool and Billiards | ❌ | — | — |
| Leslie's Graduation Party | ❌ (entity removed as pollution) | — | — |
| Amazon onboarding | ❌ | — | — |
| Kelly interview process | ❌ | — | — |
| Sol breakup | ❌ | — | — |

**7** `character_timeline_events` exist but **none** match benchmark event titles. Swimlane assignment not validated — events not ingested into canonical timeline.

---

## Phase 5 — Graph pollution hunt

**Before repair (benchmark account):**

| Name | Was stored as | Should be |
|------|---------------|-----------|
| Amazon Ring | Character + person | PRODUCT/platform |
| Find My | Character + person | APP/platform |
| High Noons | Character + person | FOOD_DRINK/platform |
| Moreno Valley | Character + person | PLACE |
| Graduation Party | person | EVENT (deleted/retyped) |
| The Gathering | person | platform (card game context) |

**After repair:** **0 pollution hits** remaining (`findPollutedEntities`).

**Remaining alias/duplicate issues (not pollution):**

- Tío Juan / Tio Juan (accent)
- Andrew / Andrew the Club Connection
- Hell Fairy × 4 omega types
- Abuela × 3 stores (character, people_place, omega)

---

## Top 20 failures

1. Zero `character_relationships` — family graph cannot render
2. Benchmark timeline events not in `character_timeline_events`
3. 163/171 entities weak coverage (score < 40)
4. chat_messages session_id mismatch vs conversation_sessions
5. Thread summaries never built (ingestion never ran / wrong message source)
6. Amazon Ring / Find My / High Noons / Moreno Valley were Character cards (fixed)
7. Graduation Party stored as person (fixed)
8. Hell Fairy triple-typed (PERSON, EVENT, CHARACTER)
9. Duplicate threads with identical titles
10. Tío/Tio accent duplicates
11. Bare nicknames (Leslie, Daisy, Goth Tio) classifier UNKNOWN without context — deferred promotion
12. entity_facts (1270) not linked to character evidence scores
13. No romantic relationship records despite Sol/Ashley chat history
14. Career arc not inferrable from structured data
15. Fitness history not in timeline
16. Education history absent
17. OpenAI quota blocks rich LLM summaries
18. `people_places` DB check constraint blocked `event`/`unclassified` retype — required delete/platform fallback
19. Recall falls back to generic LIFE_REVIEW for relational questions ("Who lives with me?")
20. Average coverage score 26 — far below reconstruction threshold

---

## Top 20 fixes made (this sprint)

1. `entityPollutionRepair` — detect + repair mis-typed entities
2. Removed 4 polluted Character cards (Amazon Ring, Find My, High Noons, Moreno Valley)
3. Retyped/deleted 7 polluted `people_places` rows
4. `POST /api/diagnostics/repair-entity-pollution` endpoint
5. `threadSummaryService` reads merged messages via `loadThreadMessages` (not chat_messages only)
6. `threadIntelligenceService.syncFromStoredMessages` on thread open
7. Deterministic summary floor uses loaded message count
8. Hooked sync on `ensure-visible` and `GET /threads/:id/messages`
9. `entityClassifier` tests for ship-blocker entity list
10. Arc inference primary-track scoring (prior sprint)
11. Thread ordering durability (prior sprint)
12. Character registry rejects non-PERSON classifications (prior sprint)
13. `scripts/lifeReconstructionAudit.ts` for repeatable benchmark runs
14. Pollution repair tests
15. Summary backfill verified: "11 messages in this thread" deterministic output
16. Working memory recall returns entities for 18/25 direct name queries
17. Club Metro resolves as place in recall
18. Kelly/Sol/Jerry relationship queries return entity + items
19. LoreBook resolves as PROJECT_QUERY target
20. Graph pollution count → 0 on benchmark account

---

## Top 20 remaining gaps

1. Populate `character_relationships` from family mentions
2. Unify chat_messages.session_id with conversation_sessions.id
3. Ingest benchmark events into timeline with correct swimlanes
4. Merge Tío/Tio and Andrew duplicate cards
5. Resolve Hell Fairy type to single canonical entity
6. Run ingestion pipeline on historical threads for threadMeta people/places
7. Link entity_facts to character evidence scores
8. Build romantic relationship records for Sol/Ashley
9. Household naming groups (Ralph Family) not wired to graph edges
10. Leslie graduation event needs EVENT record with date
11. Amazon onboarding career milestone
12. Kelly interview process milestone
13. Sol breakup relationship event
14. Costco with Abuela family episode
15. First Street Pool venue card
16. Rich LLM summaries (needs OpenAI quota)
17. Education domain — no data
18. Fitness timeline from gym threads
19. Biography/narrative synthesis layer not populated
20. Coverage score target ≥ 60 for "healthy" reconstruction

---

## Scripts

```bash
cd apps/server && npx tsx scripts/lifeReconstructionAudit.ts
```
