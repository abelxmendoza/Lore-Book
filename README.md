<div align="center">
  <img src="apps/web/public/images/loreKeeperlogo3.png" alt="Lore Keeper Logo" width="300" />
</div>

# Lore Keeper by Omega Technologies

## What is Lore Keeper?

**Lore Keeper is your AI-powered life journal** — think of it as a personal assistant that remembers everything important about your life and helps you understand your own story.

### In Simple Terms

Imagine you could:
- **Write about your day** and have an AI that understands the deeper meaning
- **Ask questions** like "What was I worried about last spring?" and get intelligent answers
- **See patterns** in your life — like noticing you're happiest when working on creative projects
- **Track relationships** with people who matter, seeing how they've evolved over time
- **Build a timeline** of your life that connects memories, tasks, photos, and events into a coherent narrative

That's Lore Keeper. It's like having a biographer who never forgets, combined with a therapist who knows your entire history, wrapped in a beautiful cyberpunk interface.

### How It Works

1. **You write entries** — daily thoughts, events, memories, or just stream-of-consciousness
2. **Lore Keeper organizes** — automatically tags, categorizes, and connects your entries
3. **AI understands context** — uses GPT-4 to understand meaning, not just keywords
4. **You explore** — search, visualize, and discover patterns in your own life story

### Common Use Cases

**Personal Growth & Reflection**
- Track your emotional patterns over time
- Identify what makes you happy or stressed
- See how you've grown and changed
- Get insights into your own behavior

**Relationship Tracking**
- Remember important moments with people
- See how relationships have evolved
- Track who matters most in your life
- Understand relationship patterns

**Life Organization**
- Organize your life into chapters (college, career, etc.)
- Connect tasks, events, and memories
- Build a coherent narrative of your life
- Find any memory quickly with semantic search

**Creative Projects**
- Track your creative process
- See patterns in your work
- Connect ideas across time
- Build a portfolio of your creative journey

**Therapy & Mental Health**
- Journal your thoughts and feelings
- Track mood patterns
- Identify triggers and coping mechanisms
- Share insights with therapists (via export)

**Professional Development**
- Track career milestones
- Remember important conversations
- Connect learning experiences
- Build a professional narrative

---

## For Developers & Technical Users

Lore Keeper is an AI-powered journaling platform that blends Supabase authentication, GPT-4 context, and an expressive cyberpunk UI. It automatically captures important chats, builds a memory timeline, and lets you query your past like you would ask ChatGPT.

---

## Technical Overview

### What Technologies Power Lore Keeper?

Lore Keeper is built with modern web technologies:

**Frontend (What You See)**
- **React + Vite**: Fast, modern web interface
- **Tailwind CSS**: Beautiful, responsive styling
- **TypeScript**: Type-safe code for reliability

**Backend (The Brain)**
- **Express + TypeScript**: API server that handles all requests
- **OpenAI GPT-4**: AI that understands and generates responses
- **Supabase/PostgreSQL**: Database that stores all your memories securely

**Mobile App**
- **React Native + Expo**: Native iOS and Android apps

**AI & Analysis**
- **Python Package**: Advanced timeline management and narrative generation
- **Insight Engine**: Finds patterns and themes in your entries
- **Persona Engine**: Adapts to who you are right now

### Key Features Explained Simply

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| **Semantic Search** | Finds memories by meaning, not just keywords | Ask "times I felt overwhelmed" and find relevant entries even if you didn't use those exact words |
| **Timeline** | Organizes your life chronologically | See your story unfold over time, with chapters and arcs |
| **Character Tracking** | Remembers people and relationships | See how relationships evolve, who matters most, and shared memories |
| **Continuity Engine** | Detects inconsistencies in your story | Keeps your journal accurate and consistent |
| **Memory Fabric** | Visualizes connections between memories | See how different parts of your life connect |
| **Identity Pulse** | Tracks who you are over time | Understand how you've changed and evolved |

---

## Tech Stack (Detailed)

- **Frontend**: React + Vite, Tailwind, shadcn-inspired UI primitives, Zustand state helpers
- **Backend**: Express + TypeScript, OpenAI GPT-4, Supabase/Postgres for storage, cron-ready jobs
- **Python Package**: Timeline management, narrative engines (daily/weekly/monthly arcs), voice memo ingestion, drift auditing
- **Mobile**: React Native with Expo for iOS/Android
- **Auth & DB**: Supabase Auth + Supabase/Postgres tables for `journal_entries`, `daily_summaries`, `chapters`, `tasks`, `timeline_events`, `characters`, and more
- **Insight Engine**: Python-based signal detector that clusters embeddings, surfaces motifs, and predicts new arcs
- **Persona Engine**: Deterministic Omega Persona Engine that blends identity arcs, seasonal trends, and emotional slopes into a live persona state

## Core Systems Explained

### Omega Persona Engine

**What it does:** Makes Lore Keeper's AI assistant understand who you are *right now* — not who you were last year, but who you are today.

**Why it matters:** As you grow and change, Lore Keeper adapts. If you're going through a difficult time, it responds with empathy. If you're in a creative phase, it matches that energy.

**How it works:**
- Analyzes your recent entries to understand your current state
- Identifies recurring themes (motifs) in your life
- Adapts its tone and responses to match your emotional state
- Tracks how your identity evolves over time

**Technical Details:**
- **Python core**: `lorekeeper/persona` derives persona versions, motifs, and tone based on identity, emotional slopes, and seasonal arcs
- **Behavior rules**: Lightweight heuristics translate persona state into deterministic tone and language guidance
- **API**: `/api/persona`, `/api/persona/update`, and `/api/persona/description` expose persona state to the web app and other services
- **UI**: `/persona` page visualizes the current persona, motifs, tone profile, and recent evolution

