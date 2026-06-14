-- Rich skill lore: evidence, pending suggestions, usage events

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

CREATE POLICY skill_suggestions_select ON public.skill_suggestions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY skill_suggestions_insert ON public.skill_suggestions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY skill_suggestions_update ON public.skill_suggestions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY skill_suggestions_delete ON public.skill_suggestions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY skill_evidence_select ON public.skill_evidence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY skill_evidence_insert ON public.skill_evidence FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY skill_usage_events_select ON public.skill_usage_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY skill_usage_events_insert ON public.skill_usage_events FOR INSERT WITH CHECK (auth.uid() = user_id);
