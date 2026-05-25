
// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
# Lorekeeper

**Governed autobiographical cognition infrastructure.**

Lorekeeper is a narrative cognition operating system — not a chat app with memory, not a journal with AI. It is a system that compiles lived experience into structured, epistemic, provenance-aware autobiographical memory. Every message a user writes is classified, compiled into an intermediate representation, promoted through a governance pipeline, and made available for narrative synthesis, identity analysis, and explainable retrieval.

The system treats memory as a first-class governed artifact: revisable, traceable, contextual, and owned.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

---

## What This Is

```
raw human experience (chat input)
       ↓
mode classification  (5 modes, LLM + pattern, <300ms)
       ↓
ingestion pipeline   (~30 extractors, parallel)
       ↓
IR compilation       (Lore-keeper Narrative Compiler)
       ↓
epistemic lattice    (proof-carrying knowledge type enforcement)
       ↓
consolidation gate   (canon check + confidence threshold)
       ↓
durable journal_entry with truth_state stamp
       ↓
background engine runtime  (40+ engines, dependency-ordered)
       ↓
narrative synthesis + identity analysis
       ↓
provenance-aware retrieval for future conversations
```

It compiles life into memory the way a compiler compiles code: with typed intermediate representations, invariant enforcement, dependency graphs, and an immutable audit trail.

---

## Architecture Layers

### Layer 1 — Input & Mode Routing

Every chat message passes through `modeRouterService` before any other processing. The mode determines which downstream pipeline fires:

| Mode | Description |
|------|-------------|
| `EXPERIENCE_INGESTION` | Lived experiences with duration and narrative arc (party, trip, conversation) |
| `ACTION_LOG` | Atomic verb-forward moments ("I left", "I said") |
| `MEMORY_RECALL` | Retrieval requests — triggers RAG without ingestion |
| `NARRATIVE_RECALL` | Complex story reconstruction |
| `NARRATIVE_STORY` | Synthesize a narrative from existing memory |
| `EMOTIONAL_EXISTENTIAL` | Emotional support mode — no memory writes |
| `MIXED` | Requires disambiguation before routing |
| `UNKNOWN` | Falls through to standard chat |

The mode router runs pattern matching first (<50ms), escalates to LLM classification only when confidence < 0.8. Mode and confidence are preserved in the response and surfaced to the user via the `ModeAttributionBadge` component using emotionally resonant language ("writing this to memory", "remembering", "holding space").

### Layer 2 — Ingestion Pipeline

`ConversationIngestionPipeline` orchestrates ~30 parallel extractors: entity resolution, relationship detection, event extraction, workout events, biometric extraction, interest tracking, belief challenge detection, quest extraction, contextual intelligence (alias learning, household hypothesis updating), and more.

Each extracted artifact writes to the appropriate domain table and fires a `MemoryFeedbackEvent` via `memoryFeedbackBus` for real-time frontend feedback.

### Layer 3 — LNC (Lore-keeper Narrative Compiler)

The compiler turns raw utterances into typed `EntryIR` (intermediate representations):

```typescript
interface EntryIR {
  knowledge_type: KnowledgeType;     // EXPERIENCE | FEELING | BELIEF | FACT | DECISION | QUESTION
  canon: CanonMetadata;              // CANON | ROLEPLAY | HYPOTHETICAL | FICTIONAL | THOUGHT_EXPERIMENT | META
  certainty_source: CertaintySource; // DIRECT_EXPERIENCE | INFERENCE | HEARSAY | VERIFICATION
  confidence: number;                // 0.0 – 1.0
  entities: EntityRef[];
  emotions: EmotionSignal[];
  themes: ThemeSignal[];
  compiler_flags: CompilerFlags;     // proof-carrying data, promotion history
}
```

The **Epistemic Lattice** enforces typed promotion rules. Every promotion must carry a proof artifact. Key invariants:
- `EXPERIENCE → FACT` (with proof)
- `BELIEF → FACT` (with proof)
- `FEELING → FACT` **forbidden, absolute**
- `QUESTION → anything` **forbidden**
- Downgrades always allowed

### Layer 4 — Memory Consolidation

