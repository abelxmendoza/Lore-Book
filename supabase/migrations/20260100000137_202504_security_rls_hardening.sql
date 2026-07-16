-- Enforce strict RLS for user-owned tables
-- Postgres has no CREATE POLICY IF NOT EXISTS; use DROP + CREATE.

ALTER TABLE IF EXISTS journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_memory_bridges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS timeline_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    DROP POLICY IF EXISTS journal_entries_owner_select ON journal_entries;
    DROP POLICY IF EXISTS journal_entries_owner_insert ON journal_entries;
    DROP POLICY IF EXISTS journal_entries_owner_update ON journal_entries;
    CREATE POLICY journal_entries_owner_select ON journal_entries
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY journal_entries_owner_insert ON journal_entries
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY journal_entries_owner_update ON journal_entries
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP POLICY IF EXISTS tasks_owner_select ON tasks;
    DROP POLICY IF EXISTS tasks_owner_insert ON tasks;
    DROP POLICY IF EXISTS tasks_owner_update ON tasks;
    CREATE POLICY tasks_owner_select ON tasks
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY tasks_owner_insert ON tasks
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY tasks_owner_update ON tasks
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF to_regclass('public.characters') IS NOT NULL THEN
    DROP POLICY IF EXISTS characters_owner_select ON characters;
    DROP POLICY IF EXISTS characters_owner_insert ON characters;
    DROP POLICY IF EXISTS characters_owner_update ON characters;
    CREATE POLICY characters_owner_select ON characters
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY characters_owner_insert ON characters
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY characters_owner_update ON characters
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF to_regclass('public.relationships') IS NOT NULL THEN
    DROP POLICY IF EXISTS relationships_owner_select ON relationships;
    DROP POLICY IF EXISTS relationships_owner_insert ON relationships;
    DROP POLICY IF EXISTS relationships_owner_update ON relationships;
    CREATE POLICY relationships_owner_select ON relationships
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY relationships_owner_insert ON relationships
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY relationships_owner_update ON relationships
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF to_regclass('public.task_memory_bridges') IS NOT NULL THEN
    DROP POLICY IF EXISTS task_memory_bridges_owner_select ON task_memory_bridges;
    DROP POLICY IF EXISTS task_memory_bridges_owner_insert ON task_memory_bridges;
    DROP POLICY IF EXISTS task_memory_bridges_owner_update ON task_memory_bridges;
    CREATE POLICY task_memory_bridges_owner_select ON task_memory_bridges
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY task_memory_bridges_owner_insert ON task_memory_bridges
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY task_memory_bridges_owner_update ON task_memory_bridges
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF to_regclass('public.timeline_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS timeline_events_owner_select ON timeline_events;
    DROP POLICY IF EXISTS timeline_events_owner_insert ON timeline_events;
    DROP POLICY IF EXISTS timeline_events_owner_update ON timeline_events;
    CREATE POLICY timeline_events_owner_select ON timeline_events
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY timeline_events_owner_insert ON timeline_events
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY timeline_events_owner_update ON timeline_events
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
