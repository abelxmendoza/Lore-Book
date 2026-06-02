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
Mode Router (classify: EXPERIENCE_INGESTION, ACTION_LOG, MEMORY_RECALL, ...)
   ↓
Ingestion pipeline (~30 parallel extractors)
   ↓
Event Assembly (resolved_events + 4-layer meaning extraction)
   ├── event_emotions, event_cognitions, event_identity_impacts, narrative_accounts
   ├── event_impacts (how events affect the user)
   ├── event_causal_links (what caused what)
   ├── event_continuity_links (CONTINUATION, CONTRAST, RETURN, CLOSURE...)
   └── event_confidence_snapshots (how certainty evolved)
   ↓
Event candidates (recurring behavioral scenes)
   ↓
Life arcs + chapters (named temporal containers)
   ↓
Knowledge crystallization (behavioral patterns → durable claims with evidence)
   ↓
WHAT LOREBOOK KNOWS block in every system prompt
```

### Event Intelligence (EventsBook)

Events are the core biographical unit. Each event is a living memory page — not a static record.

**What an event holds:**

- Core: title, summary, type, start/end time, people, locations, activities
- Emotional layer: emotions with intensity and timestamp offset
- Cognitive layer: beliefs, realizations, doubts, questions expressed at the time
- Identity layer: how the event reinforced, challenged, shifted, or clarified self-perception
- Narrative layer: `at_the_time` (original description) + `later_interpretation` (subsequent reflections)
- Causal layer: what caused this event and what it caused
- Continuity layer: entity-named connections to past events ("Sarah appeared in 'Performance Review' 19 days ago")
- Confidence history: how certainty in the event evolved over time

**Event modal** (`/events` → click any event) surfaces all seven layers in four tabs: Overview, Meaning, Connections, Sources. The Meaning tab is the product differentiator — no other app shows you what you felt and thought at the moment of an event, and how your understanding of it evolved over subsequent conversations.

**Reflection Timeline:** Every message sent in the event modal chat is saved as a `later_interpretation` narrative account. Open an event in October and say "looking back, this changed everything" in December — both entries appear in chronological sequence. The evolution of interpretation becomes visible.

**Persistent event conversations:** Event chat history is stored per-event in `conversation_sessions` (keyed by `metadata.event_id`) and loaded when the modal opens. Lorekeeper primes the conversation with a generated opener from the event's data.

**Recurring Scenes:** The `event_candidates` system detects recurring behavioral patterns across events using a logistic continuity-strength curve with temporal decay. Patterns with 2+ occurrences surface in the Recurring Scenes view. Examples: "Punk Shows", "Performance Reviews", "Family Dinners".

**Story Position:** If the user has defined life arcs and chapters, each event modal header shows which arc and chapter the event belongs to (queried by date range). If no arc is defined, the position is synthesized from causal connections.

### Knowledge Crystallization

The system earns knowledge from behavioral evidence — what you repeatedly do, not just what you say about yourself. Every knowledge claim is:

- **Evidence-backed** — built from recurring `event_candidates`, life arcs, user reflections
- **Confidence-scored** — 5-factor formula: base evidence × temporal stability × cross-context × recency × contradiction penalty
- **Explainable** — every claim traces to specific source rows via `knowledge_evidence_links`
- **Lifecycle-managed** — ACTIVE → DORMANT → HISTORICAL → SUPERSEDED; nothing is silently deleted

AI-generated claims never count as evidence. Only behavioral observation does.

### Relationship Intelligence

Romantic relationships are tracked at full depth: drift direction, active cycles (push-pull, hot-cold, toxic patterns), recent interactions logged from natural conversation (no forms), cross-relationship pattern analysis across your full history, and a relationship influence view showing which relationships shaped your life and how.

### Temporal Intelligence

Five systems handle time, each answering a different question:

| System | Question |
| ------ | -------- |
| ChronologyEngine V1 | What caused what? What patterns exist? What's missing? |
| ChronologyService V2 | Give me events in order. Find overlaps. Bucket by year. |
| Timeline Hierarchy | What is the narrative structure? (9-layer: Mythos → MicroAction) |
| TimelineInsight | What gaps exist? What was happening in parallel? |
| Life Arcs | What named life periods exist, and how do they connect causally? |

Allen's interval algebra (all 13 relations) powers temporal relationship detection.

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

12-step pipeline orchestrating ~30 parallel extractors: entity resolution, relationship detection, event extraction, romantic interaction logging, interest tracking, belief challenge detection, and more. Each extraction writes to the appropriate domain table.

**Event linkage:** After every event assembly, `event_records` (Mode Router system — emotional/cognitive data) are linked to `resolved_events` (Temporal Assembler system — what happened) via an explicit FK (`resolved_event_id`). This ensures the Meaning Tab has a reliable data path regardless of when the user documented the event. Date-join fallback preserved for backward compatibility.

### Entity System

Single `EntityRegistry` façade over four entity tables. Priority resolution: `characters` → `omega_entities` → `people_places` → `entities`. Jaro-Winkler similarity for near-duplicate detection. Character deduplication at all creation paths.

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

**Events** — Things that happened with a beginning and end: a trip, a job change, a difficult conversation, a decision made. Each event accumulates emotional, cognitive, and identity data over time as you revisit it in conversation.

**Recurring situations** — When the same people or themes appear across multiple sessions, they become `event_candidates` — named behavioral scenes (BJJ Competitions, Punk Shows, Performance Reviews) that accumulate continuity strength over time.

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
- **Database:** 13 event intelligence tables, 160+ migrations, Row Level Security on all user data
- **Auth:** Supabase JWT, Bearer token, dev bypass available locally

### Production Intelligence Tables

| Table | Purpose |
| ----- | ------- |
| `resolved_events` | Core event records (what happened, who, where, when) |
| `event_records` | Mode Router extraction anchor — links to resolved_events via FK |
| `narrative_accounts` | At-the-time descriptions + later reflections (Reflection Timeline) |
| `event_emotions` | Emotions with intensity, extracted per event |
| `event_cognitions` | Beliefs, realizations, doubts, questions |
| `event_identity_impacts` | How events reinforced, challenged, or shifted self-perception |
| `event_causal_links` | Causal chain between events (10 relationship types) |
| `event_continuity_links` | Entity-named continuity connections (CONTINUATION, CONTRAST, RETURN...) |
| `event_impacts` | How events affect the user (direct, indirect, observer, ripple) |
| `event_confidence_snapshots` | Confidence evolution history per event |
| `event_candidates` | Recurring behavioral scene patterns with continuity strength |
| `event_unit_links` | Links extracted_units to resolved_events |
| `character_timeline_events` | Events linked to specific characters (shared_experience, lore, mentioned) |

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

### Intelligence Health Dashboard

Navigate to `/intelligence` (requires auth) to see the real-time pipeline health dashboard:

- **Pipeline Funnel:** conversion at each stage from messages → EXPERIENCE_INGESTION → resolved events → meaning extraction → continuity
- **Meaning Layer:** emotions, cognitions, identity impacts, narratives (at-the-time vs looking-back)
- **Story Layer:** causal links, continuity links, recurring scenes, confidence snapshots
- **Knowledge Layer:** omega claims, entities, crystallized knowledge
- **Bottleneck detection:** automatic warnings when any metric falls below threshold

API: `GET /api/diagnostics/intelligence-health` (requires auth)

---

## Project Structure

```text
lorekeeper/
├── apps/
│   ├── server/src/
│   │   ├── services/
│   │   │   ├── conversationCentered/       # event assembly, causal detection, impact detection
│   │   │   │   ├── eventAssemblyService.ts # assembles resolved_events + links event_records
│   │   │   │   ├── eventCausalDetector.ts  # LLM-based causal chain detection
│   │   │   │   ├── eventImpactDetector.ts  # how events affect the user
│   │   │   │   └── ingestionPipelineClass.ts # 12-step pipeline with continuity detection
│   │   │   ├── narrativeContinuityService.ts # entity-named continuity link generation
│   │   │   ├── eventCandidates/            # recurring scene pattern detection
│   │   │   ├── eventExtraction/            # 4-layer mode-router extraction (emotions/cognitions/identity)
│   │   │   ├── knowledgeCrystallization/   # claims, confidence engine, lifecycle
│   │   │   ├── chronology/                 # V1 engine, arc bridge, gap nodes
│   │   │   └── chat/                       # systemPromptBuilder, ragBuilder, relationship context
│   │   └── routes/
│   │       ├── conversationCentered.ts     # event endpoints + intelligence-health stats
│   │       ├── diagnostics.ts              # /intelligence-health dashboard endpoint
│   │       ├── knowledge.ts                # claims viewer + evidence inspector
│   │       └── characters.ts               # character management + deduplication
│   └── web/src/
│       ├── components/
│       │   ├── events/
│       │   │   ├── EventsBook.tsx          # chronicle grid with Recurring Scenes view
│       │   │   ├── EventDetailModal.tsx    # 4-tab modal: Overview/Meaning/Connections/Sources
│       │   │   └── EventProfileCard.tsx    # card with tone accent, names, type icons, tooltips
│       │   └── diagnostics/
│       │       └── IntelligenceDashboard.tsx # /intelligence health dashboard
│       └── pages/
│           └── Router.tsx                  # all surface routes including /intelligence
├── supabase/migrations/                    # 160+ migrations, event tables fully deployed
├── TEMPORAL_ARCHITECTURE.md               # canonical reference for all temporal systems
└── docs/
```

---

## Documentation

| Doc | Contents |
| --- | -------- |
| [TEMPORAL_ARCHITECTURE.md](TEMPORAL_ARCHITECTURE.md) | All six temporal systems, data flows, integration points |
| [docs/guides/LOCAL_DEVELOPMENT.md](docs/guides/LOCAL_DEVELOPMENT.md) | Local setup, migrations, dev flags |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture, request lifecycle |
| [docs/architecture/COGNITION_RUNTIME.md](docs/architecture/COGNITION_RUNTIME.md) | Pipeline, mode router, extraction types |

---

© 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
