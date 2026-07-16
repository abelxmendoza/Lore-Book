-- Photo-Skill-Location-Group Links
-- Automatically link photos to skills, locations, and groups based on AI analysis

CREATE TABLE IF NOT EXISTS public.photo_skill_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  detection_reason TEXT,
  auto_detected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journal_entry_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.photo_location_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  detection_reason TEXT,
  auto_detected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journal_entry_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.photo_group_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  organization_id UUID, -- References entity_resolution or organizations table
  organization_name TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  detection_reason TEXT,
  auto_detected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journal_entry_id, organization_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_photo_skill_links_user_skill ON public.photo_skill_links(user_id, skill_id);
CREATE INDEX IF NOT EXISTS idx_photo_skill_links_entry ON public.photo_skill_links(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_photo_location_links_user_location ON public.photo_location_links(user_id, location_id);
CREATE INDEX IF NOT EXISTS idx_photo_location_links_entry ON public.photo_location_links(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_photo_group_links_user ON public.photo_group_links(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_group_links_entry ON public.photo_group_links(journal_entry_id);

-- RLS Policies
ALTER TABLE public.photo_skill_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_location_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_group_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own photo skill links"
  ON public.photo_skill_links
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own photo skill links"
  ON public.photo_skill_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own photo skill links"
  ON public.photo_skill_links
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own photo location links"
  ON public.photo_location_links
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own photo location links"
  ON public.photo_location_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own photo location links"
  ON public.photo_location_links
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own photo group links"
  ON public.photo_group_links
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own photo group links"
  ON public.photo_group_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own photo group links"
  ON public.photo_group_links
  FOR DELETE
  USING (auth.uid() = user_id);

