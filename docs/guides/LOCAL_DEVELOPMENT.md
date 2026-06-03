# Local Development Guide

> Merged from: `QUICK_START.md`, `MIGRATION_GUIDE.md`, `DUMMY_DATA_SETUP.md`,
> `POPULATE_DUMMY_USER.md`, `POPULATE_INSTRUCTIONS.md`, `PRIVACY_GUIDE.md`,
> `docs/LOCAL_DEV_MIGRATIONS.md`

---

## Prerequisites

- Node.js 18+
- npm (this repo uses npm, not pnpm)
- A Supabase project (cloud or local)
- An OpenAI API key

---

## Step 1 — Environment Setup

The repo uses a single `.env` file at the project root. Copy the example:

```bash
cp .env.example .env
```

Fill in these required values:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini

# Server
PORT=4000
NODE_ENV=development
```

The frontend also needs `VITE_` prefixed vars for Supabase. Add these to `apps/web/.env.local`:

```env
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## Step 2 — Install Dependencies

```bash
npm install
```

---

## Step 3 — Run Database Migrations

### Using Supabase cloud (recommended for getting started fast)

The easiest path: run migration SQL in the Supabase Dashboard SQL editor.

```
https://supabase.com/dashboard/project/<your-project-id>/sql/new
```

Run these files in order (they're in `migrations/`):

1. `000_setup_all_tables.sql` — all main tables
2. `20250102_conversational_orchestration.sql` — chat sessions + messages
3. `20250125_memory_engine.sql` — conversation sessions, memory components
4. Any other migrations you need for specific features

**Or run all at once via script:**
```bash
# Set your connection string first
export SUPABASE_CONNECTION_STRING='postgresql://postgres:password@db.your-project.supabase.co:5432/postgres'
./scripts/run-all-migrations.sh
```

### Common missing-table errors

| Error | Migration to run |
|-------|-----------------|
| `Could not find table 'chat_sessions'` | `20250102_conversational_orchestration.sql` |
| `Could not find table 'chat_messages'` | `20250102_conversational_orchestration.sql` |
| `Could not find table 'conversation_sessions'` | `20250125_memory_engine.sql` |
| `Could not find table 'characters'` | `000_setup_all_tables.sql` |
| `Could not find table 'people_places'` | `000_setup_all_tables.sql` |

---

## Step 4 — Start the App

```bash
# Start both frontend and backend together
npm run dev

# Or start separately
npm run dev:server   # Backend on port 4000
npm run dev:web      # Frontend on port 5173
```

You should see:
- Server: `Lore Book API listening on 4000`
- Web: `Local: http://localhost:5173`

---

## Step 5 — Verify Everything Works

### Health check
```bash
curl http://localhost:4000/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Smoke test (with server running)
```bash
npm run smoke
```

### Full validation (with server running)
```bash
npm run validate
```

### Supabase connectivity
```bash
npm run check:supabase
```

---

## Step 6 — Populate Dummy Data (Optional)

If you want to explore the app with pre-populated data:

1. Sign up / log in at `http://localhost:5173`
2. Get your Supabase JWT from the browser: `localStorage.getItem('sb-<project>-auth-token')`
3. Run the populate script:
   ```bash
   node scripts/populate-quick.js
   ```

Or use the browser console script at `scripts/populate-browser-console.js`:
1. Open browser console (F12)
2. Copy and paste the script
3. Press Enter, wait for "Population complete!"

---

## Development Commands

```bash
npm run dev              # Start everything
npm run dev:server       # Backend only
npm run dev:web          # Frontend only
npm run validate         # TypeScript + unit tests + HTTP checks
npm run smoke            # HTTP smoke tests (server must be running)
npm run check:supabase   # Supabase connectivity check
```

---

## Supabase: Local vs Cloud

### Cloud (current setup)
The `.env` has real Supabase credentials pointing to `cshtthzpgkmrbcsfghyq.supabase.co`. This is the easiest setup — data persists, Supabase dashboard is available.

### Local Supabase (optional)
If you want a fully local setup:
```bash
npm install -g supabase
supabase init
supabase start
# Copy the credentials shown to .env
supabase db reset   # runs all migrations
```

Local Supabase dashboard: `http://localhost:54323`

---

## Privacy During Development

When using real Supabase credentials, your data is in the real Supabase project. If you want to develop without risking real data:
1. Create a separate Supabase project for development
2. Or use local Supabase

The app stores everything you tell it. Don't use real sensitive personal information in a development environment you share with others.

---

## Common Issues

| Issue | Fix |
|-------|-----|
| `Cannot connect to database` | Check SUPABASE_URL and keys in .env |
| `500 Internal Server Error` | Check server logs, verify migrations ran |
| `Port already in use` | `lsof -ti:4000 \| xargs kill` |
| `Module not found` | `npm install` again |
| `Failed to fetch` in browser | Backend not running, or VITE_API_URL wrong |
| Missing table errors | Run the migrations listed above |

---

## Architecture Reminder

The app is two separate processes:
- **Frontend** (`apps/web`) — React/Vite, runs on port 5173
- **Backend** (`apps/server`) — Express, runs on port 4000

Both must be running for the chat to work. The frontend calls the backend at `VITE_API_URL`.
