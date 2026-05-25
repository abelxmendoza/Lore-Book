# Lorekeeper — Cognition Runtime

The cognition runtime is the pipeline that transforms a raw chat message into durable, governed, provenance-aware autobiographical memory. It is not a feature. It is the operating system.

This document describes each stage in the runtime, the contracts between them, and the architectural decisions behind them.

---

## Overview: The LNC Pipeline

**LNC = Lore-keeper Narrative Compiler**

The name is deliberate. The system does not "save" messages — it *compiles* them. Like a language compiler, it:

- Performs lexical analysis (normalization)
- Classifies and types the input (mode routing, knowledge type classification)
- Builds an intermediate representation (EntryIR)
- Enforces invariants (epistemic lattice, canon gate)
- Emits to a target format (journal_entries)
- Maintains a symbol table (EntityRegistry)
- Produces an immutable artifact (entry_ir — never deleted)

---

## Stage 1: Mode Router

**File:** `apps/server/src/services/modeRouter/modeRouterService.ts`

Every message enters `modeRouterService.routeMessage()` before any other logic runs. The mode is a *routing decision*, not a label — it determines which downstream handlers fire.

### Mode taxonomy

```
EXPERIENCE_INGESTION    Lived experience with duration, narrative arc, context
ACTION_LOG              Atomic verb-forward moment (no duration, minimal context)
MEMORY_RECALL           Retrieval intent — triggers RAG, suppresses ingestion writes
NARRATIVE_RECALL        Complex story reconstruction from memory
NARRATIVE_STORY         Synthesize a story from existing memory (creative/reflective)
EMOTIONAL_EXISTENTIAL   Processing thoughts/fears/insecurities — no memory writes
NEEDS_CLARIFICATION     Ambiguous milestone: ask before ingesting
MIXED                   Disambiguation required before routing
UNKNOWN                 Fall through to standard chat
```

### Routing strategy

1. **Pattern pass (<50ms):** Regex + keyword heuristics. If confidence > 0.8, return immediately.
2. **LLM pass (<250ms):** Structured prompt to GPT. Returns mode, confidence, reasoning.
3. **Combine pass:** Weighted merge of pattern and LLM results.

The result — `ModeRoutingResult { mode, confidence, reasoning }` — is attached to the response and forwarded to the `ModeAttributionBadge` frontend component.

### Risk: over-classification

The mode router is the earliest and highest-impact single point of failure in the pipeline. A misclassified `EMOTIONAL_EXISTENTIAL` means no memory write happens for a lived experience. A misclassified `EXPERIENCE_INGESTION` on a hypothetical means fictional content gets compiled as real memory.

The `NEEDS_CLARIFICATION` mode and the `CanonStatus` system (`ROLEPLAY`, `HYPOTHETICAL`, `FICTIONAL`) are partial mitigations, but the classification confidence threshold is not user-configurable and the misclassification audit trail is weak. See [ASSESSMENT.md](ASSESSMENT.md).

---

## Stage 2: Ingestion Pipeline

**File:** `apps/server/src/services/conversationCentered/ingestionPipelineClass.ts`

For `EXPERIENCE_INGESTION` and `ACTION_LOG` modes, the full `ConversationIngestionPipeline` fires. It runs ~30 extractors, most in parallel, all writing to domain tables:

### Extractor categories

| Category | Extractors |
|---|---|
| Entity | entity resolution, ambiguity detection, entity scope, entity attributes |
| Relationship | relationship dynamics, romantic detection, breakup detection, relationship drift, relationship cycles |
| Event | event extraction, event impact, event causality |
| Social | group detection, group networks, skill networks |
| Domain | workout events, biometric extraction, interest detection/tracking, quest extraction |
| Contextual | alias learning, household hypothesis updating, contextual event linking |

### Feedback bus

After each significant extraction event, the pipeline fires a `MemoryFeedbackEvent` on `memoryFeedbackBus` (an EventEmitter). These events are streamed to the frontend via SSE and surface in `MemoryCognitionPanel`. The bus decouples the pipeline from the UI completely — the pipeline doesn't know the client exists.

### Architectural note

The ingestion pipeline has grown organically to ~30 extractors. Each extractor writes independently to its own table — there is no unified transaction. Partial pipeline failures (one extractor throws) do not roll back the others. This is intentional: partial ingestion is better than no ingestion. But it means the database can reach inconsistent states under failure. An idempotency mechanism exists (checking for prior ingestion by `chatMessageId`) but does not cover partial runs. See [ASSESSMENT.md](ASSESSMENT.md).

---

## Stage 3: IR Compilation

**File:** `apps/server/src/services/compiler/irCompiler.ts`

The `IRCompiler` converts a normalized utterance into an `EntryIR`.

### EntryIR type

