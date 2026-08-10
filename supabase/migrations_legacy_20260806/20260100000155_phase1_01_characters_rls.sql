-- Phase 1 · Step 1: Row-Level Security for characters, character_relationships, character_memories
-- Run AFTER 000_setup_all_tables.sql
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE / DO blocks

-- ─── characters ──────────────────────────────────────────────────────────────

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'users_read_own_characters'
  ) THEN
    CREATE POLICY users_read_own_characters ON characters
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'users_insert_own_characters'
  ) THEN
    CREATE POLICY users_insert_own_characters ON characters
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'users_update_own_characters'
  ) THEN
    CREATE POLICY users_update_own_characters ON characters
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'users_delete_own_characters'
  ) THEN
    CREATE POLICY users_delete_own_characters ON characters
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── character_relationships ─────────────────────────────────────────────────

ALTER TABLE character_relationships ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'character_relationships' AND policyname = 'users_manage_own_character_relationships'
  ) THEN
    CREATE POLICY users_manage_own_character_relationships ON character_relationships
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── character_memories ──────────────────────────────────────────────────────

ALTER TABLE character_memories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'character_memories' AND policyname = 'users_manage_own_character_memories'
  ) THEN
    CREATE POLICY users_manage_own_character_memories ON character_memories
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
