# Sprint AH — Recall Priority Map (Phase 1)

## Retrieval order (target state)

When a user asks a recall or trust question, LoreBook resolves in this order:

| Priority | Source | When used |
|----------|--------|-----------|
| 1 | **Current thread** | `threadRecallService` — DB `chat_messages` + client history; "what did I say", "this conversation" |
| 2 | **Structured memory** | Foundation tables: `characters`, `character_relationships`, `character_memories`, `character_timeline_events`, `narrative_accounts`, `entity_facts` |
| 3 | **Narrative memory** | Journal semantic search via `memoryRecallEngine` — only when thread + foundation are insufficient |

## Entry points

| Entry | File | Current behavior (post-AH) |
|-------|------|----------------------------|
| `POST /api/chat/stream` | `routes/chat.ts` | → `omegaChatService.chatStream()` |
| Mode router gate | `omegaChatService.ts` | Testing/diagnostic + failure-aware before mode router |
| Foundation recall gate | `omegaChatService.ts` ~750 | `executeExplicitRecall()` with thread-first |
| Journal recall gate | `omegaChatService.ts` ~774 | MRE — skipped when thread has answer |
| Mode: MEMORY_RECALL | `modeHandlers.ts` | Thread-first; diagnostic on failure |
| Mode: FOUNDATION_RECALL | `modeHandlers.ts` | `executeExplicitRecall()` |
| RAG packet | `ragBuilderService.ts` | Thread-scoped journal retrieval when `currentContext.kind === 'thread'` |
| Explicit recall API path | `explicitRecallService.ts` | Thread → foundation → journal |

## Fallback paths (documented)

1. **Thread empty** → foundation router (`recallQueryRouter`)
2. **Foundation empty** → journal MRE (`memoryRecallEngine`)
3. **Journal silence + thread has content** → thread summary (never "thin record")
4. **Testing mode** → `memoryFormationStatusService` or `buildDiagnosticRecall`
5. **Recall failure frustration** → `buildDiagnosticRecall` (full state dump)
6. **Low MRE confidence** → foundation retry → diagnostic (not "My record is thin")

## Services (Sprint AH)

| Service | Phase | File |
|---------|-------|------|
| `threadRecallService` | 2 | `chat/threadRecallService.ts` |
| `testingModeDetector` | 3 | `chat/testingModeDetector.ts` |
| `memoryFormationStatusService` | 4 | `chat/memoryFormationStatusService.ts` |
| `failureAwareHandler` | 5 | `chat/failureAwareHandler.ts` |
| Character roster format | 6 | `chat/foundationRecallDataService.ts` |

## False-claim audit targets

- `modeHandlers.ts` — removed hard-coded "My record is thin"
- `systemPromptBuilder.ts` — TIER 2 thin-record guidance retained only when genuinely no data
- `explicitRecallService.ts` — thread content prevents silence fallbacks
- Ingestion acks — must not claim "saved" without pipeline verification (future: wire `pipelineRunService`)
