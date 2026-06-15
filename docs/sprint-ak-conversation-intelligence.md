# Sprint AK — Conversation Intelligence & Trust Layer

## Overview

Sprint AK builds on Sprint AI recall orchestration by improving **conversation quality** — routing, evidence requirements, therapist suppression, and narrative voice.

## AK-1 — Question Intent Detection

**File:** `apps/server/src/services/chat/questionIntentClassifier.ts`

| User message | Intent |
|---|---|
| "Do you remember Jerry?" | `recall_person` |
| "What do you remember about Jerry?" | `person_profile` |
| "What did I do today?" | `daily_recall` |
| "What did we talk about?" | `thread_recall` |
| "Did you save that?" | `memory_verification` |
| "Did you create a character?" | `character_creation_check` |
| "What was extracted?" | `memory_debug` |

**Router:** `conversationIntelligenceRouter.ts` — runs **before** Sprint AH gates in `omegaChatService.chatStream()`.

## AK-2 — Memory Evidence Requirement

**File:** `apps/server/src/services/chat/memoryEvidenceFormatter.ts`

All AK memory responses include:

```
Known:
• ...

Unknown:
• ...

Evidence count:
• Thread: N
• Memory: N
• Event: N
• Character: N
```

Never claims memory without evidence counts > 0 or explicit known items.

## AK-3 — Character Creation Verification

**File:** `apps/server/src/services/chat/characterCreationVerification.ts`

When user asks "Did you create a character?" verifies:

- Entity resolved in `characters`
- Entity in `people_places` registry
- DB write (character_memories links)
- Relationships linked
- Thread mention evidence

If not created: states **exactly why** (no row, pending extraction, etc.).

## AK-4 — Thread vs Lore Distinction

**File:** `apps/server/src/services/chat/memorySourceLabels.ts`

Responses labeled:

- **Current Thread:** — from `chat_messages` / client history
- **Stored Lore:** — from foundation tables
- **Recent Events:** — from timeline/events

## AK-5 — Therapist Suppression Rules

**File:** `apps/server/src/services/chat/therapistSuppressionRules.ts`

Therapist mode suppressed when user is:

- Testing / debugging / recalling
- Stating facts ("Tio Juan makes sure I eat")
- Discussing software (LoreBook, extraction, save checks)

**Wiring:**

- `modeRouterService.quickModeCheck()` — skips `EMOTIONAL_EXISTENTIAL`
- Caretaker/family facts → `EXPERIENCE_INGESTION` (biography writer path)

## AK-6 — Biography Writer Upgrade

**File:** `apps/server/src/services/chat/storyInsightService.ts`

Reusable fact → narrative transforms:

| Raw fact | Narrative |
|---|---|
| "Bootcamp cost 15k" | "The expensive bet that changed me." |
| "Tio Juan makes sure I eat" | "One of the quiet caretakers in your life…" |
| "Costco with Abuela" | "The highlight wasn't Costco. It was that Abuela was still there." |

Appended as **Story insight** block on person recall responses.

## AK-7 — Anti-Repetition Layer

**File:** `apps/server/src/services/chat/antiRepetitionLayer.ts`

Tracks last 5 assistant messages. Blocks repeated:

- "My record there is thin"
- "I've captured that"
- "Tell me now and it goes into your lore"
- "We haven't talked about that yet…"

Requires alternative wording or evidence dump on repeat.

## AK-8 — Memory Debug Mode

**File:** `apps/server/src/services/chat/memoryDebugMode.ts`

When user is clearly testing, shows:

- Entities found
- Memories / events / journal counts
- Retrieval succeeded/failed per layer
- Why retrieval failed

## Gate order (omegaChatService)

1. **Sprint AK** — `routeConversationIntelligence()`
2. Sprint AH — testing, failure recovery, thread recall
3. Mode router (with AK therapist suppression)
4. Normal chat with persona RL

## Success criteria mapping

| Conversation | AK handler |
|---|---|
| Jerry and James | `recall_person` / `person_profile` |
| Tio Juan | Biography suppression + story insight |
| Tia Grace | `person_profile` with evidence |
| Costco with Abuela | Story insight + significance |
| Ashley / Sol | Grouped recall (Sprint AI) + AK evidence |
| LoreBook development | Therapist suppressed, memory_debug |

## Tests

`apps/server/tests/services/sprintAkConversationIntelligence.test.ts`