Architecture sketch:

```
Timeline → IdentityEngine → OmegaPersonaEngine → Persona Rules → API/Chat UI
                  ↑                 ↓
            SeasonEngine      Daily/Weekly Briefings
```

### Hypergraph Quantum Index (HQI)

**What it does:** A powerful search engine that finds memories by meaning, not just keywords.

**Why it matters:** Traditional search looks for exact words. HQI understands what you're *really* asking for. Search "moments of clarity" and it finds entries about breakthroughs, epiphanies, and sudden understanding — even if you never used those exact words.

**How it works:**
- Combines multiple ways of understanding your memories (meaning, time, relationships)
- Searches across everything: journal entries, tasks, people, story arcs, and themes
- Ranks results by relevance, not just keyword matches
- Provides instant results with filters to narrow down

**Technical Details:**
- **Multi-modal search**: Search across memories, tasks, characters, arcs, and motifs in a single query
- **Filter support**: Filter results by type, tags, date ranges, and more
- **Unified ranking**: Combines semantic similarity, temporal proximity, and graph relationships
- **Search overlay**: Full-screen search interface with instant results and filters

### Continuity Engine

**What it does:** Keeps your journal consistent and accurate, like a fact-checker for your life story.

**Why it matters:** Over time, you might write conflicting information (e.g., "I moved to Seattle in 2020" vs "I've been in Seattle since 2019"). The Continuity Engine catches these inconsistencies and helps you resolve them.

**How it works:**
- Tracks verified facts about your life (where you live, important dates, relationships)
- Detects when new entries conflict with established facts
- Monitors how your identity and relationships change over time
- Suggests ways to resolve conflicts when they arise

**Technical Details:**
- **Canonical Facts**: Maintains a registry of verified facts about characters, identity, locations, and events
- **Conflict Detection**: Identifies factual and temporal conflicts between entries
- **Drift Analysis**: Tracks identity shifts, relationship changes, and narrative drift over time
- **Stability Metrics**: Measures consistency across characters, identity, projects, and locations
- **Merge Suggestions**: Proposes resolutions for detected conflicts
- **Continuity Reports**: Generates markdown reports summarizing canon, conflicts, and drift maps

The Python continuity engine (`lorekeeper/continuity/`) provides the core logic, while the API exposes state, conflicts, and reports.

### Lore Orchestrator

**What it does:** A central hub that brings together all of Lore Keeper's features in one place.

**Why it matters:** Instead of making separate requests for timeline, identity, characters, etc., the Orchestrator gives you everything you need in one response. It's like a dashboard that shows your entire life story at a glance.

**How it works:**
- Combines data from timeline, identity, continuity, characters, and more
- Provides a unified view of your lore state
- Formats everything consistently for easy consumption
- Powers the main dashboard and overview screens

**What You Get:**
- **Summary**: High-level overview of your lore state
- **Timeline**: Unified timeline with events, tasks, arcs, identity pulses, and drift alerts
- **Identity**: Current persona state, motifs, emotional trajectory, and drift warnings
- **Continuity**: Canon facts, conflicts, drift signals, and stability scores
- **Saga**: Era overview, narrative arcs, and cinematic chapters
- **Characters**: Character profiles, relationships, memories, closeness trends, and influence metrics
- **HQI**: Hypergraph Quantum Index search results
- **Fabric**: Memory fabric neighborhood visualization for a specific memory

**Technical Details:**
The orchestrator service (`apps/server/src/services/orchestratorService.ts`) coordinates data from multiple sources and formats responses for the frontend.

---

## Privacy & Security

**🔒 Using Your Real Memoir?** See [`PRIVACY_GUIDE.md`](./PRIVACY_GUIDE.md) for:
- How your data stays private (Row-Level Security, user isolation)
- Options for local development (local Supabase recommended)
- Why your memoir text won't interfere with builds
- Best practices for keeping your data secure

**Quick Summary:**
- ✅ All data is isolated by `user_id` - only you can see your data
- ✅ Use local Supabase for maximum privacy (data stays on your machine)
- ✅ Your memoir text is just data - it won't break the build process
- ✅ `.env` files are gitignored - your credentials stay private

## Getting Started

### Quick Start Guide

**For Non-Technical Users:** Lore Keeper requires some technical setup. You'll need:
- A computer with Node.js installed
- An OpenAI API key (for AI features)
- A Supabase account (for data storage)
- Basic familiarity with terminal/command line

**For Developers:** Follow the steps below.

### Installation Steps

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Set Up Environment Variables**
   Create a `.env` file in the project root based on `.env.example`. This file contains your API keys and configuration.

3. **Start the Backend Server**
   ```bash
   pnpm run dev:server      # Runs on http://localhost:4000
   ```

4. **Start the Web Interface**
   ```bash
   pnpm run dev:web         # Runs on http://localhost:5173
   ```

### Required Environment Variables

**What are these?** These are secret keys that let Lore Keeper connect to external services (like OpenAI for AI features and Supabase for storing your data).

| Variable | What It Does | Where to Get It |
|----------|--------------|-----------------|
| `OPENAI_API_KEY` | Enables AI features (chatbot, summaries, etc.) | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `SUPABASE_URL` | Your database location | Supabase project settings |
| `SUPABASE_ANON_KEY` | Public database key | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Private database key (keep secret!) | Supabase project settings |
| `OPENAI_API_MODEL` | Which AI model to use (default: `gpt-4o-mini`) | Optional - uses default if not set |
| `OPENAI_EMBEDDING_MODEL` | Model for semantic search (default: `text-embedding-3-small`) | Optional - uses default if not set |
| `X_API_BEARER_TOKEN` | Enables syncing X/Twitter posts (optional) | X Developer Portal |

