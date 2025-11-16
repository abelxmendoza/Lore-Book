<div align="center">
  <img src="apps/web/public/images/loreKeeperlogo3.png" alt="Lore Keeper Logo" width="300" />
</div>

# Lore Keeper by Omega Technologies

Lore Keeper is an AI-powered journaling platform that blends Supabase auth, GPT-4 context, and an expressive cyberpunk UI. It automatically captures important chats, builds a memory timeline, and lets you query your past like you would ask ChatGPT.

## Tech Stack

- **Frontend**: React + Vite, Tailwind, shadcn-inspired UI primitives, Zustand state helpers
- **Backend**: Express + TypeScript, OpenAI GPT-4, Supabase/Postgres for storage, cron-ready jobs
- **Auth & DB**: Supabase Auth + Supabase/Postgres tables for `journal_entries` and `daily_summaries`

## Getting Started

```bash
pnpm install
pnpm run dev:server      # http://localhost:4000
pnpm run dev:web         # http://localhost:5173
```

Fill out `.env` based on `.env.example` before running either service.
- `OPENAI_API_MODEL` is used by the server for GPT calls (defaults to `gpt-4o-mini`).
- `OPENAI_EMBEDDING_MODEL` powers semantic search embeddings (defaults to `text-embedding-3-small`).

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
```

Grant `select/insert/update` on both tables to the `service_role` used by the API. Frontend reads data through the API so you do not need row level policies for now, but enabling RLS is recommended if you later expose Supabase directly to the client.

### API Surface

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/entries` | GET | Search entries by tag, date range, or chapter |
| `/api/entries` | POST | Create a manual entry (keywords auto-tagged) |
| `/api/entries/suggest-tags` | POST | GPT-assisted tag suggestions |
| `/api/entries/detect` | POST | Check if a message should be auto-saved |
| `/api/entries/voice` | POST | Upload an audio clip; Whisper transcribes and GPT formats a journal entry |
| `/api/chapters` | GET | List chapters for the authenticated user |
| `/api/chapters` | POST | Create a chapter (title + dates + description) |
| `/api/chapters/:chapter_id/summary` | POST | Generate & store a GPT summary for a chapter |
| `/api/photos/upload` | POST | Upload photo(s) and auto-generate journal entry |
| `/api/photos/upload/batch` | POST | Upload multiple photos at once |
| `/api/photos` | GET | Get all user photos |
| `/api/photos/sync` | POST | Sync photo metadata from device (mobile) |
| `/api/calendar/sync` | POST | Sync calendar events from device (mobile) - creates journal entries |
| `/api/chat` | POST | "Ask Lore Keeper" – returns GPT-4 answer grounded in journal data |
| `/api/timeline` | GET | Chapter + month grouped timeline feed |
| `/api/timeline/tags` | GET | Tag cloud metadata |
| `/api/summary` | POST | Date range summary (weekly digest, etc.) |
| `/api/summary/reflect` | POST | GPT reflect mode; analyze a month, entry, or give advice |

All endpoints expect a Supabase auth token via `Authorization: Bearer <access_token>` header.

### Chapters feature

- Users can create named chapters with start/end dates and optional descriptions.
- Journal entries can be assigned to chapters; the `/api/timeline` endpoint returns chapters grouped by month alongside an `unassigned` bucket.
- A chapter summary endpoint (`/api/chapters/:chapter_id/summary`) sends entries to OpenAI and stores the resulting summary back onto the chapter.
- Semantic search is backed by pgvector embeddings; pass `?semantic=true&search=...` to `/api/entries` to fetch cosine-similar memories.
- Voice-to-entry uploads use Whisper to transcribe and GPT to normalize the entry.
- Reflect Mode (`/api/summary/reflect`) packages recent entries into a persona-aware insight.

### Frontend Highlights

- Auth gate with email magic link or Google OAuth
- Chat-style journal composer with auto keyword detection ("log", "update", "chapter", …)
- Chapters dashboard with collapsible arcs + unassigned entries, and chapter summaries via GPT
- **Background Photo Processing** - Photos are processed automatically to create journal entries (no gallery UI)
- Composer supports optional AES-GCM client-side encryption and voice uploads that transcribe with Whisper.
- Dual-column dashboard: timeline, tag cloud, AI summary, and "Ask Lore Keeper" panel
- Local cache (localStorage) for offline-first memory preview
- Dark cyberpunk palette, neon accents, Omega splash copy

### Mobile App (iOS/Android)

- React Native app with Expo
- **Background photo sync** - processes photos without storing them
- **Calendar event sync** - automatically logs calendar events to timeline
- Automatic location and EXIF metadata extraction
- Creates journal entries automatically from photos and calendar events
- No photo gallery UI - just syncs metadata to build your lore

### Memory Flow

1. User signs in through Supabase; session is reused for API calls.
2. Composer can either save raw content or ask GPT to recall info. Keywords trigger automatic persistence server-side too.
3. **Calendar events** are synced from iPhone and automatically create journal entries with location, attendees, and context.
4. **Photos** are processed in the background - metadata creates journal entries without storing photos.
5. Entries are stored with `date, content, tags, chapter_id, mood, summary, source, metadata` schema.
6. Timeline endpoint groups entries per chapter (and unassigned) and then by month; summary endpoints leverage GPT to condense a date range or a chapter arc.
7. Node cron hook (`registerSyncJob`) is ready for future nightly summarization or webhook ingests.

### Next Ideas

1. Wire Supabase edge functions or webhooks to push ChatGPT transcripts directly.
2. Implement embedding search (pgvector) so `Ask Lore Keeper` can reference semantic matches.
3. Add export routines (Markdown/PDF) and toggle for public blog feed.
4. Extend cron job to automatically create daily summaries and AI prompts.

Have fun crafting your lore ✨