`memoryConsolidationService` promotes `entry_ir` to durable `journal_entries`:
- Canon gate: only `CANON` entries consolidate automatically
- Confidence gate: < 0.65 → review queue
- `entry_ir` is **never deleted** after consolidation (append-only compiler output)
- Every promoted entry receives a `truth_state` stamp via `truthStateFromConsolidation()`
- Nightly sweep runs for all users via `engineRuntime/scheduler.ts`

### Layer 5 — Engine Runtime

The `EngineOrchestrator` runs 40+ analytical engines in dependency order, up to 5 concurrent:

**Identity:** `identityCore`, `archetype`, `personality`, `shadow`, `alternateSelf`, `innerMythology`
**Emotional:** `eq`, `reflection`, `innerDialogue`, `distortion`, `cognitiveBias`
**Relational:** `social`, `socialProjection`, `influence`, `scenes`, `conflicts`
**Behavioral:** `habits`, `decisions`, `resilience`, `growth`, `values`, `will`
**Life:** `chronology`, `continuity`, `storyOfSelf`, `legacy`, `creative`, `paracosm`
**Domain:** `health`, `financial`, `time`, `location`, `entity`, `event`, `activity`

The `DependencyGraph` prevents cycles and enables safe parallelism. Results are TTL-cached per user.

### Layer 6 — Provenance & Truth-State Governance

Every durable artifact carries epistemic metadata. The `CorrectionAuthority` service enforces valid truth-state transitions through a formal transition graph. Every transition is written to `cognition_mutations` — an append-only audit log, owner read only, no client write access.

Truth states: `CANONICAL`, `CONTEXTUAL`, `REVISED`, `DISPUTED`, `INFERRED`, `PENDING_VERIFICATION`

Exposed via `POST /api/identity/revise/:artifactId` and the `WhatAIKnows` page.

### Layer 7 — Retrieval (RAG)

Hybrid retrieval: vector similarity (pgvector/IVFFlat) + BM25 keyword + entity boosting + temporal scoring + MMR diversity + token-efficiency reranking. Embedding cache uses TinyLFU in-memory + Supabase upsert. `year_shard` index for temporal scaling.

---

## Major Systems

**EntityRegistry** — Single façade over `characters`, `omega_entities`, `people_places`, `entities`. Priority: characters → omega_entities → people_places → entities. The single canonical entity resolution path for all services.

**CognitionEventBus / memoryFeedbackBus** — EventEmitter bridge from the async ingestion pipeline to the frontend via SSE. Powers real-time cognition feedback (`MemoryCognitionPanel`, `CognitionMetaPanel`).

**StoryOfSelfEngine** — Synthesizes narrative arcs across consolidated memories. Surfaces identity motifs and life chapter transitions. Integrated with the `NarrativeStoryPanel`.

**CorrectionAuthority** — Governance service for truth-state transitions. Enforces the transition graph. Checks ownership at DB level. Requires rationale for DISPUTE/CORRECTION. Records everything in `cognition_mutations`.

**WhatAIKnows Page** — User transparency surface at `/what-ai-knows`. Shows every memory, insight, and entity with its truth state. Supports inline revision, audit log view, and full NDJSON export.

---

## Infrastructure

### Database
- Supabase (PostgreSQL + pgvector + RLS), project `mwtyckyguduigflpnqss`
- 160 migrations, 283 tables
- All user-data tables have Row Level Security
- `cognition_mutations`: append-only, owner SELECT only, service role INSERT only

### Auth

| Layer | Mechanism | Use |
|-------|-----------|-----|
| Production | Supabase JWT (`requireAuth`) | All protected routes |
| Development bypass | `DISABLE_AUTH_FOR_DEV=true` | Local dev without real auth |
| Chat routes | `optionalAuth` from `middleware/auth.ts` | Soft-fail in dev, hard-fail in prod |

Security invariants: `DISABLE_AUTH_FOR_DEV=true` in production causes a hard 500. Service role key never committed. `cognition_mutations` has no client INSERT policy.

### Environment

Single `.env` at project root. See `.env.example` for all variables. Dev-only flags:
- `DISABLE_AUTH_FOR_DEV=true` — skip JWT validation (never in production)
- `DEV_AI_FALLBACK=true` — stub AI responses on 429/timeout (never in production)

