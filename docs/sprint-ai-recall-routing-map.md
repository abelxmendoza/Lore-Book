# Sprint AI — Recall Routing Map

## Recall intents → handler path

| User pattern | Intent | Handler | Priority order |
|---|---|---|---|
| What did I say earlier / what were we talking about | `thread` | `threadRecallService.buildThreadRecall` | 1. Current thread |
| Do you remember? (bare) | `thread` | `threadRecallService` (via `DO_YOU_REMEMBER_BARE_RE`) | 1. Current thread |
| What happened today | `thread` | `threadRecallService` | 1. Current thread |
| Did you save X / did memory form / what was extracted | `memory_formation` | `memoryFormationStatusService` | Verified DB state only |
| You forgot / aww man / still not working | `diagnostic` | `failureAwareHandler.buildDiagnosticRecall` | Thread → characters → relationships → layers |
| Who are the characters in my story | `character_roster` | `formatGroupedCharacterRosterForChat` | Family → Romantic → Professional → Scene |
| What do you know about my family | `family` | `formatFamilyTreeForChat` + `formatFamilyRosterForChat` | Relationships before biography |
| What do you know about Ashley | `entity` | `formatEntityProfileForChat` + significance | Thread meaning + stored facts |
| What do you know about me | `biography` | `narrative_accounts` biography snapshot | Never first for entity/family queries |
| Testing / diagnostic / system state | `diagnostic` | `executeExplicitRecall` | Thread → foundation → journal |

## Retrieval priority (explicit recall)

1. Current thread (`threadRecallService`)
2. Active thread memory (chat_messages by session)
3. Character memory (`characters`, `character_memories`)
4. Relationship memory (`character_relationships`, family tree)
5. Timeline memory (`character_timeline_events`)
6. Biography memory (`narrative_accounts`) — **never first**

## Forbidden fallback phrases (removed)

| Phrase | Replacement |
|---|---|
| My record is thin | Structured recall from thread or foundation |
| Tell me now and it goes into your lore | `VERIFIED_SILENCE_FALLBACK` |
| I've captured that / I've saved that | `INGESTION_ACK_FALLBACK` (processing, not verified) |
| We haven't talked about that yet — tell me about it | `VERIFIED_SILENCE_FALLBACK` |

## Gate order in `omegaChatService`

1. `memory_formation` → formation status
2. `detectRecallFailure` → diagnostic recall
3. `matchesThreadRecallQuery` + history → thread recall
4. `testingMode` recall_check / system_state → explicit recall
5. Mode router (experience ingestion uses verified ack language)

## Key files

- `apps/server/src/services/chat/threadRecallService.ts`
- `apps/server/src/services/chat/recallQueryRouter.ts`
- `apps/server/src/services/chat/foundationRecallDataService.ts`
- `apps/server/src/services/chat/explicitRecallService.ts`
- `apps/server/src/services/chat/testingModeDetector.ts`
- `apps/server/src/services/chat/failureAwareHandler.ts`
- `apps/server/src/services/chat/significanceRecall.ts`
- `apps/server/src/services/chat/verifiedMemoryLanguage.ts`
