# Lorekeeper

<!-- © 2026 Abel Mendoza — Omega Technologies. All Rights Reserved. -->

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

## Application Surfaces

Lorekeeper is organized as a set of **Books** — full-page views for each domain of your life. All surfaces share the same card-grid + detail-modal pattern and refresh when ingestion updates story data.

| Surface | Route | What it shows |
| ------- | ----- | ------------- |
| **Chat** | `/chat` | Primary conversational interface with thread list, suggested-action chips, and message correction |
| **Characters** | `/characters` | People in your life — profiles, relationship intelligence, photo/message galleries, merge tools |
| **Locations** | `/locations` | Canonical places with taxonomy (Home, Venue, City, …), merge panel, and place–character links |
| **Projects** | `/projects` | Active pursuits (career, software, fitness, hobbies) with lexical auto-detection and duplicate merge |
| **Skills** | `/skills` | Competencies with level, XP, practice history, and auto-detected suggestions |
| **Family** | `/family` | Family tree, households, family groups, and relationship analytics |
| **Groups** | `/organizations` | Organizations, communities, and social groups with hierarchy and network graph |
| **Life Log** | `/events` | EventsBook — chronicle grid, recurring scenes, and the 4-tab event modal |
| **Dating & Romance** | `/love` | Romantic relationships — drift, cycles, milestones, cross-relationship patterns |
| **Timeline** | `/timeline` | OmniTimeline with search, hierarchy panel, and life-arc positioning |
| **Life Saga** | `/saga` | Narrative arc view — eras, chapters, and turning points synthesized from your record |
| **Quest Board** | `/quests` | Goals and pursuits with status, priority, progress, and detected suggestions |
| **Documents** | `/documents` | File library — upload resumes, PDFs, and artifacts; parsed claims flow into career lore |
| **Discovery Hub** | `/discovery` | Deep analytics panels: Revealed Self, contradictions, identity pulse, values, life arcs |
| **Lorebook** | `/lorebook` | Unified knowledge browser across entities, facts, and story connections |
| **Lore Editor** | `/memoir` | Biography editor for long-form narrative writing |
| **Photos** | `/photos` | Photo album with entity tagging |
| **Gossip & Claims** | `/perceptions` | How others perceive you — external perspectives and social standing |
| **Knowledge Gaps** | `/gaps` | Timeline voids and sparse entities that need more context |
| **Continuity** | `/continuity` | Contradictions, abandoned goals, identity drift, and emotional transitions |
| **Entity Resolution** | `/entities` | Ambiguous entity inbox — confirm, merge, or dismiss detected duplicates |
| **Intelligence Health** | `/intelligence` | Pipeline funnel dashboard (auth required) |
| **What AI Knows** | `/what-ai-knows` | Identity custody — export everything the system holds about you, with truth states |
| **Demo** | `/demo` | Auth-free showcase runtime with synthetic cognition (isolated from live data) |

Narrative views previously at `/story` now live in **Timeline**, **Lorebook**, and **Life Saga**.

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
Episode Segmentation (time/entity/location/topic boundaries → episodes table)
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
Revealed Preference Engine (stated vs revealed behavior from episodes)
   ↓
Contradiction Engine (proven divergences between stated identity and lived behavior)
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

### Episode Segmentation

Threads are split into **episodes** — the primary conversational memory unit — using deterministic boundary signals: time gaps, entity shifts, location shifts, and topic shifts. Segmentation runs debounced in the background after chat activity and persists to the `episodes` table with full provenance (`source_message_ids`, `source_entity_ids`, `boundary_reason`). Episodes link to resolved events and feed the Revealed Preference and Contradiction engines.

### Revealed Preference & Contradiction Engines

Two deterministic engines compare what you **say** about yourself with what your **behavior** reveals:

| Engine | Question it answers | API |
| ------ | ------------------- | --- |
| **Revealed Preference** (P2-A) | What do you actually prioritize, based on where you spend time and attention? | `GET /api/revealed-preference` |
| **Contradiction** (P2-B) | Where does stated identity diverge from revealed behavior — with evidence? | `GET /api/contradictions` |

Both engines are evidence-backed and accusation-free. Contradictions carry severity, confidence, sample episodes, and a lifecycle (`open` → `resolved`). The Discovery Hub surfaces both in dedicated panels.

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

**Live graph recovery:** Relationship and event recovery (`relationshipFoundationService`, `eventRecoveryService`) run on the live chat path — debounced per user (`graphRecoveryTrigger`) so the relationship/event graph stays current as you chat, instead of only updating on batch script runs. Idempotent (re-runs create no duplicates); diagnostics recorded in `pipeline_runs` and surfaced at `GET /api/diagnostics/graph-recovery`.

**Lexical project detection:** A fast keyword gate scans conversation text for project mentions (career moves, side projects, fitness goals) and surfaces suggestions in the Projects Book without repeated full-corpus scans.

