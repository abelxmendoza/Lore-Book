# LoreBook agent guidance



This file is the checked-in rule layer for humans and coding agents working in
this repo. Treat local IDE “memories” (Cursor/Codex) as a helpful recall layer —
**not** as the only source for rules that must always apply.

## Always apply

- Founder privacy: follow `.cursor/rules/no-founder-pii.mdc`. Never commit founder
  emails, the founder UUID, or blocked personal lore strings in apps/ or scripts/.
- Prefer synthetic fixtures (`Vanguard Robotics`, `Marcus` / `Jamie`, `MemoVault`).
- Do not commit secrets (`.env`, tokens, service-role keys).
- Only create git commits / PRs / production deploys when the user explicitly asks.
- Prefer small, focused diffs; match existing style; no drive-by refactors.

## Memory philosophy (product)

LoreBook is a **life memory system**, not a chat-summary memory bolt-on.

| Concept                           | LoreBook name           | Where it lives                        |
| --------------------------------- | ----------------------- | ------------------------------------- |
| Durable recall into future turns  | Living Memory (use)     | Working Memory Assembler, canon facts |
| Propose durable facts from a turn | Living Memory (write)   | Ingestion → Memory Review Queue      |
| Ambient external → memory        | Life Chronicle          | Chat, journal, X intake, Life Log     |
| User governance                   | Memory Review / Privacy | Discovery + Privacy surfaces          |

Full mapping: [`docs/product/living-memory-and-life-chronicle.md`](docs/product/living-memory-and-life-chronicle.md).

### Product invariants

1. Provenance over vibes — claims cite evidence; do not invent biographical detail.
2. Review before canon for high-risk writes (MRQ is the trust choke point).
3. No screen-recording Chronicle — ambient intake is opt-in life sources only.
4. Working Memory is assembled per turn and discarded; it is not a second database.
5. User controls (`useLivingMemory`, `writeLivingMemory`, `ambientCapturePaused`)
   must be respected on chat and integration paths.

## Architecture pointers

- Core loop / modes: `docs/architecture/`
- Working Memory: `docs/working-memory-assembler.md`
- Continuity maturation: `docs/runtime/continuity-maturation-roadmap.md`
- LoreBook vs ChatGPT: `docs/lorebook-vs-chatgpt-v2.md`

## Deploy reality

- Frontend production: Vercel Git integration → `lorebookai.com`
- Backend production: Railway → `lore-book-production.up.railway.app`
- Smoke: `npm run smoke:health:prod`
- GitHub `deploy.yml` may skip Vercel CLI if secrets are unset; Git deploy still ships.

## Cursor Cloud specific instructions

This section captures non-obvious, durable setup/run caveats for this repo (Lorebook / Lorekeeper).
Standard commands live in `README.md`, `docs/guides/LOCAL_DEVELOPMENT.md`, and the per-app
`package.json` scripts — refer to those; only the gotchas are listed here.

### Services / layout

- Monorepo (plain npm, no workspaces). Three independent npm projects: root (`/`, Drizzle + migration
  tooling), `apps/server` (Express API, port **4000**), `apps/web` (React/Vite, port **5173**).
  `apps/mobile` (Expo) and `lorekeeper/*.py` are experimental/secondary.
- Run both: `npm run dev` (web + server). Or `npm run dev:server` / `npm run dev:web`.
- Core product needs: web + server + Supabase (Postgres/Auth/Storage) + OpenAI.

### Node version (important)

- Repo requires **Node 20** (`.nvmrc`). The default shell `node` is a v22 shim at `/exec-daemon/node`.
  Node 20 is installed via nvm and `~/.bashrc` prepends `~/.nvm/versions/node/v20.20.2/bin` to PATH,
  so interactive/login shells (incl. tmux `bash -l`) get Node 20 automatically. If a non-login shell
  shows v22, run `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`.

### Dependencies

