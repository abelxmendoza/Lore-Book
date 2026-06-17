# Working Memory Benchmark

Status: baseline plan for Working Memory Integration Sprint.

## Goal

Measure retrieval behavior before and after replacing RAG-layer foundation recall with the Working Memory Assembler.

Primary target:

```text
Question -> Working Memory Assembler -> Memory Packet -> LLM
```

## Before

The old live chat path could perform multiple retrieval passes:

- Conversation intelligence recall.
- AH trust/diagnostic recall.
- Mode-router memory/foundation handlers.
- Explicit recall service.
- Memory recall engine.
- RAG packet retrieval.
- `routeRecallQuery()` again inside `ragBuilderService`.
- Separate relationship/timeline queries inside RAG.

Expected problems:

- Duplicate DB queries.
- Multiple entity scans.
- Prompt bloat from static lore lists.
- Inconsistent "I don't remember" behavior.
- Entity exists but no story assembled.

## After

The RAG-layer foundation recall source is now:

```text
assembleWorkingMemory()
-> buildWorkingMemoryPacket()
-> systemPromptBuilder WORKING MEMORY block
```

The packet is budgeted and every item contains:

- source
- confidence
- reason selected
- score

## Metrics

| Metric | Before Measurement | After Measurement |
| --- | --- | --- |
| DB queries | Count Supabase calls in live chat path or logs. | Count assembler calls plus remaining non-memory prompt data. |
| Entity scans | Count `characters`, `people_places`, `locations`, `organizations`, `omega_entities` reads per turn. | Working Memory target resolution plus bounded source reads. |
| Retrieval latency | Time `buildRAGPacket()` and recall gates. | Time `assembleWorkingMemory()` and packet formatting. |
| Recall accuracy | Case assertions below. | Same assertions, with selected/rejected evidence. |
| Prompt size | Character count/token estimate of system prompt. | Working Memory packet size plus remaining prompt sections. |
| Token usage | OpenAI usage metadata where available. | Compare after packet budget tuning. |

## Current Expected Query Reduction

The duplicate RAG-layer `routeRecallQuery()` call has been removed.

Before RAG could query:

- `people_places` for known entities.
- `characters` for entity detection.
- `narrative_accounts` for biography.
- `character_relationships`.
- `character_timeline_events`.

After RAG uses the assembler's bounded reads and packet output for this layer. Some static lore queries remain because prompt assembly still uses broader lore sections; those are candidates for the next consolidation step.

## Acceptance Cases

### Costco

Question:

```text
What did I do with Abuela today?
```

Expected:

- Select the Costco trip if evidence exists in journal/chat/timeline.
- Include Abuela as a person/family anchor.
- Do not answer "I don't have a record" if any selected/relevant context exists.

### Tía Grace's House

Question:

```text
What happened at Tía Grace's house?
```

Expected selected context:

- James.
- Jerry.
- Coding.
- Smoking.
- Magic the Gathering.
- Place/household context.

### Ashley

Question:

```text
What do you know about Ashley?
```

Expected:

- Character/entity record.
- All high-ranked linked Ashley episodes.
- Timeline/facts/relationship context if present.
- No empty character-card answer when episodes exist.

### Sol

Question:

```text
What happened with Sol?
```

Expected:

- Relationship timeline.
- Relationship facts.
- Relevant episodes.
- No generic therapy response detached from evidence.

## Diagnostic Endpoint

Use:

```http
POST /api/diagnostics/working-memory
{
  "question": "What do you know about Ashley?",
  "threadId": "optional-thread-id",
  "maxItems": 20
}
```

The endpoint returns:

- selected memories
- rejected memories
- scores
- budget allocation
- packet text
- reasoning path

## Coverage Audit

Use:

```http
GET /api/diagnostics/memory-coverage
```

This identifies entities that exist but lack:

- episodes
- events
- relationships
- evidence

Every entity receives a coverage score from 0 to 100.

## Next Bench Implementation

1. Add lightweight query-count instrumentation around `supabaseAdmin.from()` for diagnostics-only runs.
2. Add latency timers around `assembleWorkingMemory()` and `buildRAGPacket()`.
3. Persist benchmark snapshots for the four acceptance cases.
4. Tune per-intent budgets after real prompt-size measurements.

## Keep / Merge / Delete

Keep now:

- Working Memory Assembler.
- Memory coverage audit.
- Diagnostics endpoint.
- Context scoring as final prompt guard.

Merge next:

- `conversationIntelligenceRouter`.
- `recallQueryRouter`.
- `explicitRecallService`.
- `failureAwareHandler`.

Delete after parity:

- Duplicate RAG recall routing.
- Redundant regex recall cascades.
- Legacy "I don't remember" paths that bypass Working Memory.