**File ingestion:** Uploads flow through a canonical `user_files` registry backed by private Supabase Storage. Resumes and documents are parsed into structured claims (employment, education, skills) that merge into career lore and the Documents library.

### Chat & Thread Durability

- **Thread persistence:** Server threads hydrate on load; stream updates pin to the send-time thread ID so messages never land in the wrong conversation.
- **Temporal query retrieval:** Questions like "what did I do today?" or "what happened in March?" route through `temporalQueryService`, filtering by **occurrence time** (when something happened) rather than `created_at` (when you wrote it down).
- **Message correction:** Edit any chat bubble to re-derive knowledge from the corrected text (`POST /api/corrections/:messageId`). The correction loop invalidates downstream extractions tied to that message.
- **Suggested-action chips:** Contextual follow-up prompts appear after assistant responses to guide deeper sharing.

### Entity System

Single `EntityRegistry` façade over four entity tables. Priority resolution: `characters` → `omega_entities` → `people_places` → `entities`. Jaro-Winkler similarity for near-duplicate detection. Character deduplication at all creation paths.

**Canonical location authority:** All places consolidate into the `locations` table with taxonomy-aware typing (Home, Venue, City, Region, …). Orphan `people_places` rows promote to canonical locations; merge and edit paths resolve IDs consistently so the UI never shows stale location references.

**Character media:** Character detail modals include Photo Gallery and Messages tabs — reference images and DM/screenshot uploads that Lorekeeper can discuss in character-scoped chat.

**Projects authority:** Projects mirror the locations pattern — canonical `projects` table, duplicate detection, lexical ingestion suggestions, and org-fallback linking when a project maps to a workplace.

### Retrieval (RAG)

Hybrid: pgvector similarity + BM25 keyword + entity boosting + temporal scoring + MMR diversity reranking. Entities in your record are weighted higher in retrieval. Embedding cache: TinyLFU in-memory + Supabase upsert.

---

## Continuity Philosophy

**Sparse authentic continuity beats fake rich cognition.**

Lorekeeper only asserts what it has actually seen you share. It doesn't fabricate memory. It doesn't hallucinate prior conversations. When it doesn't know something, it says so and invites you to share it.

The design principle: one genuinely earned fact is worth more than ten inferred ones. Knowledge builds slowly and honestly.

**Epistemic honesty:** Every fact carries a truth state (`CANONICAL`, `INFERRED`, `PENDING_VERIFICATION`, …). The UI and chat surface explicit unknowns rather than filling gaps with confident-sounding guesses. The `/what-ai-knows` page lets you audit and export the full record.

---

## What Gets Remembered

**People** — Anyone you mention regularly becomes a tracked character with their own history, alias resolution, and relationship arc.

**Events** — Things that happened with a beginning and end: a trip, a job change, a difficult conversation, a decision made. Each event accumulates emotional, cognitive, and identity data over time as you revisit it in conversation.

**Recurring situations** — When the same people or themes appear across multiple sessions, they become `event_candidates` — named behavioral scenes (BJJ Competitions, Punk Shows, Performance Reviews) that accumulate continuity strength over time.

**Relationships** — Romantic relationships tracked in depth: type, status, drift direction, behavioral cycles, key milestones, red/green flags, influence on the broader life arc graph.

**Knowledge claims** — Behavioral patterns, values, lessons, and beliefs that crystallize from evidence over time. Each claim carries a confidence score and a full evidence trace.

**Projects & skills** — Pursuits and competencies detected from conversation or uploaded documents, with progress tracking and duplicate merge.

**Documents** — Resumes, PDFs, and uploaded artifacts parsed into structured career claims with provenance links back to source files.

**Episodes** — Conversational segments within threads, bounded by time/entity/location/topic shifts, with provenance to source messages.

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
- **Database:** 170+ migrations, Row Level Security on all user data, private Supabase Storage for user files
- **Auth:** Supabase JWT, Bearer token, dev bypass available locally
- **Billing:** Stripe subscriptions with 7-day trial (see below)
- **Security:** Cross-user tenant isolation on memory/diagnostics routes; anon RPC lockdown on SECURITY DEFINER functions

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
| `episodes` | Thread segments with boundary provenance, participants, and linked events |
| `user_files` | Canonical registry for uploads; all file ingestion flows through this table |
| `projects` | Canonical project entities with type, status, tags, and lexical detection |
| `preference_signals` | Stated vs revealed behavior counts per category (Revealed Preference Engine) |
| `contradictions` | Proven stated-vs-revealed divergences with severity, evidence, and lifecycle |

---

## Subscriptions & Billing

LoreBook Premium ($20/month) is sold via Stripe with a **7-day free trial** (card collected up front, no charge until the trial ends).