- `apps/web` install **must** use `--legacy-peer-deps`. Root/server use plain `npm ci`.
  Root has a husky `prepare` script — install with `--ignore-scripts` (or `HUSKY=0`) at root.

### Local Supabase database (non-obvious — read before running the app)

Local dev uses the Supabase local stack (Docker). `supabase start` is on 54321 (API/kong) and
54322 (Postgres, `postgres:postgres`). Known gotchas discovered during setup:

1. **`supabase/migrations` do NOT replay cleanly from scratch.** There is a real ordering bug:
   `..._decision_memory_engine.sql` FK-references `perspectives`, which is created several migrations
   later. A fresh `supabase start`/`db reset` therefore aborts. Work around by starting Supabase with
   an empty migration set, then applying the root `migrations/*.sql` best-effort (continue on error):
   start `supabase` (optionally excluding heavy services: `-x studio,imgproxy,edge-runtime,realtime,logflare,vector,supavisor`),
   then `psql` each `migrations/*.sql` with `ON_ERROR_STOP=0` (two passes resolves most ordering deps →
   ~326 public tables). Skip `001_seed_dummy_data.sql` (bad UUIDs).
2. **`pgvector` extension name:** the installed extension is `vector` (not `pgvector`). Migration
   files were bulk-fixed to `CREATE EXTENSION IF NOT EXISTS vector` in PR #224 (2026-07-16).
3. **Grant privileges after loading schema.** Tables created via `psql` (as `postgres`) are not visible
   to Supabase roles. Run `GRANT ... ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;` + `ALTER DEFAULT PRIVILEGES ...`, then reload PostgREST
   (`NOTIFY pgrst, 'reload schema';` and/or `docker restart supabase_rest_<project_id>`), or every
   supabase-js call returns "permission denied" / stale-schema (`PGRST205`) errors.
4. **Signup fails ("Database error saving new user") until the `subscriptions` table exists.** The
   `20250115_subscriptions.sql` migration is buggy (`status ... default 'free'`, but `free` is not a
   valid `subscription_status` value) so the table never gets created, yet its `AFTER INSERT` trigger on
   `auth.users` does — so every signup errors. Create `public.subscriptions` (+ `subscription_usage`)
   manually with a valid default (e.g. `status default 'trial'`) and grant it to the supabase roles.

### Auth & AI (running without external keys)

- Auth uses real Supabase JWTs (`supabase.auth.getUser`). The web login is passwordless magic-link;
  local emails are captured by Inbucket/Mailpit (`http://localhost:54324`), or generate a link via the
  GoTrue admin API. `DISABLE_AUTH_FOR_DEV=true` bypasses auth entirely (uses a fixed dev user).
- No OpenAI key needed to exercise the pipeline: set `DEV_AI_FALLBACK=true`. The chat pipeline runs
  end-to-end (mode routing, entity detection, persistence) and only the final OpenAI call is replaced
  by a labelled `[DEV FALLBACK ...]` response. Entity *extraction/recall* need a real `OPENAI_API_KEY`.
- The `/demo` route is client-only synthetic data — its `/api/*` calls are unauthenticated (401s are
  expected there); use a real logged-in session to test the authenticated app.

### Env files

- Server reads root `.env`; web reads `apps/web/.env.local` (`VITE_*`). Both are gitignored.

### Testing gotcha (server)

- Do **not** run `npm run build` (tsc) in `apps/server` before running `vitest`. Because of a pre-existing
  `rootDir` misconfig, `tsc` emits stray `.js` files into `tests/fixtures/` (gitignored) that make vitest
  throw "Vitest cannot be imported in a CommonJS module". Run tests before building, or delete stray
  `apps/server/{src,tests}/**/*.js` afterward. Web tests are unaffected.
- Lint and `tsc --noEmit` have many pre-existing errors (a tsc baseline is tolerated); `apps/server`
  `npm run build` uses `tsc ... || true` by design.