**Important:** The backend will log warnings for missing environment variables but will attempt to start in development mode. Ensure all required variables are set for full functionality.

---

## Advanced Features

### Insight Engine

**What it does:** Analyzes your journal entries to find hidden patterns, themes, and insights about your life.

**Why it matters:** Sometimes you don't realize patterns until you see them. The Insight Engine might discover that you're happiest on weekends, or that certain people appear together frequently in your memories, or that you tend to write about creativity more in the spring.

**What It Finds:**
- **Patterns**: Groups of related entries (e.g., all entries about work stress)
- **Correlations**: Things that happen together (e.g., "exercise" and "good mood" often appear together)
- **Cycles**: Recurring rhythms in your life (e.g., you journal more on Mondays)
- **Motifs**: Frequently recurring themes or topics
- **Identity Shifts**: How you've changed over time (e.g., shifting from "student" to "professional")
- **Predictions**: Emerging themes that might become important

**Technical Details:**
The InsightEngine (`lorekeeper/insight_engine.py`) ingests timeline events, arcs, identity snapshots, and optional character/location metadata. It builds lightweight embeddings, performs quick clustering, and emits structured insights. Data classes for these outputs live in `lorekeeper/insights_types.py` so they can be reused across agents and UI panels.

## Insight API Routes

- `GET /api/insights/recent` — run the engine on the latest timeline events.
- `GET /api/insights/monthly/:year/:month` — scoped insights for a calendar month.
- `GET /api/insights/yearly/:year` — yearly rollups.
- `POST /api/insights/predict` — accept custom payloads (timeline/arcs/identity) to forecast upcoming arcs.

## Example Insight Output

```
{
  "patterns": [{"description": "Cluster 1 centers around running, health"}],
  "correlations": [{"variables": ["health", "running"], "confidence": 0.7}],
  "cycles": [{"period": "weekly", "evidence": ["3 entries on weekday 0"]}],
  "motifs": [{"motif": "running", "action_suggestion": "Collect representative stories"}],
  "identity_shifts": [{"shift": "Identity markers evolved: gained coach; less emphasis on runner"}],
  "predictions": [{"description": "Design is gaining momentum and may define the next arc."}]
}
```

### Required Database Tables

```sql
create table if not exists public.journal_entries (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date timestamptz not null,
  content text not null,
  tags text[] default '{}',
  chapter_id uuid references public.chapters(id),
  mood text,
  summary text,
  source text not null default 'manual',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  start_date timestamptz not null,
  end_date timestamptz,
  description text,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create Supabase Storage bucket for photos
-- In Supabase Dashboard: Storage > Create Bucket > Name: "photos" > Public: true

create table if not exists public.daily_summaries (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  summary text,
  tags text[] default '{}'
);

-- Semantic search support (pgvector)
alter table if exists public.journal_entries add column if not exists embedding vector(1536);
create index if not exists journal_entries_embedding_idx on public.journal_entries using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create or replace function public.match_journal_entries(user_uuid uuid, query_embedding vector, match_threshold float, match_count int)
returns table (id uuid, user_id uuid, date timestamptz, content text, tags text[], chapter_id uuid, mood text, summary text, source text, metadata jsonb, embedding vector, similarity float)
language sql stable as $$
  select *, 1 - (embedding <=> query_embedding) as similarity
  from public.journal_entries
  where user_id = user_uuid
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Task timeline and memory bridge tables
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  tags text[] default array[]::text[],
  occurred_at timestamptz not null default now(),
  context jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists timeline_events_user_idx on public.timeline_events(user_id, occurred_at desc);
create index if not exists timeline_events_task_idx on public.timeline_events(task_id);

create table if not exists public.task_memory_bridges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  timeline_event_id uuid references public.timeline_events(id) on delete cascade,
  journal_entry_id uuid references public.journal_entries(id) on delete cascade,
  bridge_type text not null default 'task_timeline',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists task_memory_bridges_user_idx on public.task_memory_bridges(user_id, created_at desc);
create index if not exists task_memory_bridges_task_idx on public.task_memory_bridges(task_id);
create index if not exists task_memory_bridges_timeline_idx on public.task_memory_bridges(timeline_event_id);
```

### Character Knowledge Base (Entity-Relationship Schema)

```sql
-- Characters: central entities in the lore graph
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  alias text[],
  pronouns text,
  archetype text,
  role text,
  status text default 'active',
  first_appearance date,
  summary text,
  tags text[] default '{}',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

-- Relationship edges: directional link from a source character to a target character
create table if not exists public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source_character_id uuid references public.characters(id) on delete cascade,
  target_character_id uuid references public.characters(id) on delete cascade,
  relationship_type text not null,
  closeness_score smallint check (closeness_score between -10 and 10),
  status text default 'active',
  summary text,
  last_shared_memory_id uuid references public.journal_entries(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, source_character_id, target_character_id, relationship_type)
);

-- Character memories: bridge between characters and journal entries/chapters
create table if not exists public.character_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  journal_entry_id uuid references public.journal_entries(id) on delete cascade,
  chapter_id uuid references public.chapters(id),
  role text,
  emotion text,
  perspective text,
  summary text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, character_id, journal_entry_id)
);

-- ER-friendly view that blends characters, their memories, and outbound relationships
create or replace view public.character_knowledge_base as
select
  c.id as character_id,
  c.user_id,
  c.name,
  c.alias,
  c.pronouns,
  c.archetype,
  c.role,
  c.status,
  c.tags,
  cm.journal_entry_id,
  cm.chapter_id,
  cm.role as memory_role,
  cm.emotion as memory_emotion,
  cm.perspective,
  cm.summary as memory_summary,
  cr.target_character_id,
  cr.relationship_type,
  cr.closeness_score,
  cr.summary as relationship_summary
from public.characters c
left join public.character_memories cm
  on cm.character_id = c.id
left join public.character_relationships cr
  on cr.source_character_id = c.id;
```

