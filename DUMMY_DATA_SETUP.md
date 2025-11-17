# Dummy Data Setup Guide

This guide explains how to set up comprehensive dummy data for Lore Keeper development.

## Quick Start

### Option 1: Using SQL Scripts (Recommended for Supabase)

1. **Ensure Supabase is running:**
   ```bash
   supabase start
   ```

2. **Get your database URL:**
   ```bash
   supabase status
   # Copy the "DB URL" value
   ```

3. **Run the setup script:**
   ```bash
   ./scripts/setup-dummy-data.sh
   ```

   Or manually:
   ```bash
   psql "your-db-url" -f migrations/000_setup_all_tables.sql
   psql "your-db-url" -f migrations/001_seed_dummy_data.sql
   ```

### Option 2: Using TypeScript Script

```bash
cd apps/server
pnpm tsx ../scripts/populate-dummy-data-psql.ts
```

### Option 3: Using the API Endpoint

1. Start the server:
   ```bash
   pnpm dev:server
   ```

2. Use the populate endpoint (requires authentication):
   ```bash
   curl -X POST http://localhost:4000/api/dev/populate-dummy-data \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer dev-token"
   ```

## What Gets Created

### Tables Created
- `journal_entries` - Journal entries with tags, mood, summaries
- `chapters` - Life chapters/periods
- `characters` - People and places
- `character_relationships` - Relationships between characters
- `character_memories` - Links characters to journal entries
- `tasks` - Task management
- `task_events` - Task event history
- `daily_summaries` - Daily summaries
- `memoir_outlines` - Memoir structure
- `original_documents` - Source documents
- `people_places` - Legacy entity tracking

### Dummy Data Includes

#### Chapters (3)
1. **The Awakening: Discovering Purpose** (2023-01-01 to 2024-05-30)
2. **Building Foundations: Growth & Learning** (2024-06-01 to 2024-11-30)
3. **Current Chapter: Living Intentionally** (2024-12-01 onwards)

#### Characters (10)
- **Sarah Chen** - Best Friend (ally)
- **Marcus Johnson** - Mentor & Coach (mentor)
- **Alex Rivera** - Creative Collaborator (collaborator)
- **Jordan Kim** - Sibling (family)
- **Dr. Maya Patel** - Life Coach (mentor)
- **The Coffee Shop** - Workspace (place)
- **Central Park** - Reflection Space (place)
- **Emma Thompson** - Friend (ally)
- **River Brooks** - Friend (ally)
- **The Library** - Learning Space (place)

#### Journal Entries (10+)
- Recent entries from the last 2 weeks
- Various moods: excited, thoughtful, accomplished, reflective, peaceful
- Tags: friendship, creativity, collaboration, growth, etc.
- Linked to chapters and characters

#### Tasks (5)
- Creative projects
- Social activities
- Learning goals
- Various priorities and due dates

#### Relationships
- Character-to-character relationships
- Character memories linked to journal entries
- Closeness scores and relationship types

## Development User ID

The dummy data is created for user ID: `dev-user-id`

This matches the development authentication middleware, so you can use the app immediately without setting up real authentication.

## Verifying Setup

### Check Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

### Check Data Counts
```sql
SELECT 
  (SELECT COUNT(*) FROM chapters WHERE user_id = 'dev-user-id') as chapters,
  (SELECT COUNT(*) FROM characters WHERE user_id = 'dev-user-id') as characters,
  (SELECT COUNT(*) FROM journal_entries WHERE user_id = 'dev-user-id') as entries,
  (SELECT COUNT(*) FROM tasks WHERE user_id = 'dev-user-id') as tasks;
```

### View Sample Data
```sql
-- View chapters
SELECT id, title, start_date, end_date FROM chapters WHERE user_id = 'dev-user-id';

-- View characters
SELECT name, role, archetype FROM characters WHERE user_id = 'dev-user-id';

-- View recent entries
SELECT date, summary, mood, tags FROM journal_entries 
WHERE user_id = 'dev-user-id' 
ORDER BY date DESC 
LIMIT 5;
```

## Adding More Data

### Via API
Use the `/api/dev/populate-dummy-data` endpoint which creates even more comprehensive data.

### Via SQL
Edit `migrations/001_seed_dummy_data.sql` and add more INSERT statements.

### Via TypeScript
Edit `scripts/populate-dummy-data-psql.ts` and add more data objects.

## Troubleshooting

### Tables Don't Exist
Run the table creation script first:
```bash
psql "your-db-url" -f migrations/000_setup_all_tables.sql
```

### Foreign Key Errors
Make sure tables are created in order (chapters before entries, characters before relationships).

### Duplicate Key Errors
The seed script uses `ON CONFLICT DO NOTHING`, so re-running is safe. To reset:
```sql
DELETE FROM character_memories WHERE user_id = 'dev-user-id';
DELETE FROM character_relationships WHERE user_id = 'dev-user-id';
DELETE FROM journal_entries WHERE user_id = 'dev-user-id';
DELETE FROM tasks WHERE user_id = 'dev-user-id';
DELETE FROM chapters WHERE user_id = 'dev-user-id';
DELETE FROM characters WHERE user_id = 'dev-user-id';
```

## Next Steps

1. Start the server: `pnpm dev:server`
2. Open the app: `http://localhost:5173`
3. Navigate to Characters, Timeline, or Chat
4. You should see all the dummy data populated!

