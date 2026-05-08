# LoreKeeper — Core Architecture

> Merged from: `LOREKEEPER_CORE_BLUEPRINT.md`, `CORE_INVARIANTS.md`, `DIALOGIC_MEMORY_OS.md`, `HOSTILE_REVIEW_RESPONSE.md`, `CODEX_BLUEPRINT.md`

---

## Axioms (Non-Negotiable)

These are the load-bearing constraints of the entire system. Any code change must justify why it doesn't violate them.

- **Conversation is the only write surface** — Users can only write through conversation/chat
- **Memory is never edited, only reinterpreted** — Original utterances are immutable
- **Belief ≠ Fact ≠ Feeling (ever)** — Epistemic boundaries are strictly enforced
- **Contradictions are data, not errors** — Contradictions are preserved, not resolved
- **All intelligence is contract-gated** — Access to memory requires explicit epistemic contracts
- **All downstream systems are read-only** — No system can modify source memory

---

## The Core Reframe

**LoreKeeper is a dialog-driven sensemaking engine, not a document generator.**

Biographies, timelines, profiles, identity panels — those are views, not sources of truth.

**The source of truth is the conversation loop.**

---

## Four Simultaneous Processes (Every Chat Message)

### 1. Truth-Seeking (Epistemic Layer)
The system continuously asks:
- Is this first-hand or second-hand?
- Is this belief stable or provisional?
- Does this contradict earlier claims?
- Is this an update, a correction, or a reflection?

Nothing is assumed true just because it's said once.

### 2. Memory Structuring (Ontology Layer)
Chat messages are decomposed into:
- **memories** (experienced)
- **perceptions** (believed/heard)
- **reactions** (felt/responded)
- **decisions** (chosen)
- **claims** (asserted)
- **revisions** (retracted or refined)

This prevents duplication, belief ossification, and narrative drift.

### 3. Contradiction & Duplication Handling
The system does not overwrite, does not delete, does not collapse contradictions prematurely.

Instead it tracks:
- parallel beliefs
- belief lifespans
- confidence decay
- reconciliation moments

**Contradiction is treated as data, not error.**

### 4. Narrative Compilation (Presentation Layer)
Only after sensemaking do you generate biographies, timelines, profiles, summaries. These are views derived from truth — not the truth itself.

---

## Conversation Ingestion Pipeline

```typescript
function ingestConversationMessage(userId, threadId, role, rawText) {
  const normalized = normalizeText(rawText)

  const utterance = saveUtterance({
    userId, threadId, role, rawText, normalizedText: normalized
  })

  // Non-blocking, failure-tolerant
  compileToIR(utterance)
  enrichUtterance(utterance)
}
```

**Key principles:**
- All user input is saved as utterances
- Normalization happens at ingestion
- Processing is non-blocking and failure-tolerant
- Original text is never modified

---

## Epistemic Type System

Every utterance is compiled to `EntryIR` with:
- `knowledge_type`: `EXPERIENCE | FEELING | BELIEF | FACT | DECISION | QUESTION`
- `canon_status`: `CANON | ROLEPLAY | HYPOTHETICAL | FICTIONAL | THOUGHT_EXPERIMENT | META`
- `confidence`: `0.0 - 1.0`
- `certainty_source`: `DIRECT_EXPERIENCE | INFERENCE | HEARSAY | VERIFICATION | MEMORY_RECALL`

**Compile-time guarantees:**
- No code path promotes `BELIEF → FACT`
- Low-confidence `FACT` entries are downgraded to `BELIEF`
- `EXPERIENCE` and `FEELING` are never downgraded
- Type checking at compile time, not runtime

---

## Chat Mode Router

Every message is classified into one of these modes before any processing:

| Mode | Trigger | Response |
|------|---------|---------|
| `EMOTIONAL_EXISTENTIAL` | Feelings, fears, insecurities | Emotional support, no memory lookup |
| `MEMORY_RECALL` | Factual questions ("what did I eat?") | Database lookup, cite sources |
| `NARRATIVE_RECALL` | Story questions ("what happened with X?") | Multi-version story response |
| `EXPERIENCE_INGESTION` | Time-bounded experiences ("last night I...") | Capture, minimal ack |
| `ACTION_LOG` | Explicit commands ("log this: ...") | Log + brief AI ack |
| `NEEDS_CLARIFICATION` | Ambiguous milestone ("I got X working") | Ask what they mean |
| `UNKNOWN` | Everything else | Full RAG pipeline → OpenAI |

**Important:** `ACTION_LOG` only fires for explicit commands (`log this`, `save this`, `journal entry:`, `memory:`, `lore note:`). Normal first-person sentences ("I thought...", "I felt...") must always fall through to `UNKNOWN`.

**Files:** `apps/server/src/services/modeRouter/modeRouterService.ts`, `apps/server/src/services/modeRouter/modeHandlers.ts`

---

## Constitutional Invariants

These are file-level contracts. Any change to these files requires justification that the invariant is preserved.

### `compiler/irCompiler.ts`
**Invariant:** Dialog compilation is the only path to memory creation. No memory mutation outside the chat loop.
- Every `EntryIR` has a `source_utterance_id`
- Utterances are immutable after creation
- Compilation happens at ingestion, not retroactively

### `compiler/epistemicTypeChecker.ts`
**Invariant:** Beliefs never become facts.
- No code path promotes `BELIEF → FACT`
- Low-confidence `FACT` entries are downgraded to `BELIEF`

### `beliefRealityReconciliationService.ts`
**Invariant:** Uncertainty is preserved, not erased.
- All beliefs have a resolution status (`UNRESOLVED`, `SUPPORTED`, `CONTRADICTED`, etc.)
- Contradicting evidence is never deleted
- Belief evolution is tracked, not rewritten

### `contracts/contractEnforcer.ts`
**Invariant:** All memory access is contract-gated.
- Every memory consumer must declare a contract
- Non-canon entries are excluded from analytics by default
- Contracts are system-owned, not LLM-generated

---

## Memory Entry Structure

```typescript
interface EntryIR {
  knowledge_type: KnowledgeType;  // Required
  canon_status: CanonStatus;      // Required, defaults to CANON
  confidence: number;             // Required, validated 0-1
  certainty_source: CertaintySource; // Required
  source_utterance_id: string;    // Required — links back to raw conversation
}
```

---

## Intelligence Layers (CODEX)

### Layer 1: Ingestion
Raw conversation → normalized utterances → semantic units (non-blocking)

### Layer 2: Pattern Recognition
- Emotional arc detection
- Recurring themes
- Behavioral loop identification
- Identity drift signals

### Layer 3: Insight Synthesis
- Cross-temporal connections
- Archetype mapping
- Relationship network analysis
- Predictive continuity

### Layer 4: Presentation
- Chat responses (personalized persona blend)
- Timeline visualization
- Identity profile
- Biography generation

---

## Epistemic Guarantees

For the full set of falsifiable claims, SQL audit queries, worked examples, and known hard problems, see:

**→ [SYSTEM_REALITY_CHECK.md](SYSTEM_REALITY_CHECK.md)**

Summary of claims:

- Beliefs never become facts (enforced at compile time in `epistemicTypeChecker.ts`)
- Non-canon content never pollutes analytics (enforced by `contractEnforcer.ts`)
- Contradictions are preserved, not resolved (schema-level in `belief_resolutions`)
- All memory originates from conversation (`source_utterance_id` required on every entry)

---

## Key Source Files

| Concept | File |
|---------|------|
| Mode routing | `services/modeRouter/modeRouterService.ts` |
| Mode handlers | `services/modeRouter/modeHandlers.ts` |
| IR compiler | `services/compiler/irCompiler.ts` |
| Epistemic type checker | `services/compiler/epistemicTypeChecker.ts` |
| Contract enforcer | `contracts/contractEnforcer.ts` |
| Belief reconciliation | `services/beliefRealityReconciliationService.ts` |
| Canon detection | `services/canonDetectionService.ts` |
| Memory retriever | `services/chat/memoryRetriever.ts` |
| Omega chat service | `services/omegaChatService.ts` |
