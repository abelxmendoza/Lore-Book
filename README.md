<div align="center">
  <img src="apps/web/public/images/loreKeeperlogo3.png" alt="Lore Keeper Logo" width="300" />
</div>

# Lore Keeper by Omega Technologies

Lore Keeper is an AI-powered journaling platform that blends Supabase auth, GPT-4 context, and an expressive cyberpunk UI. It automatically captures important chats, builds a memory timeline, and lets you query your past like you would ask ChatGPT.

## Tech Stack

- **Frontend**: React + Vite, Tailwind, shadcn-inspired UI primitives, Zustand state helpers
- **Backend**: Express + TypeScript, OpenAI GPT-4, Supabase/Postgres for storage, cron-ready jobs
- **Python Package**: Timeline management, narrative engines (daily/weekly/monthly arcs), voice memo ingestion, drift auditing
- **Mobile**: React Native with Expo for iOS/Android
- **Auth & DB**: Supabase Auth + Supabase/Postgres tables for `journal_entries`, `daily_summaries`, `chapters`, `tasks`, `timeline_events`, `characters`, and more
- **Insight Engine**: Python-based signal detector that clusters embeddings, surfaces motifs, and predicts new arcs
- **Persona Engine**: Deterministic Omega Persona Engine that blends identity arcs, seasonal trends, and emotional slopes into a live persona state

## Omega Persona Engine

The new persona layer keeps Lore Keeper's assistant aligned with who the user is *right now*.

- **Python core**: `lorekeeper/persona` derives persona versions, motifs, and tone based on identity, emotional slopes, and seasonal arcs.
- **Behavior rules**: Lightweight heuristics translate persona state into deterministic tone and language guidance.
- **API**: `/api/persona`, `/api/persona/update`, and `/api/persona/description` expose persona state to the web app and other services.
- **UI**: `/persona` page visualizes the current persona, motifs, tone profile, and recent evolution.

Architecture sketch:

```
Timeline → IdentityEngine → OmegaPersonaEngine → Persona Rules → API/Chat UI
                  ↑                 ↓
            SeasonEngine      Daily/Weekly Briefings
```

## Hypergraph Quantum Index (HQI)

HQI is the unified search engine for Lore Keeper. It blends vectors, graph edges, timeline data, tags, characters, and motifs into a single ranking function. This enables deep life querying, fast recall, and context-rich retrieval.

## Getting Started

```bash
pnpm install
pnpm run dev:server      # http://localhost:4000
pnpm run dev:web         # http://localhost:5173
```

Fill out `.env` based on `.env.example` before running either service. The `.env` file should be placed in the project root directory.

**Required Environment Variables:**

- `OPENAI_API_KEY` - Your OpenAI API key (required for GPT-4 and chatbot features)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for backend operations)
- `OPENAI_API_MODEL` - Model used by the server for GPT calls (defaults to `gpt-4o-mini`)
- `OPENAI_EMBEDDING_MODEL` - Model for semantic search embeddings (defaults to `text-embedding-3-small`)
- `X_API_BEARER_TOKEN` - (Optional) Enables syncing X posts into your lore timeline

**Note:** The backend will log warnings for missing environment variables but will attempt to start in development mode. Ensure all required variables are set for full functionality.

## Insight Engine

The InsightEngine (`lorekeeper/insight_engine.py`) ingests timeline events, arcs, identity snapshots, and optional character/location metadata. It builds lightweight embeddings, performs quick clustering, and emits structured insights for:

- **Patterns**: thematic clusters based on embeddings
- **Correlations**: co-occurring tags and recurring character mentions
- **Cycles**: weekly/seasonal rhythms inferred from timestamps
- **Motifs**: frequently resurfacing tokens
- **Identity Shifts**: changes in stated traits over time
- **Predictions**: rising tags that may define the next arc

Data classes for these outputs live in `lorekeeper/insights_types.py` so they can be reused across agents and UI panels.

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

### API Surface

#### Journal Entries & Memory

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/entries` | GET | Search entries by tag, date range, or chapter (supports semantic search) |
| `/api/entries` | POST | Create a manual entry (keywords auto-tagged) |
| `/api/entries/suggest-tags` | POST | GPT-assisted tag suggestions |
| `/api/entries/detect` | POST | Check if a message should be auto-saved |
| `/api/entries/voice` | POST | Upload an audio clip; Whisper transcribes and GPT formats a journal entry |

#### Chapters

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/chapters` | GET | List chapters for the authenticated user |
| `/api/chapters` | POST | Create a chapter (title + dates + description) |
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

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/chat` | POST | "Ask Lore Keeper" – returns GPT-4 answer grounded in journal data with persona support (The Archivist, The Confidante, Angel Negro) |

#### Timeline & Summaries

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/timeline` | GET | Chapter + month grouped timeline feed |
| `/api/timeline/tags` | GET | Tag cloud metadata |
| `/api/summary` | POST | Date range summary (weekly digest, etc.) |
| `/api/summary/reflect` | POST | GPT reflect mode; analyze a month, entry, or give advice |
| `/api/evolution` | GET | Dynamic persona insights, echoes, and era nudges based on recent entries |

