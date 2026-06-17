# Narrative Compiler Audit

Generated: 2026-06-16. Sprint: Narrative Compiler V1 + Ontology Activation.

## Mission

Transform LoreBook from memory retrieval into continuous narrative compilation: timelines, chapters, arcs, biographies, relationship/family/project histories — all from a shared **NarrativeIR**.

## Source Systems Inventory

| System | Location | Role | Authority |
|--------|----------|------|-----------|
| **Life Arc Synthesis** | `continuityRuntime/arcs/lifeArcSynthesisService.ts` | Candidate/enriched arcs, conflicts, signal inventory | **Primary** for arc structure |
| **Living Biography** | `livingBiographyService.ts` | `deriveCurrentChapter()` from biography foundation | Chapter label/evidence when bio exists |
| **Life Story API** | `lifeStoryApiService.ts` | HTTP projection + 30s cache for `/api/life/*` | Read model over synthesis |
| **Story Context** | `storyContextService.ts` | Chat-time story intelligence | Ephemeral chat context |
| **Story of Self** | `storyOfSelf/` | `TurningPointDetector` on memory entries | Pattern-based turning points (journal) |
| **Biography Generation** | `biographyGeneration/` | Memoir/long-form generation | Downstream consumer (not IR) |
| **Episodes** | journal + episode pipelines | Raw narrative units | Evidence source |
| **Goals** | `goals` table | Active life direction | Chapter + arc signals |
| **Projects / Orgs** | `organizations` table | Work/creative/community | Arc + scene signals |
| **Relationships** | `character_relationships`, `characters` | Social graph | Relationship stories |
| **Family Graph** | `kinship/familyGraphService.ts`, `householdService.ts` | Tree, households, analytics | Family story surface |
| **Temporal** | `temporalRelationshipQueries`, resolved events | Dated evidence | Timeline + turning points |
| **Communities** | orgs filtered (goth, family, household) | Scene/community arcs | Derived from organizations |
| **Ontology** | `ontology/lexicalIntelligence.ts` | `enrichEntity()`, glossary | Semantic layer (now ingestion-active) |

## Overlaps

1. **Current chapter** — `lifeArcSynthesisService`, `livingBiographyService`, and `lifeStoryApiService` all expose chapter-like narratives. **Resolution:** `chapterCompilerService` unifies synthesis + bio into `NarrativeIR.currentChapter`.
2. **Turning points** — `storyOfSelf/TurningPointDetector` vs new `turningPointDetectionService`. **Resolution:** IR uses expanded keyword detector over journal + resolved events; story-of-self remains for memoir pipeline.
3. **Life API vs Story API** — `/api/life/*` and `/api/story/*` overlap on arcs/chapter. **Resolution:** `/api/story/*` is IR-canonical; `/api/life/*` kept for backward compatibility.
4. **Scenes vs arcs** — Goth/career/family patterns exist in arc title rules and scene detection. **Resolution:** scenes are co-occurrence clusters; arcs are scored life threads.

## Missing Links (pre-sprint → now addressed)

| Gap | Status |
|-----|--------|
| Canonical `NarrativeIR` type | ✅ `services/narrative/types.ts` |
| `narrativeCompilerService` | ✅ Orchestrates synthesis + chapter + turning points + scenes |
| `chapterCompilerService` | ✅ |
| Unified turning point store | ✅ IR-level (not yet persisted to DB) |
| `story_state` on all memory objects | ⚠️ Types + IR evidence flags; DB column migration deferred |
| `bookCompilerService` | ✅ `BookOutline` prep |
| Story surfaces API | ✅ `GET /api/story/*` |
| Story dashboard UI | ✅ `/story` |
| Story health | ✅ `storyHealthService` + `/api/story/health` |
| Golden questions | ✅ `storyGoldenQuestions.ts` |
| Provenance on every element | ✅ Arc/chapter evidence + `provenance.why` |

## Authority Boundaries

```
Raw memories / events / journal
        ↓
Entity layer (people_places, characters) + ontology enrichment
        ↓
Signal bundle (goals, orgs, relationships, events, journal)
        ↓
lifeArcSynthesisService  ← authoritative for arcs & conflicts
        ↓
narrativeCompilerService ← authoritative for NarrativeIR
        ↓
Story surfaces (/api/story, /story UI, future books/memoirs)
```

- **Do not** duplicate arc scoring in UI or chat paths; consume IR.
- **Character authority** (`characterAuthorityService`) remains canonical for person identity.
- **Biography generation** consumes IR in future; does not define it.

## Recommended Next Steps

1. Persist `NarrativeIR` snapshots + `story_state` column on `journal_entries`, `resolved_events`, `goals`.
2. Wire chat `storyContextService` to read compiled IR instead of ad-hoc synthesis.
3. Merge `/api/life` responses to delegate to `narrativeCompilerService`.
4. Book generation: pipe `BookOutline` into `biographyGeneration` engine.
5. Scene → arc promotion workflow (user confirms scene as named arc).
