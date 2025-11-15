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

### Required Database Tables

```sql
create table if not exists public.journal_entries (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date timestamptz not null,
  content text not null,
  tags text[] default '{}',
  chapter_id text,
  mood text,
  summary text,
  source text not null default 'manual',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.daily_summaries (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  summary text,
  tags text[] default '{}'
);
```

Grant `select/insert/update` on both tables to the `service_role` used by the API. Frontend reads data through the API so you do not need row level policies for now, but enabling RLS is recommended if you later expose Supabase directly to the client.

### API Surface

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/entries` | GET | Search entries by tag, date range, or chapter |
| `/api/entries` | POST | Create a manual entry (keywords auto-tagged) |
| `/api/entries/suggest-tags` | POST | GPT-assisted tag suggestions |
| `/api/entries/detect` | POST | Check if a message should be auto-saved |
| `/api/chat` | POST | “Ask Lore Keeper” – returns GPT-4 answer grounded in journal data |
| `/api/timeline` | GET | Month-grouped timeline feed |
| `/api/timeline/tags` | GET | Tag cloud metadata |
| `/api/summary` | POST | Date range summary (weekly digest, etc.) |

All endpoints expect a Supabase auth token via `Authorization: Bearer <access_token>` header.

### Frontend Highlights

- Auth gate with email magic link or Google OAuth
- Chat-style journal composer with auto keyword detection (“log”, “update”, “chapter”, …)
- Dual-column dashboard: timeline, tag cloud, AI summary, and “Ask Lore Keeper” panel
- Local cache (localStorage) for offline-first memory preview
- Dark cyberpunk palette, neon accents, Omega splash copy

### Memory Flow

1. User signs in through Supabase; session is reused for API calls.
2. Composer can either save raw content or ask GPT to recall info. Keywords trigger automatic persistence server-side too.
3. Entries are stored with `date, content, tags, chapter_id, mood, summary, source, metadata` schema.
4. Timeline endpoint groups entries per month; summary endpoint leverages GPT to condense a date range.
5. Node cron hook (`registerSyncJob`) is ready for future nightly summarization or webhook ingests.

### Next Ideas

1. Wire Supabase edge functions or webhooks to push ChatGPT transcripts directly.
2. Implement embedding search (pgvector) so `Ask Lore Keeper` can reference semantic matches.
3. Add export routines (Markdown/PDF) and toggle for public blog feed.
4. Extend cron job to automatically create daily summaries and AI prompts.

Have fun crafting your lore ✨