- **Entity relationships**: `characters` are the primary nodes, `character_relationships` provide directional edges (ally, rival, mentor, sibling, etc.), and `character_memories` bridge characters to `journal_entries`/`chapters` so you can walk from people to specific story beats.
- **Shared memories**: the `character_memories` table and the `character_knowledge_base` view keep a queryable log of when characters appear together and how they felt/perspective-wise during a scene.
- **Indices**: each table includes user-scoped indexes to keep persona graphs and memory lookups fast at lore scale.

Grant `select/insert/update` on both tables to the `service_role` used by the API. Frontend reads data through the API so you do not need row level policies for now, but enabling RLS is recommended if you later expose Supabase directly to the client.

---

## API Documentation

**What is an API?** An API (Application Programming Interface) is how different parts of Lore Keeper communicate. Think of it like a menu at a restaurant — it shows what's available and how to order it.

**For Developers:** All endpoints require authentication via `Authorization: Bearer <access_token>` header using Supabase auth tokens.

### API Surface

#### Journal Entries & Memory

**What these do:** Create, search, and manage your journal entries — the core of Lore Keeper.

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/entries` | GET | Search entries by tag, date range, or chapter (supports semantic search) |
| `/api/entries` | POST | Create a manual entry (keywords auto-tagged) |
| `/api/entries/suggest-tags` | POST | GPT-assisted tag suggestions |
| `/api/entries/detect` | POST | Check if a message should be auto-saved |
| `/api/entries/voice` | POST | Upload an audio clip; Whisper transcribes and GPT formats a journal entry |

#### Chapters

**What these do:** Organize your life into story chapters — like "College Years" or "Starting My Business" — to give structure to your timeline.

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/chapters` | GET | List chapters for the authenticated user |
| `/api/chapters` | POST | Create a chapter (title + dates + description) |
| `/api/chapters/candidates` | GET | Detect potential chapter candidates from entries |
| `/api/chapters/:chapterId` | GET | Get entries for a specific chapter |
| `/api/chapters/:chapter_id/summary` | POST | Generate & store a GPT summary for a chapter |

#### Media & Integrations

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/photos/upload` | POST | Upload photo(s) and auto-generate journal entry |
| `/api/photos/upload/batch` | POST | Upload multiple photos at once |
| `/api/photos` | GET | Get all user photos |
| `/api/photos/sync` | POST | Sync photo metadata from device (mobile) |
| `/api/x/sync` | POST | Import recent X posts into the timeline with AI summaries |
| `/api/calendar/sync` | POST | Sync calendar events from device (mobile) - creates journal entries |

#### Chat & AI

**What these do:** Talk to Lore Keeper like you would ChatGPT, but it knows your entire life story. Choose from three personas:
- **The Archivist**: Analytical and precise, focuses on facts and patterns
- **The Confidante**: Warm and empathetic, provides emotional insights  
- **Angel Negro**: Creative and poetic, offers unique perspectives

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/chat` | POST | "Ask Lore Keeper" – returns GPT-4 answer grounded in journal data with persona support (The Archivist, The Confidante, Angel Negro) |

#### Timeline & Summaries

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/timeline` | GET | Chapter + month grouped timeline feed |
| `/api/timeline/tags` | GET | Tag cloud metadata |
| `/api/timeline/append` | POST | Append event to timeline |
| `/api/summary` | POST | Date range summary (weekly digest, etc.) |
| `/api/summary/reflect` | POST | GPT reflect mode; analyze a month, entry, or give advice |
| `/api/evolution` | GET | Dynamic persona insights, echoes, and era nudges based on recent entries |

#### Tasks & Task Engine

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/tasks` | GET | List tasks for authenticated user (filter by status) |
| `/api/tasks` | POST | Create a new task |
| `/api/tasks/from-chat` | POST | Extract and create tasks from chat messages |
| `/api/tasks/suggest` | POST | Get AI-suggested tasks based on context |
| `/api/autopilot/daily` | GET | Autopilot Engine daily plan (JSON or markdown) |
| `/api/autopilot/weekly` | GET | Weekly Autopilot strategy (JSON or markdown) |
| `/api/autopilot/monthly` | GET | Monthly course correction recommendations |
| `/api/autopilot/transition` | GET | Arc/identity transition guidance |
| `/api/autopilot/alerts` | GET | Burnout, slump, and focus-window alerts |
| `/api/autopilot/momentum` | GET | Skill momentum signal |
| `/api/tasks/sync/microsoft` | POST | Sync tasks from Microsoft To Do |
| `/api/tasks/oauth/microsoft` | GET | Get Microsoft OAuth URL for task sync |
| `/api/tasks/events` | GET | Get task events and activity |
| `/api/tasks/:taskId` | PATCH | Update a task |
| `/api/tasks/:taskId/complete` | POST | Mark a task as complete |
| `/api/tasks/:taskId` | DELETE | Delete a task |
| `/api/tasks/briefing` | GET | Get daily briefing with tasks, timeline events, and activity summary |

#### Corrections & Canon

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/corrections/:entryId` | GET | Get entry with correction history |
| `/api/corrections/:entryId` | POST | Create a correction for an entry |
| `/api/canon` | GET | Build canonical alignment from corrections and archived entries |

#### Memory Graph & Visualization

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/memory-graph` | GET | Build memory graph visualization |
| `/api/memory-graph/link` | POST | Create a link between memories in the graph |
| `/api/memory-ladder` | GET | Render memory ladder (daily/weekly/monthly intervals) |
| `/api/ladder` | GET | Build narrative ladder from timeline |

