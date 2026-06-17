# Recall Trace Report

Status: Chat Trust Sprint — Phase 4.
Companion: [retrieval-quality-report.md](retrieval-quality-report.md). Grounded in the live founder graph + code trace of `omegaChatService.chatStream`.

## The live recall pipeline (stream path)

```
User question
  → mode routing (modeRouterService)            WORKING_MEMORY_PRIMARY=true (default) ⇒ recall stays on main path
  → entity ambiguity detection (advisory)        omegaChatService.ts:1175-1205
  → RAG packet assembly → ragPacket.workingMemory omegaChatService.ts:1330-1331
  → buildSystemPrompt(... entityAnalytics=NULL ...) omegaChatService.ts:1350 / :461
  → OpenAI stream
  → persistAssistant (chat.ts:188)
```

Config reality: `workingMemoryPrimary = process.env.WORKING_MEMORY_PRIMARY !== 'false'` → **true** (unset on Railway). So the working-memory assembler is the **primary** retrieval engine, and recall-mode messages flow through the main durable path (good — this is also why the disappearing-message bug is mostly historical).

## What is *available* to retrieve (founder `789bd607`, live counts)

| Layer | Table | Count | In the prompt today? |
| --- | --- | --- | --- |
| Entities | `omega_entities` / `people_places` | 97 / 52 | ✅ via working memory |
| Relationships | `character_relationships` / `romantic_relationships` | 21 / 4 | ⚠️ partial; `omega_relationships`=0 |
| Events | `resolved_events` | 30 | ⚠️ depends on assembler scope |
| **Episodes** | `episodes` | **0 (table missing)** | ❌ **nothing to retrieve** |
| Continuity signal | `continuity_events` | 425 | ⚠️ underused |
| **Provenance** | `provenance_edges` | **0** | ❌ no citations possible |
| Entity analytics | computed | n/a | ❌ **hardcoded null in stream** (`:1207`) |

## Trace findings

1. **Memory *is* retrieved** — `ragPacket.workingMemory` is assembled and passed to the prompt. Recall is not wholly broken; the question is *quality and completeness*, not total absence.
2. **Episodes contribute nothing.** The richest narrative unit (a titled, entity/location-scoped scene) is **0 rows** because the `episodes` table was never deployed (see [arc-readiness-report.md](arc-readiness-report.md)). Recall therefore falls back to raw entities/entries — flatter, less story-like context.
3. **Entity analytics block is disabled on the stream path.** `omegaChatService.ts:1207-1210` hardcodes `entityAnalytics/entityConfidence/analyticsGate = null`, so `buildSystemPrompt` skips the per-entity closeness/trust/sentiment/importance block (`systemPromptBuilder.ts:205-235`). When the user chats *about a person*, the model gets the name but not the relationship texture → generic, "I don't have much on them" answers even though analytics exist elsewhere.
4. **Split-brain retrieval risk.** Relationships live in `character_relationships` (21) while `omega_relationships` is empty; events in `resolved_events` (30) while `event_records` is empty. If the assembler queries the empty mirror for any layer, that layer silently contributes nothing.
5. **No provenance** → the assistant cannot say *why* it knows something or cite the source memory; recall is unexplainable by construction (`provenance_edges`=0).

## Net

Recall is **wired and partially functional**, but **thin**: it retrieves entities, weakly retrieves relationships/events, retrieves **no episodes**, injects **no entity analytics** (stream), and can offer **no provenance**. That combination is exactly what produces correct-but-shallow answers. Specific quality root causes and fixes are in the retrieval-quality report.
