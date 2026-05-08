# Local development: required migrations

If you see errors like:

- `Could not find the table 'public.chat_sessions'`
- `Could not find the table 'public.chat_messages'`
- `Could not find the table 'public.conversation_sessions'`
- `Could not find the table 'public.characters'`

the database is missing tables. Run the migrations that define them.

## Migrations needed for chat

| Table | Migration file |
|-------|----------------|
| `chat_sessions`, `chat_messages` | `migrations/20250102_conversational_orchestration.sql` |
| `conversation_sessions` | `migrations/20250125_memory_engine.sql` |

## Migrations needed for characters and related features

| Table | Migration file |
|-------|----------------|
| `characters` | `migrations/000_setup_all_tables.sql` or a later migration that creates it |
| `people_places` | Usually in `000_setup_all_tables.sql` or an early migration |

## How to run

1. **Supabase (recommended)**  
   If using Supabase, run the SQL in the Dashboard SQL editor, or use the Supabase CLI:

   ```bash
   supabase db push
   # or, for a single file:
   psql "$DATABASE_URL" -f migrations/20250102_conversational_orchestration.sql
   ```

2. **Direct Postgres**  
   With `DATABASE_URL` or `PG connection string` in `.env`:

   ```bash
   psql "$DATABASE_URL" -f migrations/20250102_conversational_orchestration.sql
   psql "$DATABASE_URL" -f migrations/20250125_memory_engine.sql
   ```

3. **Run-all script**  
   `scripts/run-all-migrations.sh` runs a fixed list; it may not include every migration.  
   If chat/characters tables are still missing, run the files above by hand.

## Dependencies

- `20250102_conversational_orchestration.sql` expects `auth.users` (Supabase Auth).
- `20250125_memory_engine.sql` creates `conversation_sessions` and related structures.

Run `20250102` before `20250125` if your setup requires it; otherwise order may not matter for these two.