#### People, Places & Locations

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/people-places` | GET | List people and places entities |
| `/api/people-places/stats` | GET | Get statistics for people and places |
| `/api/people-places/:id` | GET | Get specific person or place entity |
| `/api/people-places/:id/aliases` | POST | Add aliases to a person or place entity |
| `/api/locations` | GET | List all locations from journal entries |

#### Continuity & Canon

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/continuity/state` | GET | Get continuity state (canon facts, drift summary, conflicts) |
| `/api/continuity/conflicts` | GET | List detected conflicts |
| `/api/continuity/report` | GET | Generate continuity report (markdown) |
| `/api/continuity/recompute` | POST | Recompute continuity state |

#### Lore Orchestrator

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/orchestrator/summary` | GET | Unified summary of lore state |
| `/api/orchestrator/timeline` | GET | Unified timeline with all layers |
| `/api/orchestrator/identity` | GET | Identity pulse with motifs and drift warnings |
| `/api/orchestrator/continuity` | GET | Continuity context (facts, conflicts, drift) |
| `/api/orchestrator/saga` | GET | Saga overview (era, arcs, chapters) |
| `/api/orchestrator/characters/:id` | GET | Character context (profile, relationships, memories) |
| `/api/orchestrator/hqi` | GET | HQI search results |
| `/api/orchestrator/fabric/:memoryId` | GET | Memory fabric neighborhood for a specific memory |

#### HQI Search

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/hqi/search` | GET/POST | Hypergraph Quantum Index search across all lore types |
| `/api/hqi/node/:id/context` | GET | Get context for a specific HQI node |

#### Identity & Persona

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/identity/pulse` | GET | Identity pulse with persona, motifs, emotional trajectory, and drift warnings |
| `/api/identity/recompute` | POST | Recompute identity persona with optional description, motifs, tone profile, behavioral biases, emotional vector, and version |

#### Saga & Narrative

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/saga` | GET | Saga overview with era, arcs, and cinematic chapters |

#### Memory Fabric

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/fabric` | GET | Memory fabric graph snapshot (nodes and links) |

#### Characters

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/characters/:id` | GET | Get character profile |
| `/api/characters/:id/relationships` | GET | Get character relationship graph |
| `/api/characters/:id/memories` | GET | Get character memories timeline |
| `/api/characters/:id/closeness` | GET | Get closeness score over time |
| `/api/characters/:id/influence` | GET | Get influence metrics by category |

#### Timeline Enhancements

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/timeline/omni` | GET | Omni-timeline with all layers (events, tasks, arcs, identity, drift, tags, voice memos) |
| `/api/timeline/arcs` | GET | Get arc summaries |
| `/api/timeline/identity` | GET | Get identity shifts over time |

#### Journal & Notebook

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/journal/create` | POST | Create a journal entry with text, tags, characters, mood, arcId, fabric links, and references |
| `/api/journal/autosave` | POST | Autosave journal entry draft (text, tags, characters, mood, arcId) |
| `/api/arcs/suggestions` | GET | Get arc suggestions based on text content |
| `/api/moods/score` | POST | Score mood from text content (-5 to 5) |
| `/api/memory-preview` | POST | Preview related memories based on text, tags, or characters |

#### Account Management

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/account/export` | GET | Export all user data (journal entries, timeline events, tasks, characters, etc.) |
| `/api/account/delete` | POST | Delete account data (can scope to sessions only) |

#### Onboarding

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/onboarding/init` | POST | Initialize new user account |
| `/api/onboarding/import` | POST | Import memories from files, calendar, or photos |
| `/api/onboarding/briefing` | GET | Generate onboarding briefing |

#### GitHub Integration

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/github/link` | POST | Link a GitHub repository to sync |
| `/api/github/sync` | POST | Sync GitHub repository commits and issues into timeline |
| `/api/github/summaries` | GET | List GitHub commit summaries |

#### Agents

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/agents/status` | GET | List all agents and their status |
| `/api/agents/run/:name` | POST | Run a specific agent by name |
| `/api/agents/run-all` | POST | Run all agents |

All endpoints expect a Supabase auth token via `Authorization: Bearer <access_token>` header.

### Chapters feature

- Users can create named chapters with start/end dates and optional descriptions.
- Journal entries can be assigned to chapters; the `/api/timeline` endpoint returns chapters grouped by month alongside an `unassigned` bucket.
- A chapter summary endpoint (`/api/chapters/:chapter_id/summary`) sends entries to OpenAI and stores the resulting summary back onto the chapter.
- Semantic search is backed by pgvector embeddings; pass `?semantic=true&search=...` to `/api/entries` to fetch cosine-similar memories.
- Voice-to-entry uploads use Whisper to transcribe and GPT to normalize the entry.
- Reflect Mode (`/api/summary/reflect`) packages recent entries into a persona-aware insight.
- **Evolving Persona Mode** (`/api/evolution`) analyzes your recent moods, tags, and chapters to propose tone shifts, echo past moments, and suggest the next era title for your lorekeeper persona.

### Frontend Highlights

- **Authentication**: Email magic link or Google OAuth via Supabase
- **Neon Composer**: Enhanced journal composer with:
  - **Arc Suggestion Bar**: AI-suggested narrative arcs as you type
  - **Character Suggestion Bar**: Auto-complete character mentions
  - **Tag Suggestion Bar**: Smart tag recommendations
  - **Emotional Slider**: Capture mood and emotional state
  - Chat-style interface with auto keyword detection ("log", "update", "chapter", …)