---

## Development Setup

```bash
npm install
npx supabase start        # requires Docker
./scripts/push-migrations.sh
cd apps/server && npm run dev
cd apps/web && npm run dev
```

Local endpoints: frontend `localhost:5173`, backend `localhost:4000`, Supabase Studio `localhost:54323`

---

## Project Structure

```
lorekeeper/
├── apps/
│   ├── server/src/
│   │   ├── engineRuntime/         # EngineOrchestrator, scheduler, registry (40+ engines)
│   │   ├── middleware/auth.ts     # requireAuth, optionalAuth (canonical)
│   │   ├── routes/                # 100+ route files, routeRegistry.ts
│   │   └── services/
│   │       ├── compiler/          # IRCompiler, epistemicLattice, memoryConsolidationService
│   │       ├── conversationCentered/  # ingestion pipeline + ~30 extractors
│   │       ├── entityRegistry/    # EntityRegistry façade
│   │       ├── modeRouter/        # modeRouterService, modeHandlers
│   │       ├── provenance/        # types.ts, CorrectionAuthority.ts
│   │       ├── chat/              # systemPromptBuilder, ragBuilderService
│   │       └── rag/               # vector + BM25 + reranking
│   └── web/src/
│       ├── components/chat/       # ModeAttributionBadge, MemoryCognitionPanel
│       ├── routes/WhatAIKnows.tsx # Identity custody transparency page
│       └── pages/Router.tsx
├── supabase/migrations/           # 160 migrations, chronological
├── docs/architecture/             # Deep-dive architecture docs
└── scripts/push-migrations.sh
```

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture, request lifecycle, table map |
| [docs/architecture/COGNITION_RUNTIME.md](docs/architecture/COGNITION_RUNTIME.md) | LNC pipeline, mode router, IR types, consolidation |
| [docs/architecture/PROVENANCE_TRUTHSTATE.md](docs/architecture/PROVENANCE_TRUTHSTATE.md) | Truth-state system, CorrectionAuthority, audit log |
| [docs/architecture/IDENTITY_INTEGRITY.md](docs/architecture/IDENTITY_INTEGRITY.md) | RLS, auth layers, WhatAIKnows, ownership model |
| [docs/architecture/SYSTEM_MAP.md](docs/architecture/SYSTEM_MAP.md) | Full lifecycle Mermaid diagrams, event flow, ontology |
| [docs/architecture/ASSESSMENT.md](docs/architecture/ASSESSMENT.md) | Architectural assessment, risks, next phase |
| [docs/architecture/EPISTEMIC_LATTICE.md](docs/architecture/EPISTEMIC_LATTICE.md) | Epistemic proof system, promotion rules |
| [docs/architecture/CORE_ARCHITECTURE.md](docs/architecture/CORE_ARCHITECTURE.md) | Core axioms, four simultaneous processes |

---

## Key Concepts

**entry_ir** — Compiler-style intermediate representation of a raw utterance. Never deleted. The permanent record of what was said before interpretation.

**TruthState** — Epistemic status of a memory: `CANONICAL`, `CONTEXTUAL`, `REVISED`, `DISPUTED`, `INFERRED`, `PENDING_VERIFICATION`.

**KnowledgeType** — What kind of knowledge: `EXPERIENCE`, `FEELING`, `BELIEF`, `FACT`, `DECISION`, `QUESTION`. Governs consolidation behavior and promotion rules.

**CanonStatus** — Whether utterance is real life (`CANON`), hypothetical, roleplay, fictional, etc. Only `CANON` entries auto-consolidate.

**ProvenanceEdge** — Typed directed link between artifacts. Relations: `EXTRACTED_FROM`, `COMPILED_INTO`, `REVISED_BY`, `CONTRADICTS`, `INFERRED_FROM`, `CITED_IN`.

**cognition_mutations** — Append-only audit log of every truth-state change. The complete epistemic history of the system's understanding of a person.

**EntityRegistry** — Canonical resolution path across all four entity tables.

**CorrectionAuthority** — Governance service that enforces valid truth-state transitions and records everything.

---

© 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
