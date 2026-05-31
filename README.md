# Lorekeeper

<!-- © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved. -->

**A system that gradually understands your life.**

Lorekeeper is a conversational runtime that accumulates biographical context over time. Every conversation adds to a growing record — people, places, recurring situations, decisions, emotional patterns, behavioral evidence. Future conversations draw on that record, and over time the system earns genuine knowledge about who you are and how you live.

This is not a chatbot with memory bolted on. The continuity loop is the product.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

---

## What It Does

When you send a message, two things happen simultaneously:

1. You get a response from the assistant
2. The message passes through an ingestion pipeline that extracts people, events, decisions, patterns, and recurring themes — and persists them to your record

The record accumulates across threads and sessions. The assistant reads from it on every response, so mentions of "my sister" eventually resolve to a specific person with a history rather than an anonymous noun. Over time, behavioral patterns crystallize into durable knowledge claims — explainable conclusions drawn from evidence, not inference.

---

## Architecture Overview

### The Intelligence Stack

```text
Raw messages
   ↓
Ingestion pipeline (entity extraction, event detection, relationship tracking)
   ↓
Event candidates (recurring behavioral scenes)
   ↓
Life arcs (named temporal containers: "The Startup Years", "With Jordan")
   ↓
Knowledge crystallization (behavioral patterns → durable claims with evidence)
   ↓
WHAT LOREBOOK KNOWS block in every system prompt
```

### Knowledge Crystallization

The system earns knowledge from behavioral evidence — what you repeatedly do, not just what you say about yourself. Every knowledge claim is:

- **Evidence-backed** — built from recurring `event_candidates`, life arcs, user reflections
- **Confidence-scored** — 5-factor formula: base evidence × temporal stability × cross-context × recency × contradiction penalty
- **Explainable** — every claim traces to specific source rows via `knowledge_evidence_links`
- **Lifecycle-managed** — ACTIVE → DORMANT → HISTORICAL → SUPERSEDED; nothing is silently deleted

AI-generated claims never count as evidence. Only behavioral observation does.

### Relationship Intelligence

Romantic relationships are tracked at full depth: drift direction, active cycles (push-pull, hot-cold, toxic patterns), recent interactions logged from natural conversation (no forms), cross-relationship pattern analysis across your full history, and a relationship influence view showing which relationships shaped your life and how.

The system prompt for relationship conversations reads like a trusted advisor who has read your journals — because it has.

### Temporal Intelligence

Five systems handle time, each answering a different question:

| System | Question |
| ------ | -------- |
| ChronologyEngine V1 | What caused what? What patterns exist? What's missing? |
| ChronologyService V2 | Give me events in order. Find overlaps. Bucket by year. |
| Timeline Hierarchy | What is the narrative structure? (9-layer: Mythos → MicroAction) |
| TimelineInsight | What gaps exist? What was happening in parallel? |
| Life Arcs | What named life periods exist, and how do they connect causally? |

Allen's interval algebra (all 13 relations) powers temporal relationship detection. Chronology findings are bridged into `arc_relationships` rather than orphaned. Gaps are typed and persisted as hierarchy nodes.

See [`TEMPORAL_ARCHITECTURE.md`](TEMPORAL_ARCHITECTURE.md) for the full reference.

### Mode Router

Every message is classified before processing:

| Mode | What It Does |
| ---- | ------------ |
| `EXPERIENCE_INGESTION` | Lived experience → full ingestion pipeline |
| `ACTION_LOG` | Atomic event → lighter extraction path |
| `MEMORY_RECALL` | Retrieval request → RAG without ingestion |
| `NARRATIVE_STORY` | Synthesize narrative from existing record |
| `EMOTIONAL_EXISTENTIAL` | Support mode — no memory writes |

Pattern matching runs first (<50ms). LLM classification fires only when confidence < 0.8.

### Ingestion Pipeline

12-step pipeline orchestrating ~30 parallel extractors: entity resolution, relationship detection, event extraction, romantic interaction logging, interest tracking, belief challenge detection, and more. Each extraction writes to the appropriate domain table. Every pipeline run is tracked in `pipeline_runs`.

### Entity System

Single `EntityRegistry` façade over four entity tables. Priority resolution: `characters` → `omega_entities` → `people_places` → `entities`. Jaro-Winkler similarity for near-duplicate detection. Entity confidence grows with repeated mentions.

### Retrieval (RAG)

Hybrid: pgvector similarity + BM25 keyword + entity boosting + temporal scoring + MMR diversity reranking. Entities in your record are weighted higher in retrieval. Embedding cache: TinyLFU in-memory + Supabase upsert.