- **Chapters Dashboard**: Collapsible arcs + unassigned entries, chapter summaries via GPT
- **Photo Processing**: Background processing automatically creates journal entries (no gallery UI)
- **Voice Memos**: Optional AES-GCM client-side encryption and voice uploads that transcribe with Whisper
- **Interactive "Ask Lore Keeper" Chatbot**: Query your memories with three personas:
  - **The Archivist**: Analytical and precise, focuses on facts and patterns
  - **The Confidante**: Warm and empathetic, provides emotional insights
  - **Angel Negro**: Creative and poetic, offers unique perspectives
- **Task Engine Panel**: Manage tasks extracted from chat, sync with Microsoft To Do, track task events
- **Daily Briefing**: Executive-style summaries combining tasks, timeline events, and activity patterns
- **Task Timeline Links**: Automatic linking of tasks to timeline events and journal entries for unified memory tracking
- **HQI Search Overlay**: Full-screen Hypergraph Quantum Index search with:
  - Multi-modal search across memories, tasks, characters, arcs, and motifs
  - Filter sidebar for type, tags, date ranges
  - Instant results with relevance scores
  - Result cards with snippets and metadata
- **Omni-Timeline Panel**: Unified timeline view with:
  - **Layer Toggles**: Show/hide events, tasks, arcs, identity pulses, drift alerts, tags, voice memos
  - **Arc Ribbon**: Visual representation of narrative arcs
  - **Identity Pulse**: Real-time identity state indicators
  - **Drift Tags**: Visual markers for timeline drift
  - **Voice Memo Markers**: Special indicators for voice entries
  - **Event Cards**: Rich timeline event cards with summaries and tags
- **Continuity Panel**: Monitor lore consistency with:
  - **Canon Facts List**: View verified facts about characters, identity, locations
  - **Conflict List**: See detected factual and temporal conflicts
  - **Stability Meter**: Visual consistency scores
  - **Continuity Graph**: Visualize relationships between facts
  - **Merge Suggestion Dialog**: Resolve conflicts with AI suggestions
- **Character Pages**: Dedicated character views with:
  - **Character Header**: Profile with portrait, pronouns, bio, traits
  - **Relationship Graph**: Visual graph of character relationships
  - **Closeness Chart**: Track relationship closeness over time
  - **Influence Meter**: See character influence across categories
  - **Shared Timeline**: Timeline of memories shared with the character
- **Identity Pulse Panel**: Track your evolving identity with:
  - **Identity Gauge**: Current persona state visualization
  - **Motif Bars**: Visual representation of active motifs and their energy
  - **Emotional Trajectory Graph**: Chart emotional patterns over time
  - **Drift Warnings**: Alerts for identity shifts and inconsistencies
- **Saga Screen**: Cinematic narrative view with:
  - **Era Overview**: Current narrative era and context
  - **Arc Curves**: Visual representation of narrative intensity
  - **Cinematic Chapters**: Story-driven chapter presentation
  - **Key Moment Cards**: Highlighted turning points
- **Memory Fabric Panel**: 3D graph visualization of memory connections:
  - **Fabric Graph 3D**: Interactive 3D network of memories, characters, and tasks
  - **Fabric Filter Bar**: Filter nodes by type, tags, date
  - **Fabric Node Cards**: Detailed views of memory nodes
  - **Relation Types**: Semantic, temporal, emotional, and identity connections
- **Semantic Search**: Natural language search with meaning-based matching (toggle semantic/keyword modes)
- **Corrections System**: Archive and correct entries while preserving history
- **Memory Graph**: Visualize connections between memories, people, and places
- **Memory Ladder**: View narrative progression over daily/weekly/monthly intervals
- **People & Places**: Track entities mentioned across your journal entries
- **Location Tracking**: See all locations from your journal entries
- **Canon View**: View canonical alignment from corrections and archived entries
- **GitHub Integration**: Link repositories and sync commits/issues into your timeline
- **Account Management**: Export all your data or delete your account
- **Onboarding Flow**: Guided setup with memory import from files, calendar, or photos
- **Agent System**: View and run autonomous agents for maintenance tasks
- **Notebook Features**: Arc suggestions, mood scoring, and memory previews while composing
- Dual-column dashboard: timeline, tag cloud, AI summary, chatbot panel, and task management
- Real-time error handling with helpful messages for backend connectivity issues
- Local cache (localStorage) for offline-first memory preview
- Dark cyberpunk palette with neon accents, Omega splash copy, and theme customization

---

## Behind the Scenes: How Lore Keeper Maintains Itself

### Omega Agent Network

**What it does:** Autonomous "robots" that keep your journal organized, accurate, and up-to-date without you having to do anything.

**Why it matters:** Just like your phone updates apps automatically, Lore Keeper has agents that:
- Fix inconsistencies in your entries
- Enrich entries with missing information
- Keep your timeline accurate
- Refresh search indexes so everything stays fast
- Generate summaries automatically

**In Simple Terms:** Think of agents as helpful assistants that work 24/7 to keep your journal in perfect shape.

**Technical Details:**
The autonomous maintenance layer of Lore Keeper. Agents self-correct drift, enrich metadata, regenerate narratives, refresh embeddings, maintain identity arcs, and run nightly summaries.

### Mobile App (iOS/Android)

- React Native app with Expo
- **Background photo sync** - processes photos without storing them
- **Calendar event sync** - automatically logs calendar events to timeline
- Automatic location and EXIF metadata extraction
- Creates journal entries automatically from photos and calendar events
- No photo gallery UI - just syncs metadata to build your lore

### Python Package (`lorekeeper/`)

The project includes a Python package for advanced timeline management and narrative generation:

- **TimelineManager**: Append-only timeline system with year-sharded JSON storage
- **TimelineAgentInterface**: Agent-friendly interface for timeline operations
- **NarrativeStitcher**: Stitches together narrative arcs from timeline events
- **VoiceMemoIngestor**: Processes voice memos into structured timeline events
- **DriftAuditor**: Detects and prevents timeline drift
- **DailyBriefingEngine**: Generates daily executive briefings
- **WeeklyArcEngine**: Creates weekly narrative arcs
- **MonthlyArcEngine**: Generates monthly narrative summaries
- **ContinuityEngine** (`lorekeeper/continuity/`): Maintains canonical facts, detects conflicts, tracks drift, and generates continuity reports
  - **CanonicalRegistry**: Stores verified facts about characters, identity, locations, events
  - **Conflict Detection**: Identifies factual and temporal inconsistencies
  - **Drift Rules**: Tracks identity shifts and narrative drift over time
  - **Merge Rules**: Proposes conflict resolutions
  - **Continuity Reports**: Generates markdown reports summarizing canon, conflicts, and drift
- **LoreOrchestrator** (`lorekeeper/orchestrator/`): Unified orchestrator that coordinates all Lore Keeper subsystems
  - **OrchestratorSummary**: High-level overview combining timeline, identity, continuity, saga, and character data
  - **Context Schemas**: Structured data models for timeline, identity, continuity, character, saga, and fabric contexts
  - **HQI Integration**: Coordinates Hypergraph Quantum Index search
  - **Fabric Neighborhoods**: Generates memory fabric graphs for specific memories

See [`lorekeeper/README.md`](lorekeeper/README.md) for detailed Python package documentation.

### Memory Flow

1. User signs in through Supabase; session is reused for API calls.
2. **Neon Composer** can either save raw content or ask GPT to recall info. Keywords trigger automatic persistence server-side too. Arc, character, and tag suggestions enhance the writing experience.
3. **Calendar events** are synced from iPhone and automatically create journal entries with location, attendees, and context using GPT-4 to generate meaningful entries.
4. **Photos** are processed in the background - metadata creates journal entries without storing photos.
5. **X posts** can be synced via `/api/x/sync` - posts are imported and summarized into timeline entries.
6. **Tasks** can be extracted from chat messages or created manually, with optional Microsoft To Do sync. Task creation and completion automatically create timeline events and memory bridges.
7. **Daily Briefing** generates executive summaries combining recent activity, task status, narrative arcs, and drift detection.
8. Entries are stored with `date, content, tags, chapter_id, mood, summary, source, metadata` schema.
9. **Omni-Timeline** groups entries per chapter (and unassigned) and then by month, with multiple layers (events, tasks, arcs, identity, drift, tags, voice memos). Summary endpoints leverage GPT to condense a date range or a chapter arc.
10. **Chatbot queries** (`/api/chat`) use semantic search to find relevant memories and generate contextual responses based on your journal history.
11. **HQI Search** provides unified search across memories, tasks, characters, arcs, and motifs using Hypergraph Quantum Index ranking.
12. **Continuity Engine** continuously monitors entries for canonical facts, detects conflicts, tracks drift, and maintains consistency across your lore.
13. **Lore Orchestrator** coordinates data from timeline, identity, continuity, saga, characters, HQI, and fabric subsystems for unified access.
14. **Identity Pulse** tracks persona evolution, motifs, emotional trajectory, and drift warnings in real-time.
15. **Memory Fabric** visualizes connections between memories, characters, and tasks as an interactive 3D graph.
16. **Character Pages** track relationships, closeness over time, influence metrics, and shared memories.
17. **Saga Screen** presents your narrative as cinematic chapters with arcs and key moments.
18. **Corrections** archive original entries and create corrected versions, preserving full history.
19. **GitHub Integration** allows linking repositories and syncing commits/issues into your timeline as journal entries.
20. **Account Management** provides data export and deletion capabilities for user control.
21. **Onboarding** guides new users through setup with memory import options.
22. **Agent System** runs autonomous maintenance agents for drift correction, metadata enrichment, and narrative regeneration.
23. **Notebook Features** provide real-time arc suggestions, mood scoring, and memory previews while composing entries.
24. Node cron hook (`registerSyncJob`) is ready for future nightly summarization or webhook ingests.

### AutopilotEngine — AI Life Guidance

**What it does:** An AI coach that analyzes your life patterns and gives you personalized advice on what to do next.

**Why it matters:** Sometimes you're too close to your own life to see patterns. AutopilotEngine notices things like:
- "You're most productive in the mornings"
- "You tend to burn out after 3 weeks of intense work"
- "You're happiest when you exercise regularly"
- "This is a good time to focus on creative projects"

**What You Get:**
- **Daily guidance**: What to focus on today based on your patterns
- **Weekly strategy**: Top priorities for the week ahead
- **Monthly insights**: Big-picture course corrections
- **Burnout alerts**: Warnings when you're pushing too hard
- **Momentum tracking**: See when you're building positive habits

**In Simple Terms:** Like having a life coach who knows your entire history and can spot patterns you might miss.

**Technical Details:**
The AutopilotEngine blends timeline density, task pressure, identity motifs, and seasonal arcs to recommend what to do next. It detects cadence cycles, focus windows, identity shifts, and burnout/slump risk to generate daily, weekly, and monthly guidance.

**Available API routes:** `/api/autopilot/daily`, `/weekly`, `/monthly`, `/transition`, `/alerts`, `/momentum` (all support `?format=markdown`).

**CLI usage:** `python -m lorekeeper.autopilot daily --format json` (also supports `weekly`, `monthly`, `transition`, `alerts`, `momentum`). Pipe a JSON payload to stdin to override the demo data.

**Integration:** The Express router calls the Python AutopilotEngine via a bridge that streams timeline entries, task engine data, identity motifs, and arc metadata.

### Troubleshooting

**Backend won't start:**

- Ensure `.env` file exists in the project root directory
- Check that all required environment variables are set
- Verify port 4000 is not already in use: `lsof -i :4000`
- Check backend logs for specific error messages

