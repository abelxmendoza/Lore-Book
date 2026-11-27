-- Hivemind: cross-agent workspace inside LoreBook.
--
-- Hivemind keeps every AI coding agent a user works with (Claude Code, Codex,
-- Cursor, Antigravity, ...) on the same page: where each project was left off,
-- shared agent memories, and a ledger of shipped milestones. It is a LoreBook
-- feature (same account, same MCP server), gated per account by
-- `canUseHivemind` in apps/server/src/lib/hivemindAccess.ts.
--
-- All rows are user-owned. The server writes with the service role and always
-- filters by user_id; RLS below protects direct client access.

BEGIN;

CREATE TABLE IF NOT EXISTS public.hivemind_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project text NOT NULL CHECK (char_length(project) BETWEEN 1 AND 120),
  agent text NOT NULL CHECK (char_length(agent) BETWEEN 1 AND 60),
  where_left_off text NOT NULL CHECK (char_length(where_left_off) BETWEEN 1 AND 4000),
  next_steps text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project)
);

CREATE INDEX IF NOT EXISTS hivemind_checkpoints_user_updated_idx
  ON public.hivemind_checkpoints (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.hivemind_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 120),
  project text CHECK (project IS NULL OR char_length(project) BETWEEN 1 AND 120),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  agent text CHECK (agent IS NULL OR char_length(agent) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS hivemind_memories_user_updated_idx
  ON public.hivemind_memories (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS hivemind_memories_user_project_idx
  ON public.hivemind_memories (user_id, project);

CREATE TABLE IF NOT EXISTS public.hivemind_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track text NOT NULL CHECK (char_length(track) BETWEEN 1 AND 120),
  project text NOT NULL CHECK (char_length(project) BETWEEN 1 AND 120),
  highlight text NOT NULL CHECK (char_length(highlight) BETWEEN 1 AND 2000),
  agent text CHECK (agent IS NULL OR char_length(agent) BETWEEN 1 AND 60),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hivemind_milestones_user_occurred_idx
  ON public.hivemind_milestones (user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.set_hivemind_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hivemind_checkpoints_updated_at ON public.hivemind_checkpoints;
CREATE TRIGGER hivemind_checkpoints_updated_at
  BEFORE UPDATE ON public.hivemind_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_hivemind_updated_at();

DROP TRIGGER IF EXISTS hivemind_memories_updated_at ON public.hivemind_memories;
CREATE TRIGGER hivemind_memories_updated_at
  BEFORE UPDATE ON public.hivemind_memories
  FOR EACH ROW EXECUTE FUNCTION public.set_hivemind_updated_at();

ALTER TABLE public.hivemind_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hivemind_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hivemind_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own hivemind checkpoints"
  ON public.hivemind_checkpoints FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users manage own hivemind memories"
  ON public.hivemind_memories FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users manage own hivemind milestones"
  ON public.hivemind_milestones FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
