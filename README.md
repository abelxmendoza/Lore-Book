# Lorekeeper

<!-- © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved. -->

**A system that gradually remembers your life.**

Lorekeeper is a conversational runtime that accumulates biographical context over time. Every conversation you have adds to a growing record — people, places, recurring situations, decisions, emotional patterns. Future conversations draw on that record, so the longer you use it, the more it knows about you without being told.

This is not a chatbot with memory bolted on. The continuity loop is the product.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

---

## What It Does

When you send a message, two things happen simultaneously:

1. You get a response from the assistant
2. The message passes through an ingestion pipeline that extracts people, events, decisions, and recurring themes — and persists them to your record

The record is yours. It accumulates across threads and sessions. The assistant reads from it on every response, so mentions of "my sister" eventually resolve to a specific person with a history rather than an anonymous noun.

---

## Continuity Philosophy

**Sparse authentic continuity beats fake rich cognition.**

Lorekeeper only asserts what it has actually seen you share. It doesn't fabricate memory. It doesn't hallucinate prior conversations. When it doesn't know something, it says so and invites you to share it.

The design principle: one genuinely remembered fact is worth more than ten inferred ones. The system grows slowly and honestly.

---

## How the Continuity Loop Works

```text
you send a message
       ↓
assistant responds (using your record)
       ↓  
ingestion pipeline fires (async, 8–15s)
       ↓
extracts: people · events · decisions · themes
       ↓
persists to your record
       ↓
available in every future conversation
```

The pipeline runs asynchronously after every message. Thread entity chips (the small tags next to conversation titles) update as the pipeline completes — showing who and what Lorekeeper has recognized as recurring in that thread.

---

## What Gets Remembered

**People** — Anyone you mention regularly becomes a tracked character. "My mom," "Abuela," "my coworker James" accumulate their own histories. Aliases and near-duplicate names are resolved via Jaro-Winkler similarity matching.

**Events** — Things that happened with a beginning and end: a trip, a job change, a difficult conversation, a decision made.

**Recurring situations** — When the same people or themes appear across multiple sessions, they get recognized as patterns and weighted higher in retrieval.

**Decisions and beliefs** — Major choices and held positions, with the ability to revise them later.

---

## What It Intentionally Doesn't Do

- Does not fabricate prior conversations
- Does not claim to have saved something that failed to save
- Does not infer rich context from thin signals
- Does not import from external apps or services
- Does not watch behavior outside of conversations
- Does not share your record with third parties

Everything Lorekeeper knows about you comes from what you explicitly shared.

---

## Architecture Overview

### Mode Router

Every message is classified before processing. The mode determines what downstream work fires:

| Mode | What It Does |
| ---- | ------------ |
| `EXPERIENCE_INGESTION` | Lived experience → full ingestion pipeline |
| `ACTION_LOG` | Atomic event → lighter extraction path |
| `MEMORY_RECALL` | Retrieval request → RAG without ingestion |
| `NARRATIVE_STORY` | Synthesize narrative from existing record |
| `EMOTIONAL_EXISTENTIAL` | Support mode — no memory writes |

Pattern matching runs first (<50ms). LLM classification fires only when confidence < 0.8. Mode and confidence surface as attribution in the UI.

### Ingestion Pipeline

12-step pipeline orchestrating ~30 parallel extractors: entity resolution, relationship detection, event extraction, interest tracking, belief challenge detection, and more. Each extraction writes to the appropriate domain table.

Tracking: every pipeline run writes to `pipeline_runs` (start, complete, fail). After completion, a production summary records what was actually created — entities, events, knowledge units — queryable directly.

### Entity System

Single `EntityRegistry` façade over four entity tables. Priority resolution: `characters` → `omega_entities` → `people_places` → `entities`. Jaro-Winkler similarity for near-duplicate detection. Entity confidence grows with repeated mentions.

### Retrieval (RAG)

Hybrid: pgvector similarity + BM25 keyword + entity boosting + temporal scoring + MMR diversity reranking. Entities in your record are weighted higher in retrieval than anonymous mentions. Embedding cache: TinyLFU in-memory + Supabase upsert.

### Thread Persistence

Threads are stored in Supabase with full message history, entity chips, and metadata. Saves are debounced 1.5s with keepalive flush on tab close. Every thread has a persistence state: persisting → persisted → failed.

---

## Infrastructure

- **Backend:** Node.js / Express, TypeScript, Supabase PostgreSQL + pgvector
- **Frontend:** React + Vite, TypeScript, React Router
- **Database:** 283 tables, 160+ migrations, Row Level Security on all user data
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
│   │   │   ├── ingestion/          # pipeline, queue, entity extraction
│   │   │   ├── chat/               # systemPromptBuilder, ragBuilderService
│   │   │   ├── modeRouter/         # classification, mode handlers
│   │   │   └── rag/                # retrieval, reranking, embedding cache
│   │   ├── routes/                 # conversationCentered, diagnostics, identity
│   │   └── middleware/auth.ts
│   └── web/src/
│       ├── features/chat/
│       │   ├── hooks/              # useConversationRuntime, useChatThreads, useChat
│       │   └── components/         # thread list, entity chips, mode attribution
│       └── routes/
├── supabase/migrations/
└── docs/
    ├── runtime/                    # validation docs, continuity audits
    ├── architecture/               # deep technical architecture
    └── guides/                     # developer and user guides
```

---

## Documentation

| Doc | Contents |
| --- | -------- |
| [docs/guides/using-lorekeeper.md](docs/guides/using-lorekeeper.md) | User guide — how to use Lorekeeper as a continuity system |
| [docs/runtime/runtime-truth-validation.md](docs/runtime/runtime-truth-validation.md) | Validation test plan, known failures, observability gaps |
| [docs/runtime/assistant-continuity-identity-audit.md](docs/runtime/assistant-continuity-identity-audit.md) | Language audit — continuity-breaking vs. continuity-reinforcing patterns |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture, request lifecycle |
| [docs/architecture/COGNITION_RUNTIME.md](docs/architecture/COGNITION_RUNTIME.md) | Pipeline, mode router, extraction types |
| [docs/guides/LOCAL_DEVELOPMENT.md](docs/guides/LOCAL_DEVELOPMENT.md) | Local setup, migrations, dev flags |

---

© 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
