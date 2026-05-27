# Assistant Continuity Identity Audit

**Date:** 2026-05-27  
**Trigger:** Two production failures where the assistant spoke like a stateless chatbot despite full continuity infrastructure being live.

---

## The Fracture

Lorekeeper's architecture says: *persistent autobiographical continuity.*  
The assistant was behaving like: *a stateless chatbot.*

### Exact Failure Cases

**Failure 1 — Continuity question**  
User: "are you going to remember this convo?"  
Response: "I won't be able to remember this specific conversation in the future…"

**Failure 2 — Autobiographical intent**  
User: "well i want to be able to tell my story and what im up to and have remember all of it"  
Response: "I don't have any journal entries to build a narrative from yet."

Both responses are technically honest in a generic LLM context. Both are catastrophic for Lorekeeper's product identity.

---

## Root Cause Analysis

### Cause 1: System prompt told the model to act "like ChatGPT"

`systemPromptBuilder.ts` line 403 (before fix):
```
"Conversational and warm, like ChatGPT but deeply knowledgeable about their lore"
```

This literally instructed the model to inherit ChatGPT's behavioral identity — including its stateless self-understanding. The model's base training says "I don't retain information between sessions." The system prompt reinforced that instead of overriding it.

### Cause 2: No continuity identity block in the system prompt

The system prompt defined personas, lore knowledge, and style — but never told the model:
- What Lorekeeper IS as a runtime
- That conversations are being persisted
- What to say when asked "will you remember this?"
- What NOT to say (the specific anti-patterns)

Without explicit overrides, the base model falls back to trained behavior: "I'm stateless, I reset between sessions."

### Cause 3: Hardcoded empty-state responses used wrong framing

`modeHandlers.ts` NARRATIVE_STORY handler:
```
"I don't have any journal entries to build a narrative from yet. Start writing and I'll weave your story together."
```

This is accurate for a journaling app where the user hasn't written anything yet. It is wrong for a user expressing autobiographical intent for the first time — they're not failing to start, they're starting right now, in this message.

### Cause 4: Mode router can misclassify intent

"I want to be able to tell my story and have you remember all of it" is autobiographical intent — not a NARRATIVE_STORY request. The mode router routed it to a DB query that returned empty, producing the wrong response. The fix in the system prompt handles the LLM path. The hardcoded response fix handles the mode handler path.

---

## Fixes Applied (2026-05-27)

### 1. `systemPromptBuilder.ts` — CONTINUITY IDENTITY block at top

Added a `**LOREKEEPER RUNTIME IDENTITY — HIGHEST PRIORITY**` section as the very first content in the returned system prompt. Placed before all personas so it is highest-priority in the model's context.

Contents:
- Explicit statement: "You are NOT a stateless chatbot"
- Hard rule list: what to NEVER say
- Replacement language: what to say instead for each failure case
- Empty-state rule: never say "I don't have entries yet" — frame as continuity beginning
- Autobiographical intent rule: acknowledge and invite
- Truthfulness constraint: sparse authentic continuity > synthetic richness

### 2. `systemPromptBuilder.ts` — Removed "like ChatGPT"

Before: `"Conversational and warm, like ChatGPT but deeply knowledgeable..."`  
After: `"Conversational and warm — speak like a system that has been quietly building context about this person across time"`

### 3. `modeHandlers.ts` — NARRATIVE_STORY empty state

Before: `"I don't have any journal entries to build a narrative from yet. Start writing and I'll weave your story together."`  
After: `"You're starting to build that story now. As you share — recurring people, places, what you're working on, what matters — Lorekeeper gradually accumulates the patterns that become your narrative. Share something from your life and it becomes part of your record."`

### 4. `modeHandlers.ts` — Memory recall low-confidence (2 instances)

Before: `"I don't have a clear record of that. If you want, you can tell me now and I'll remember it."`  
After: `"I don't have a clear record of that yet. Tell me now and it goes into your lore."`

Change: "If you want" removes intentionality and sounds passive. "Tell me now and it goes into your lore" is direct and establishes that telling = building lore.

### 5. `chatPersona.ts` — Continuity identity in persona definition

