# Live Chat Retrieval Map

Status: Working Memory Integration Sprint.

## Current Live Path

```text
User Message
-> routes/chat.ts
-> omegaChatService.chatStream()
-> pre-RAG recall gates
-> buildRAGPacket()
-> context scoring
-> systemPromptBuilder
-> LLM stream
```

## Step Trace

| Step | File / Service | Complexity | Queries / Work | Duplicate Work |
| --- | --- | --- | --- | --- |
| HTTP stream entry | `apps/server/src/routes/chat.ts` | O(1) request handling | Auth, body validation, stream setup | None |
| Chat orchestration | `apps/server/src/services/omegaChatService.ts` | O(gates + retrieval) | Session/message setup, thread context, ingestion queue | Multiple recall gates can run before RAG |
| AK conversation intelligence | `services/chat/conversationIntelligenceRouter.ts` | Regex + bounded DB | Calls story recall, entity profile, thread recall, diagnostics | Duplicates entity/profile recall with later RAG |
| AH trust gates | `testingModeDetector`, `memoryFormationStatusService`, `failureAwareHandler`, `threadRecallService` | Regex + bounded DB | Memory status, failure diagnostics, thread recall | Separate recall route for testing/diagnostic modes |
| Mode router | `modeRouterService`, `modeHandlers` | Rules + handler work | May run memory/foundation recall handlers | Can short-circuit normal RAG |
| Explicit recall gate | `explicitRecallService`, `recallIntentPatterns`, `memoryRecallEngine` | Regex + recall engine | `routeRecallQuery`, memory recall candidate retrieval | Duplicates foundation recall and semantic recall |
| RAG packet | `services/chat/ragBuilderService.ts` | Previously broad O(n) lore scan + bounded retrieval | Characters, locations, chapters, people_places, graph, memories, facts, relationships | Previously ran a second `routeRecallQuery()` inside RAG |
| Working Memory assembly | `services/chat/workingMemoryAssembler.ts` | Bounded source reads + O(k log k) ranking | Target entity, episodes, events, projects, relationships, timeline, biography | New authoritative RAG memory source |
| Context scoring | `contextScoringService` | O(selected lore) | Filters lore prompt data | Still useful as prompt-size guard |
| Prompt assembly | `services/chat/systemPromptBuilder.ts` | O(prompt sections) | Serializes Working Memory packet and other guardrails | No DB work |
| LLM | `lib/openai.ts` | External call | Gated OpenAI client | No retrieval work |

## Duplicate Retrieval Before This Sprint

The normal chat path could run:

1. `routeConversationIntelligence()` for person/place/event/story recall.
2. `executeExplicitRecall()` for foundation recall.
3. `memoryRecallEngine.executeRecall()` for recall queries.
4. `buildRAGPacket()` generic/entity-scoped retrieval.
5. A second `routeRecallQuery()` inside `ragBuilderService`.
6. Separate relationship/timeline queries inside RAG after recall routing.

This created duplicate entity scans and inconsistent answers: one gate could say "no memory," while another layer later had evidence.

## Integration Change

`ragBuilderService` no longer calls `routeRecallQuery()` inside RAG.

Instead:

```text
buildRAGPacket()
-> assembleWorkingMemory({ question, userId, threadId })
-> buildWorkingMemoryPacket()
-> foundationRecallBlock = packet.text
-> systemPromptBuilder serializes WORKING MEMORY
```

The upstream short-circuit gates are still present for diagnostic and explicit mode behavior, but the normal LLM path now has one selected memory packet instead of another recall-router pass.

`omegaChatService` now treats Working Memory as primary by default:

- `conversationIntelligenceRouter` is skipped unless `WORKING_MEMORY_PRIMARY=false`.
- `recall_check` / foundation explicit recall short-circuits are skipped unless `WORKING_MEMORY_PRIMARY=false`.
- `MEMORY_RECALL` and `FOUNDATION_RECALL` mode-router decisions fall through to RAG/WMA instead of returning early.
- Memory-formation/debug trust checks remain active because they answer "did the system save this?" rather than "what memory matters for this question?"

## Queries Now Owned By Working Memory

Working Memory performs bounded reads from:

- `characters`
- `locations`
- `organizations`
- `people_places`
- `projects`
- `character_memories`
- `character_timeline_events`
- `character_relationships`
- `entity_facts`
- `journal_entries`
- `chat_messages`
- `narrative_accounts`

Every selected item includes:

- `source`
- `confidence`
- `reason selected`
- `score`

## Dead / Legacy / Duplicate Paths

### Keep

- `threadRecallService`: useful for explicit thread recap and diagnostics.
- `memoryFormationStatusService`: required for "did you save that?" trust questions.
- `memoryRecallEngine`: keep as fallback/evaluation corpus until Working Memory reaches parity.
- `contextScoringService`: still useful as a final prompt-size guard.
- Story reconstruction services: keep as renderers/formatters, not independent retrieval gates.

### Merge

- `conversationIntelligenceRouter`: merge intent definitions into Working Memory.
- `recallQueryRouter`: merge useful foundation lookup helpers, then retire route-level ownership.
- `explicitRecallService`: become a thin wrapper over Working Memory diagnostics/packet rendering.
- `failureAwareHandler`: use Working Memory rejected/open-loop data instead of separate recall.

### Delete Later

- The duplicate `routeRecallQuery()` call inside RAG: removed in this sprint.
- Regex recall cascades that only exist to choose retrieval sources.
- Any recall path that returns a user-facing "I don't remember" without checking Working Memory first.

## Remaining Retrieval Sprawl

Upstream short-circuit gates still exist, but normal memory/foundation recall now flows through Working Memory by default. They are intentionally not deleted in this sprint because some include user-facing diagnostic behavior and mode-specific responses. The next consolidation step is to route those diagnostics through Working Memory open loops rather than separate retrieval.

Target final shape:

```text
Question
-> Working Memory Assembler
-> Working Memory Packet
-> optional renderer/diagnostic mode
-> LLM
```

## Complexity Notes

Old path: broad static lore fetch + multiple recall routers + generic retrieval.

New RAG memory path: bounded source reads + in-memory ranking.

Expected improvements:

- Fewer duplicate entity scans.
- One source of truth for selected/rejected memories.
- Lower prompt bloat because Working Memory is budgeted.
- Better trust because missing/weak/unknown cases are explicit open loops.