- **Flow:** custom Stripe Elements `PaymentElement` — `CheckoutFlow` → `POST /api/subscription/create` → `stripeService.createSubscription` (trial subscription, `default_incomplete`) → client confirms the returned PaymentIntent or, during a trial, the `pending_setup_intent` (the route returns `intentType: 'payment' | 'setup'`).
- **Sync:** Stripe webhooks at `POST /api/subscription/webhook` (signature-verified) drive `stripeService.handleWebhook`, which keeps the `subscriptions` table in sync for `customer.subscription.*` and `invoice.payment_*`.
- **Management:** Account Center → Subscription tab (`SubscriptionManagement`) handles upgrade, cancel, reactivate, and the Stripe-hosted billing portal.
- **Required env** (server): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUBSCRIPTION_PRICE_ID`; (web, Vite): `VITE_STRIPE_PUBLISHABLE_KEY`. See `.env.example`. Local webhook testing: `stripe listen --forward-to localhost:4000/api/subscription/webhook`.

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
- `ENABLE_GROUP_DETECTION=false` — background group-detection worker (off by default; enable only after memory bounds are verified)
- `EPISODE_SEGMENTATION_LIVE=1` — live episode segmentation on chat (on by default; set `0` to disable)

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
│   │   │   ├── conversationCentered/       # event assembly, episode segmentation, ingestion
│   │   │   │   ├── episodeSegmentationCore.ts # deterministic thread → episode boundaries
│   │   │   │   ├── episodePersistenceService.ts # episodes table writes + provenance
│   │   │   │   ├── eventAssemblyService.ts # assembles resolved_events + links event_records
│   │   │   │   ├── eventCausalDetector.ts  # LLM-based causal chain detection
│   │   │   │   ├── eventImpactDetector.ts  # how events affect the user
│   │   │   │   └── ingestionPipelineClass.ts # 12-step pipeline with continuity detection
│   │   │   ├── revealedPreference/         # stated-vs-revealed behavior analysis
│   │   │   ├── contradiction/              # proven identity/behavior divergences
│   │   │   ├── narrativeContinuityService.ts # entity-named continuity link generation
│   │   │   ├── eventCandidates/            # recurring scene pattern detection
│   │   │   ├── eventExtraction/            # 4-layer mode-router extraction (emotions/cognitions/identity)
│   │   │   ├── knowledgeCrystallization/   # claims, confidence engine, lifecycle
│   │   │   ├── temporal/                   # temporalQueryService for chat recall windows
│   │   │   ├── chronology/                 # V1 engine, arc bridge, gap nodes
│   │   │   └── chat/                       # systemPromptBuilder, ragBuilder, relationship context
│   │   └── routes/
│   │       ├── conversationCentered.ts     # event endpoints + intelligence-health stats
│   │       ├── projects.ts                 # Projects Book API + lexical suggestions
│   │       ├── documents.ts                # user_files registry + resume parsing
│   │       ├── corrections.ts              # message correction loop
│   │       ├── revealedPreference.ts       # Revealed Preference Engine API
│   │       ├── contradictions.ts           # Contradiction Engine API
│   │       ├── diagnostics.ts              # /intelligence-health dashboard endpoint
│   │       ├── knowledge.ts                # claims viewer + evidence inspector
│   │       └── characters.ts               # character management + deduplication
│   └── web/src/
│       ├── components/
│       │   ├── events/
│       │   │   ├── EventsBook.tsx          # chronicle grid with Recurring Scenes view
│       │   │   ├── EventDetailModal.tsx    # 4-tab modal: Overview/Meaning/Connections/Sources
│       │   │   └── EventProfileCard.tsx    # card with tone accent, names, type icons, tooltips
│       │   ├── projects/ProjectBook.tsx    # card grid + lexical suggestion panel
│       │   ├── documents/DocumentsBook.tsx # file library + resume claims inbox
│       │   ├── skills/SkillsBook.tsx       # skills grid with filters and XP tracking
│       │   ├── family/FamilyBook.tsx       # family tree, households, analytics
│       │   ├── organizations/OrganizationsBook.tsx # groups + network graph
│       │   ├── discovery/DiscoveryHub.tsx  # deep analytics panels (revealed self, contradictions, …)
│       │   ├── saga/SagaScreen.tsx         # narrative arc and chapter view
│       │   ├── quests/QuestBoard.tsx       # goals and pursuits board
│       │   └── diagnostics/
│       │       └── IntelligenceDashboard.tsx # /intelligence health dashboard
│       └── pages/
│           └── Router.tsx                  # all surface routes
├── supabase/migrations/                    # 170+ migrations
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
| [docs/thread-intelligence-architecture.md](docs/thread-intelligence-architecture.md) | Episode segmentation, thread cache, durability |
| [docs/location-domain-health-report.md](docs/location-domain-health-report.md) | Canonical location authority consolidation |
| [docs/api-canonical-map.md](docs/api-canonical-map.md) | Canonical API namespaces, BFF routes, deprecation aliases |

---

© 2026 Abel Mendoza — Omega Technologies. All Rights Reserved.