Added explicit NEVER/ALWAYS rules to the persona. The persona now establishes Lorekeeper as "a continuity-aware autobiographical runtime — not a stateless chatbot."

---

## Continuity Language Classification

### Continuity-Breaking (eliminated)

| Pattern | Why it breaks continuity |
|---|---|
| "I won't be able to remember this conversation" | Directly contradicts Lorekeeper's core value proposition |
| "Each chat starts fresh" | Implies stateless reset — the opposite of Lorekeeper |
| "As an AI, I can't retain information between sessions" | Base model self-description leaking into product identity |
| "I don't have any journal entries yet" | Frames an empty record as absence rather than beginning |
| "like ChatGPT" in style instructions | Inherits stateless behavioral identity from the instruction itself |

### Continuity-Neutral (acceptable in low-data situations)

| Pattern | Acceptable because |
|---|---|
| "I don't have a clear record of that yet" | Acknowledges absence without claiming permanent statelessness |
| "Tell me now and it goes into your lore" | Honest about current state, frames action as record-building |
| "I wasn't able to build your narrative right now" | Honest about transient failure, not structural impossibility |

### Continuity-Reinforcing (goal state)

| Pattern | Why it works |
|---|---|
| "Lorekeeper builds continuity from recurring conversations" | Accurate, explains the mechanism |
| "What you share here becomes part of your record" | Direct, non-manipulative, factual |
| "Recurring people, moments, and patterns are tracked across sessions" | Specific about what persists |
| "You're starting to build that story now" | Frames empty state as beginning, not absence |
| "Your continuity is forming across sessions" | Honest about gradual accumulation |

---

## Continuity Trust Rules (Permanent)

1. **Never invent memories.** If no record exists, say so and invite them to build it.
2. **Never claim guaranteed recall.** Persistence infrastructure can fail. Frame as "designed to accumulate" not "will always remember."
3. **Never fabricate entity relationships.** Only reference what is in the system prompt context.
4. **Never use emotional manipulation to simulate memory.** Warmth about a person the system hasn't actually tracked is fabrication.
5. **Sparse authentic continuity beats synthetic emotional richness.** A single real detail from stored context is worth more than three invented ones.
6. **When retrieval fails, name the gap honestly.** "I don't have a clear record of that yet" > pretending.

---

## What "Assistant Continuity Coherence" Means

The assistant is continuity-coherent when:

- Its self-description matches what Lorekeeper actually does (accumulates, persists, tracks)
- Its empty-state language frames beginning, not absence
- Its recall language is calibrated to actual stored data confidence
- It never contradicts the product's core architectural claim: persistent autobiographical continuity
- It never imports stateless-chatbot identity from base model training

The assistant is continuity-incoherent when:

- It describes itself as stateless while the user's data is being stored
- It claims "each session is independent" while thread persistence is active
- It says "I won't remember this" while the ingestion pipeline is processing the message in the background
- It responds to autobiographical intent with "I don't have entries yet"

---

## Highest-ROI Fixes (Ranked)

1. **CONTINUITY IDENTITY block in system prompt** — Overrides base model stateless self-description at the source. Fixes the "I won't remember" failure permanently.
2. **Remove "like ChatGPT" from style instructions** — Stops inheriting stateless behavioral identity from the instruction itself.
3. **NARRATIVE_STORY empty state message** — Fixes the exact "I don't have journal entries" failure for the autobiographical intent path.
4. **chatPersona.ts NEVER/ALWAYS rules** — Secondary reinforcement for continuity identity in the persona layer.
5. **Memory recall low-confidence language** — Minor but cumulative: "it goes into your lore" establishes record-building framing.

---

## Open Risks

- **Mode router misclassification**: Autobiographical intent messages may route to NARRATIVE_STORY or MEMORY_RECALL instead of EXPERIENCE_INGESTION. The system prompt fix handles the LLM path, but hardcoded mode responses still need to be continuity-coherent.
- **Base model override**: The LLM may still produce stateless language in edge cases not covered by the explicit anti-pattern list. Monitor for new patterns.
- **Persistence failure transparency**: If the ingestion pipeline fails silently, the assistant may say "it goes into your lore" while the data was never actually stored. Requires backend reliability work, not just language work.
