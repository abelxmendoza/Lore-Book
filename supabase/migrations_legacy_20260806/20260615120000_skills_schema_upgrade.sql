-- Upgrade legacy skills table (name/category) to full gamification + lore schema.
-- Safe to re-run: uses IF NOT EXISTS / conditional renames.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'skills' AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'skills' AND column_name = 'skill_name'
  ) THEN
    ALTER TABLE public.skills RENAME COLUMN name TO skill_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'skills' AND column_name = 'category'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'skills' AND column_name = 'skill_category'
  ) THEN
    ALTER TABLE public.skills RENAME COLUMN category TO skill_category;
  END IF;
END $$;

ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS skill_name TEXT;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS skill_category TEXT;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS current_level INTEGER DEFAULT 1;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS xp_to_next_level INTEGER DEFAULT 100;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS first_mentioned_at TIMESTAMPTZ;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS last_practiced_at TIMESTAMPTZ;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS practice_count INTEGER DEFAULT 0;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) DEFAULT 0.5;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

UPDATE public.skills
SET
  first_mentioned_at = COALESCE(first_mentioned_at, created_at, NOW()),
  skill_category = COALESCE(skill_category, 'other'),
  current_level = COALESCE(current_level, 1),
  total_xp = COALESCE(total_xp, 0),
  xp_to_next_level = COALESCE(xp_to_next_level, 100),
  practice_count = COALESCE(practice_count, 0),
  auto_detected = COALESCE(auto_detected, FALSE),
  confidence_score = COALESCE(confidence_score, 0.5),
  is_active = COALESCE(is_active, TRUE)
WHERE first_mentioned_at IS NULL
   OR skill_category IS NULL
   OR current_level IS NULL
   OR total_xp IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'skills_user_id_skill_name_key'
  ) THEN
    ALTER TABLE public.skills
      ADD CONSTRAINT skills_user_id_skill_name_key UNIQUE (user_id, skill_name);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS skills_user_id_idx ON public.skills(user_id);
CREATE INDEX IF NOT EXISTS skills_category_idx ON public.skills(skill_category);
CREATE INDEX IF NOT EXISTS skills_active_idx ON public.skills(user_id, is_active) WHERE is_active = TRUE;

-- Lore tables (pending suggestions, evidence, usage)
CREATE TABLE IF NOT EXISTS public.skill_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  skill_category TEXT NOT NULL DEFAULT 'other',
  skill_type TEXT NOT NULL DEFAULT 'professional',
  monetization TEXT NOT NULL DEFAULT 'unpaid',
  proficiency INT NOT NULL DEFAULT 50 CHECK (proficiency >= 1 AND proficiency <= 100),
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  enjoyment INT NOT NULL DEFAULT 50 CHECK (enjoyment >= 1 AND enjoyment <= 100),
  usage_frequency TEXT NOT NULL DEFAULT 'rarely',
  trajectory TEXT NOT NULL DEFAULT 'unknown',
  description TEXT,
  origin_story TEXT,
  first_learned_context TEXT,
  related_jobs JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, skill_name)
);

CREATE TABLE IF NOT EXISTS public.skill_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES public.skills(id) ON DELETE CASCADE,
  suggestion_id UUID REFERENCES public.skill_suggestions(id) ON DELETE CASCADE,
  evidence_text TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'chat',
  source_id TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.skill_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context TEXT,
  source_message_id TEXT,
  enjoyment INT CHECK (enjoyment IS NULL OR (enjoyment >= 1 AND enjoyment <= 100))
);

CREATE INDEX IF NOT EXISTS idx_skill_suggestions_user_status
  ON public.skill_suggestions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_skill_evidence_skill
  ON public.skill_evidence(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_events_skill
  ON public.skill_usage_events(skill_id, used_at DESC);

ALTER TABLE public.skill_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_usage_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_suggestions_select') THEN
    CREATE POLICY skill_suggestions_select ON public.skill_suggestions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_suggestions_insert') THEN
    CREATE POLICY skill_suggestions_insert ON public.skill_suggestions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_suggestions_update') THEN
    CREATE POLICY skill_suggestions_update ON public.skill_suggestions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_suggestions_delete') THEN
    CREATE POLICY skill_suggestions_delete ON public.skill_suggestions FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_evidence_select') THEN
    CREATE POLICY skill_evidence_select ON public.skill_evidence FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_evidence_insert') THEN
    CREATE POLICY skill_evidence_insert ON public.skill_evidence FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_usage_events_select') THEN
    CREATE POLICY skill_usage_events_select ON public.skill_usage_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skill_usage_events_insert') THEN
    CREATE POLICY skill_usage_events_insert ON public.skill_usage_events FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