#### Tasks & Task Engine

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/tasks` | GET | List tasks for authenticated user (filter by status) |
| `/api/tasks` | POST | Create a new task |
| `/api/tasks/from-chat` | POST | Extract and create tasks from chat messages |
| `/api/autopilot/daily` | GET | Autopilot Engine daily plan (JSON or markdown) |
| `/api/autopilot/weekly` | GET | Weekly Autopilot strategy (JSON or markdown) |
| `/api/autopilot/monthly` | GET | Monthly course correction recommendations |
| `/api/autopilot/transition` | GET | Arc/identity transition guidance |
| `/api/autopilot/alerts` | GET | Burnout, slump, and focus-window alerts |
| `/api/autopilot/momentum` | GET | Skill momentum signal |
| `/api/tasks/sync/microsoft` | POST | Sync tasks from Microsoft To Do |
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
| `/api/memory-ladder` | GET | Render memory ladder (daily/weekly/monthly intervals) |
| `/api/ladder` | GET | Build narrative ladder from timeline |

#### People, Places & Locations

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/people-places` | GET | List people and places entities |
| `/api/people-places/stats` | GET | Get statistics for people and places |
| `/api/locations` | GET | List all locations from journal entries |

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
- **Journal Composer**: Chat-style interface with auto keyword detection ("log", "update", "chapter", …)
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
- **Semantic Search**: Natural language search with meaning-based matching (toggle semantic/keyword modes)
- **Corrections System**: Archive and correct entries while preserving history
- **Memory Graph**: Visualize connections between memories, people, and places
- **Memory Ladder**: View narrative progression over daily/weekly/monthly intervals
- **People & Places**: Track entities mentioned across your journal entries
- **Location Tracking**: See all locations from your journal entries
- **Canon View**: View canonical alignment from corrections and archived entries
- Dual-column dashboard: timeline, tag cloud, AI summary, chatbot panel, and task management
- Real-time error handling with helpful messages for backend connectivity issues
- Local cache (localStorage) for offline-first memory preview
- Dark cyberpunk palette, neon accents, Omega splash copy

## Omega Agent Network

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

See [`lorekeeper/README.md`](lorekeeper/README.md) for detailed Python package documentation.

### Memory Flow

1. User signs in through Supabase; session is reused for API calls.
2. Composer can either save raw content or ask GPT to recall info. Keywords trigger automatic persistence server-side too.
3. **Calendar events** are synced from iPhone and automatically create journal entries with location, attendees, and context using GPT-4 to generate meaningful entries.
4. **Photos** are processed in the background - metadata creates journal entries without storing photos.
5. **X posts** can be synced via `/api/x/sync` - posts are imported and summarized into timeline entries.
6. **Tasks** can be extracted from chat messages or created manually, with optional Microsoft To Do sync. Task creation and completion automatically create timeline events and memory bridges.
7. **Daily Briefing** generates executive summaries combining recent activity, task status, narrative arcs, and drift detection.
8. Entries are stored with `date, content, tags, chapter_id, mood, summary, source, metadata` schema.
9. Timeline endpoint groups entries per chapter (and unassigned) and then by month; summary endpoints leverage GPT to condense a date range or a chapter arc.
10. **Chatbot queries** (`/api/chat`) use semantic search to find relevant memories and generate contextual responses based on your journal history.
11. **Corrections** archive original entries and create corrected versions, preserving full history.
12. Node cron hook (`registerSyncJob`) is ready for future nightly summarization or webhook ingests.

### AutopilotEngine — AI Life Guidance

The AutopilotEngine blends timeline density, task pressure, identity motifs, and seasonal arcs to recommend what to do next.

- **What it does:** Detects cadence cycles, focus windows, identity shifts, and burnout/slump risk to generate daily, weekly, and monthly guidance.
- **Available routes:** `/api/autopilot/daily`, `/weekly`, `/monthly`, `/transition`, `/alerts`, `/momentum` (all support `?format=markdown`).
- **Sample outputs:** Daily plan with prioritized tasks + focus window, weekly strategy with top focus areas, monthly course corrections, and alerts for burnout or skill momentum.
- **CLI usage:** `python -m lorekeeper.autopilot daily --format json` (also supports `weekly`, `monthly`, `transition`, `alerts`, `momentum`). Pipe a JSON payload to stdin to override the demo data.
- **Integration:** The Express router calls the Python AutopilotEngine via a bridge that streams timeline entries, task engine data, identity motifs, and arc metadata.

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
│   ├── server/           # Express + TypeScript backend
│   └── mobile/           # React Native mobile app
├── lorekeeper/           # Python package for timeline management
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
11. Add export routines (Markdown/PDF) and toggle for public blog feed.
12. Extend cron job to automatically create daily summaries and AI prompts.
13. Add more chatbot personas and customization options.
14. Build character relationship graph UI.
15. Integrate Python narrative engines with backend API.

Have fun crafting your lore ✨