---

## Continuity Philosophy

**Sparse authentic continuity beats fake rich cognition.**

Lorekeeper only asserts what it has actually seen you share. It doesn't fabricate memory. It doesn't hallucinate prior conversations. When it doesn't know something, it says so and invites you to share it.

The design principle: one genuinely earned fact is worth more than ten inferred ones. Knowledge builds slowly and honestly.

---

## What Gets Remembered

**People** — Anyone you mention regularly becomes a tracked character with their own history, alias resolution, and relationship arc.

**Events** — Things that happened with a beginning and end: a trip, a job change, a difficult conversation, a decision made.

**Recurring situations** — When the same people or themes appear across multiple sessions, they become `event_candidates` — named behavioral scenes that accumulate into life arcs.

**Relationships** — Romantic relationships tracked in depth: type, status, drift direction, behavioral cycles, key milestones, red/green flags, influence on the broader life arc graph.

**Knowledge claims** — Behavioral patterns, values, lessons, and beliefs that crystallize from evidence over time. Each claim carries a confidence score and a full evidence trace.

**Decisions and beliefs** — Major choices and held positions, with the ability to revise them later.

---

## What It Intentionally Doesn't Do

- Does not fabricate prior conversations
- Does not claim to have saved something that failed to save
- Does not infer rich context from thin signals
- Does not import from external apps or services
- Does not watch behavior outside of conversations
- Does not share your record with third parties
- Does not treat AI-generated summaries as evidence for knowledge claims

Everything Lorekeeper knows about you comes from what you explicitly shared.

---

## Infrastructure

- **Backend:** Node.js / Express, TypeScript, Supabase PostgreSQL + pgvector
- **Frontend:** React + Vite, TypeScript, React Router
- **Database:** 283+ tables, 160+ migrations, Row Level Security on all user data
- **Auth:** Supabase JWT, Bearer token, dev bypass available locally

---

## Development Setup

```bash
npm install
npx supabase start        # requires Docker
./scripts/push-migrations.sh
cd apps/server && npm run dev
cd apps/web && npm run dev
```

Local: frontend `localhost:5173`, backend `localhost:4000`, Supabase Studio `localhost:54323`

Environment: copy `.env.example` → `.env`. Key dev flags:

- `DISABLE_AUTH_FOR_DEV=true` — skip JWT (never in production)
- `DEV_AI_FALLBACK=true` — stub AI responses on rate limits

---

## Project Structure

```text
lorekeeper/
├── apps/
│   ├── server/src/
│   │   ├── services/
│   │   │   ├── knowledgeCrystallization/   # claims, confidence engine, lifecycle
│   │   │   ├── chronology/                 # V1 engine, arc bridge, gap nodes
│   │   │   ├── chat/                       # systemPromptBuilder, ragBuilder, relationship context
│   │   │   ├── continuityRuntime/arcs/     # arc inference, memberships, relationships
│   │   │   ├── conversationCentered/       # relationship detection, interaction extractor
│   │   │   ├── biographyGeneration/        # biography engine, relationship atom builder
│   │   │   └── timelineInsight/            # gap detection, parallel context (Allen relations)
│   │   └── routes/
│   │       ├── chronology.ts               # V1 + V2 endpoints + narrative endpoint
│   │       ├── knowledge.ts                # claims viewer + evidence inspector
│   │       └── conversationCentered.ts     # relationship + influence view endpoints
│   └── web/src/
│       ├── features/chat/
│       ├── components/love/                # relationship advisor, patterns, detail modal
│       └── routes/                         # About, Features, Guide (all rewritten)
├── supabase/migrations/
├── TEMPORAL_ARCHITECTURE.md               # canonical reference for all temporal systems
└── docs/
```

---

## Documentation

| Doc | Contents |
| --- | -------- |
| [TEMPORAL_ARCHITECTURE.md](TEMPORAL_ARCHITECTURE.md) | All six temporal systems, data flows, integration points, orphan registry |
| [docs/guides/LOCAL_DEVELOPMENT.md](docs/guides/LOCAL_DEVELOPMENT.md) | Local setup, migrations, dev flags |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture, request lifecycle |
| [docs/architecture/COGNITION_RUNTIME.md](docs/architecture/COGNITION_RUNTIME.md) | Pipeline, mode router, extraction types |
| [docs/runtime/runtime-truth-validation.md](docs/runtime/runtime-truth-validation.md) | Validation test plan, known failures |

---

© 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