```typescript
interface EntryIR {
  id: string;
  user_id: string;
  source_utterance_id: string;
  thread_id: string;
  timestamp: string;

  // Epistemic classification
  knowledge_type: KnowledgeType;     // EXPERIENCE | FEELING | BELIEF | FACT | DECISION | QUESTION
  certainty_source: CertaintySource; // DIRECT_EXPERIENCE | INFERENCE | HEARSAY | VERIFICATION | MEMORY_RECALL
  confidence: number;                // 0.0 – 1.0

  // Reality boundary
  canon: CanonMetadata;              // status: CANON | ROLEPLAY | HYPOTHETICAL | FICTIONAL | META

  // Extracted signals
  entities: EntityRef[];
  emotions: EmotionSignal[];
  themes: ThemeSignal[];

  // Compiler metadata
  compiler_flags: CompilerFlags;     // dirty bit, version, promotion history, proof-carrying data
}
```

### Knowledge type taxonomy

```
EXPERIENCE    First-hand lived event ("I went to the concert")
FEELING       Internal emotional state ("I felt overwhelmed")
BELIEF        Held proposition ("I think she's angry at me")
FACT          Verified, stable truth ("My dog's name is Milo")
DECISION      Chosen course of action ("I decided to quit")
QUESTION      Open inquiry ("I wonder if I should move")
```

The knowledge type governs:
1. Which consolidation path the IR takes
2. Which epistemic promotions are permitted (see Stage 3b)
3. How the entry is surfaced in narrative synthesis

### Canon boundary

The `canonDetectionService` classifies whether an utterance is about real life or something else. Only `CANON` entries auto-consolidate to durable memory. This is the system's defense against compiling roleplay scenarios, hypotheticals, or creative fiction into the user's autobiographical record.

> **Risk:** The canon detector is heuristic, not perfect. A user in deep roleplay context who says "I just killed someone" should not compile as a biographical fact. The `FICTIONAL` and `ROLEPLAY` states mitigate this, but the classifier can be defeated by ambiguous phrasing. The `NEEDS_CLARIFICATION` mode exists for this case but is not always triggered.

---

## Stage 3b: Epistemic Lattice

**File:** `apps/server/src/services/compiler/epistemicLattice.ts`

The lattice formalizes which knowledge type promotions are allowed and requires cryptographic-style *proof* for each one.

### Partial order (⊑)

```
EXPERIENCE ⊑ FACT    (can promote with proof)
BELIEF     ⊑ FACT    (can promote with proof)
FACT       ⊑ (none)  (no promotions from FACT)
FEELING    ⊑ (none)  (never promotable — absolute invariant)
DECISION   ⊑ (none)
QUESTION   ⊑ (none)
```

### Forbidden edges (absolute, no proof overrides)

```
FEELING  → FACT
FEELING  → BELIEF
QUESTION → FACT
QUESTION → BELIEF
QUESTION → EXPERIENCE
DECISION → FACT
```

### Proof-carrying data

Every promotion must carry an `EpistemicProof`:

```typescript
interface EpistemicProof {
  rule_id: string;          // "EXPERIENCE_TO_FACT"
  source_entries: string[]; // EntryIR IDs used as evidence
  confidence: number;       // ≥ 0.6 required
  generated_at: string;
  generated_by: 'SYSTEM' | 'USER';
  reasoning?: string;
}
```

This is stored in `compiler_flags.promotion_proof` on the EntryIR.

> **Architecture note:** The epistemic lattice is one of the strongest design decisions in this system. It prevents belief from being silently elevated to fact — a failure mode common in naive RAG systems where the model repeats user beliefs as established facts in later retrievals. The proof requirement creates an explicit audit trail for every knowledge upgrade.

---

## Stage 4: Memory Consolidation

**File:** `apps/server/src/services/compiler/memoryConsolidationService.ts`

Consolidation is the gate between compiler output and durable memory.

### Decision tree

```
EntryIR
  │
  ├─ canon.status ≠ CANON?  ──→  SKIPPED (never auto-consolidates)
  │
  ├─ knowledge_type in REVIEW_REQUIRED_TYPES (BELIEF, FEELING, QUESTION)?
  │     └──→  QUEUED_FOR_REVIEW
  │
  ├─ confidence < 0.65?
  │     └──→  QUEUED_FOR_REVIEW (or SKIPPED for some types)
  │
  └─ already consolidated?  ──→  ALREADY_CONSOLIDATED (idempotent)
        │
        └─ promote to journal_entry
             ├─ embed content (embeddingService)
             ├─ stamp truth_state (truthStateFromConsolidation)
             └─ CONSOLIDATED
```

### Truth state at consolidation

`truthStateFromConsolidation(confidence, canonStatus)` returns:

- `CANONICAL` — high confidence, CANON entry
- `INFERRED` — moderate confidence, or inferred from context
- `PENDING_VERIFICATION` — low confidence but above floor

The `truth_state` field on `journal_entries.metadata` is what the `CorrectionAuthority` and `WhatAIKnows` page read.