**Chatbot not working:**

- Ensure backend server is running (`pnpm run dev:server`)
- Verify `OPENAI_API_KEY` is set correctly in `.env`
- Check browser console for error messages
- Ensure you're authenticated (Supabase session active)

**API requests failing:**

- Backend server must be running on `http://localhost:4000`
- Check that Supabase credentials are correct
- Verify authentication token is being sent with requests

### Project Structure

```text
lorekeeper/
├── apps/
│   ├── web/              # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── characters/     # Character pages and components
│   │   │   │   ├── composer/        # Neon composer with suggestion bars
│   │   │   │   ├── continuity/      # Continuity panel components
│   │   │   │   ├── fabric/          # Memory fabric visualization
│   │   │   │   ├── identity/        # Identity pulse components
│   │   │   │   ├── saga/            # Saga screen components
│   │   │   │   ├── search/          # HQI search overlay
│   │   │   │   └── timeline/        # Omni-timeline components
│   │   │   ├── hooks/               # React hooks for data fetching
│   │   │   └── api/                 # API client functions
│   ├── server/           # Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── routes/              # API route handlers
│   │   │   │   ├── continuity.ts   # Continuity API routes
│   │   │   │   └── orchestrator.ts  # Orchestrator API routes
│   │   │   └── services/
│   │   │       └── orchestratorService.ts  # Orchestrator service
│   └── mobile/           # React Native mobile app
├── lorekeeper/           # Python package for timeline management
│   ├── continuity/       # Continuity engine (facts, conflicts, drift)
│   ├── orchestrator/     # Lore orchestrator (unified API)
│   ├── daily_briefing/   # Daily briefing engine
│   ├── weekly_arc/       # Weekly narrative arcs
│   └── monthly_arc/      # Monthly narrative summaries
└── migrations/           # SQL migration files
```

### Next Ideas

1. Wire Supabase edge functions or webhooks to push ChatGPT transcripts directly.
2. ✅ Embedding search (pgvector) implemented - `Ask Lore Keeper` uses semantic matches.
3. ✅ Task engine implemented - extract tasks from chat and sync with Microsoft To Do.
4. ✅ Character knowledge base implemented - track relationships and shared memories.
5. ✅ X (Twitter) integration implemented - sync posts into timeline.
6. ✅ Daily briefing engine implemented - executive summaries from timeline, tasks, and narrative data.
7. ✅ Task timeline links implemented - bridge tasks to timeline events and journal entries.
8. ✅ Memory graph visualization implemented - see connections between memories.
9. ✅ Corrections system implemented - archive and correct entries with full history.
10. ✅ Memory ladder implemented - view narrative progression over time.
11. ✅ Continuity engine implemented - canonical facts, conflict detection, drift analysis.
12. ✅ Lore orchestrator implemented - unified API for all major subsystems.
13. ✅ HQI search implemented - Hypergraph Quantum Index search across all lore types.
14. ✅ Character pages implemented - dedicated character views with relationship graphs and metrics.
15. ✅ Identity pulse panel implemented - track identity evolution with motifs and drift warnings.
16. ✅ Saga screen implemented - cinematic narrative view with arcs and chapters.
17. ✅ Memory fabric implemented - 3D graph visualization of memory connections.
18. ✅ Omni-timeline implemented - unified timeline with multiple layers and visualizations.
19. ✅ Neon composer implemented - enhanced composer with arc, character, and tag suggestions.
20. ✅ GitHub integration implemented - sync repositories into timeline.
21. ✅ Account management implemented - data export and deletion.
22. ✅ Onboarding flow implemented - guided setup with memory import.
23. ✅ Agent system implemented - autonomous maintenance agents.
24. ✅ Notebook features implemented - arc suggestions, mood scoring, memory previews.
25. Add export routines (Markdown/PDF) and toggle for public blog feed.
26. Extend cron job to automatically create daily summaries and AI prompts.
27. Add more chatbot personas and customization options.
28. Integrate Python narrative engines with backend API.

---

## Quick Reference: Key Terms Explained

**For Non-Technical Users:** Here's what all the technical terms mean in plain English.

| Term | What It Means |
|------|---------------|
| **Entry** | A journal entry — something you write about your day, thoughts, or experiences |
| **Chapter** | A period of your life organized into a story (e.g., "College Years", "Starting My Business") |
| **Arc** | A narrative thread that connects related entries over time (e.g., "Learning to Code") |
| **Character** | A person in your life that Lore Keeper tracks (friends, family, colleagues, etc.) |
| **Timeline** | Your life organized chronologically — all entries, events, and memories in order |
| **Semantic Search** | Finding memories by meaning, not just keywords (e.g., searching "stressful times" finds entries about anxiety, pressure, overwhelm) |
| **Motif** | A recurring theme or pattern in your life (e.g., "creativity", "travel", "family") |
| **Identity Pulse** | Your current state — who you are right now, based on recent entries |
| **Drift** | Changes in your identity or story over time (e.g., shifting from "student" to "professional") |
| **Continuity** | Keeping your journal consistent and accurate (catching contradictions) |
| **Memory Fabric** | A visual map showing how different memories connect to each other |
| **HQI** | Hypergraph Quantum Index — the advanced search engine that finds memories by meaning |
| **Orchestrator** | A central hub that brings together all Lore Keeper features in one place |
| **Agent** | An automated helper that keeps your journal organized and accurate |
| **Embedding** | A way of representing text as numbers so AI can understand meaning |
| **API** | Application Programming Interface — how different parts of Lore Keeper communicate |
| **Endpoint** | A specific function you can call (like a button you can press) |
| **Supabase** | The database service that stores all your data securely |
| **GPT-4** | The AI model that understands and generates text (made by OpenAI) |

---

Have fun crafting your lore ✨
