# Sprint AM — Story Intelligence, Entity Lifecycle, and Conversation Memory Utilization

## Goal

Make LoreBook behave like a **biographer and archivist** — reconstructing coherent stories from stored memory, not returning fragments or philosophical non-answers.

## Deliverables

| ID | Component | Path |
|----|-----------|------|
| AM-1 | Scene Reconstruction Engine | `apps/server/src/services/story/sceneReconstructionService.ts` |
| AM-2 | Character Memory Profiles | `apps/server/src/services/characters/characterMemoryProfileService.ts` |
| AM-3 | Character Creation Verification (5-check) | `apps/server/src/services/chat/characterCreationVerification.ts` |
| AM-4 | Duplicate Character Intelligence | `apps/server/src/services/story/entityConflictResolver.ts` |
| AM-5 | Event Reconstruction | `apps/server/src/services/story/eventReconstructionService.ts` |
| AM-6 | Relationship Story Summaries | `apps/server/src/services/story/relationshipStoryBuilder.ts` |
| AM-7 | Story Coverage Diagnostics | `apps/server/src/services/diagnostics/storyCoverageDiagnostics.ts` |
| AM-8 | Biography Recall Upgrade | `formatStoryRosterForChat()` in `foundationRecallDataService.ts` |
| AM-9 | Regression Tests | `apps/server/tests/services/sprintAmStoryMemory.test.ts` |

## Orchestration

`storyRecallService.ts` wires AM-1 through AM-6:

- **Person questions** (`who is Jerry`, `do you remember Ashley`) → memory profile + scene + conflicts + relationship story
- **Scene questions** (`what happened at Club Metro`, `Tía Grace's house`) → scene reconstruction by place/person
- **Event questions** (`what happened with Sol`) → event reconstruction or relationship story
- **Roster questions** (`who are the people in my story`) → categorized story roster with importance and major moments

## Router Integration

`conversationIntelligenceRouter.ts` (Sprint AK gate, runs before AH in `omegaChatService`) handles:

| Intent | Handler |
|--------|---------|
| `recall_person`, `person_profile` | `buildPersonStoryRecall()` |
| `scene_recall` | `buildSceneRecall()` |
| `event_story` | `buildEventStoryRecall()` |
| `story_roster` | `buildStoryRosterRecall()` |
| `character_creation_check` | 5-step verification (entity, character, UI card, ingestion, creation status) |

## AM-3 Verification Checklist

When user asks "Did you create the card?":

1. Entity exists (people_places)
2. Character exists (characters row)
3. UI card exists (API route reference)
4. Ingestion succeeded (character_memories links)
5. Creation status (full / partial / failed)

Never answer vaguely — return exact status per check.

## AM-4 Duplicate Names

`entityConflictResolver.ts` detects shared first names (e.g. Tío Juan vs Juan Oscuri.dad). Surfaces category differences (Family vs Scene). **Never merges automatically.**

## AM-7 Diagnostics

```
GET /api/diagnostics/story-coverage
```

Returns:

```json
{
  "characters_with_memories": 12,
  "orphan_characters": 3,
  "events_with_meaning": 8,
  "events_without_meaning": 4,
  "relationships_with_stories": 2,
  "locations_with_stories": 5,
  "coverage_score": 67
}
```

## Success Criteria

| User asks | Expected behavior |
|-----------|-------------------|
| Who is Jerry? | Reconstructs LoreBook development scenes, not "entity exists" |
| What happened with Ashley? | Full event/relationship story with meaning |
| What happened at Tía Grace's house? | Scene with participants, activities, meaning |
| Did you create the card? | Exact 5-check verification |
| Who are the people in my story? | Family / Romantic / Professional / Scene groups with importance |

## Tests

```bash
cd apps/server && npm test -- sprintAmStoryMemory
```

Transcript cases: Jerry, James, Tía Grace, Tío Juan, Ashley, Sol, Club Metro, Costco+Abuela, Kelly, Amazon hiring, story roster, card verification.