### Invariants

- `entry_ir` rows are **never deleted** after consolidation — they are the permanent compiler output
- Consolidation is idempotent — calling it twice on the same IR produces `ALREADY_CONSOLIDATED`
- Failed embedding writes do not block consolidation (the entry is written without vector, with a log warning)
- The confidence threshold (0.65) is a tunable constant — monitor via `/api/admin/memory-health`

---

## Stage 5: Engine Runtime

**Files:** `apps/server/src/engineRuntime/`

The engine runtime fires after consolidation, typically asynchronously. It reads the current state of a user's memory and synthesizes higher-order insights.

### Orchestration

`EngineOrchestrator.runAll()` uses a `DependencyGraph` to:
1. Topologically sort engines by dependency
2. Run independent engines in parallel (up to `maxConcurrency = 5`)
3. Pass results from upstream engines to downstream ones via `EngineContext`

The `EngineContext` is read-only — engines cannot mutate the source memory. They write only to `engine_results` (TTL-cached) and domain-specific output tables.

### Nightly scheduler

`engineRuntime/scheduler.ts` runs nightly for all active users:
1. Fetches all users
2. Runs the engine suite for each
3. Runs `memoryConsolidationService.sweepPendingForUser()` for each
4. Logs failures as warnings (non-critical — user data is not corrupted)

### Engine registry

40+ engines across identity, emotional, relational, behavioral, life, and domain categories. See README for full list. Each engine is a pure function of `EngineContext → EngineResult`. Adding a new engine requires only registering it in `engineRegistry.ts` — the orchestrator picks it up automatically.

> **Risk:** The engine runtime has no per-engine timeout. A single hung engine can block the entire nightly sweep for a user. The `maxConcurrency` limit prevents total parallelism from overwhelming the DB, but does not protect against individual engine hangs. Engine-level timeout wrappers would materially improve reliability.

---

## Cognition Event Flow (End-to-End)

```
User message arrives at POST /api/chat/stream
       │
       ├─ modeRouterService.routeMessage()           [<300ms]
       │
       ├─ RAG retrieval (if MEMORY_RECALL)           [<500ms]
       │
       ├─ omegaChatService stream response to client  [streaming]
       │
       └─ ingestionQueue.enqueue() — fire and forget
              │
              ├─ conversationIngestionPipeline.ingest()
              │     ├─ ~30 extractors (parallel)
              │     └─ memoryFeedbackBus.emit('ingestion_started')
              │
              ├─ irCompiler.compileUtteranceToIR()
              │     ├─ epistemicLattice.validate()
              │     └─ memoryFeedbackBus.emit('ir_compiled')
              │
              ├─ memoryConsolidationService.consolidate()
              │     └─ memoryFeedbackBus.emit('memory_promoted')
              │
              └─ [nightly] engineRuntime.runAll()
                    └─ memoryFeedbackBus.emit('insight_ready')
```

The frontend receives `MemoryFeedbackEvent` objects via SSE and renders them in `MemoryCognitionPanel`. The mode decision is shown in `ModeAttributionBadge` using emotionally resonant labels.

---

## Cognition UX Layer

**Files:** `apps/web/src/components/chat/`

### ModeAttributionBadge
Compact badge below every assistant message showing mode using emotional language:
- `EXPERIENCE_INGESTION` → "writing this to memory"
- `MEMORY_RECALL` → "remembering"
- `EMOTIONAL_EXISTENTIAL` → "holding space"
- `NARRATIVE_STORY` → "telling your story"

Confidence shown as dot opacity (not a number). Hover reveals reasoning. Hidden for UNKNOWN or confidence < 0.45.

### MemoryCognitionPanel
Expandable panel showing real-time pipeline events as they fire. Renders extraction results, IR confidence, consolidation status. Receives events via `memoryFeedbackBus` → SSE → client.

### CognitionMetaPanel
Dev-mode panel showing mode router decision, RAG stats, and system prompt composition.

---

## Architectural Observations

1. **The compiler metaphor is the right frame.** IR → consolidation → engine synthesis maps cleanly onto compile → link → run. This frame should be preserved as the system evolves.

2. **The epistemic lattice is underutilized.** Proof-carrying data exists in the type system and is stored in `compiler_flags`, but there is no UI or API surface that exposes it. Users cannot see *why* something was promoted to a fact. This is a gap in the transparency story.

3. **The consolidation threshold (0.65) is a single global constant.** Different users and different contexts will need different thresholds. A per-user or per-knowledge-type confidence profile would improve precision.

4. **The `entry_ir` table is growing unboundedly.** It is correctly never deleted, but there is no compaction, archival, or tombstone strategy. At scale, the table will become a major query bottleneck.

5. **The engine runtime has no execution budget.** Engines run until they finish. A governance layer that sets time budgets and priority weights per engine per user would make the runtime production-safe.
