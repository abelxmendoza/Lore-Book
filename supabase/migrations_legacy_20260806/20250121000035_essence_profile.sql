-- Essence Profile Table
-- Stores dynamic psychological and identity insights extracted from user conversations and entries

CREATE TABLE IF NOT EXISTS public.essence_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS essence_profiles_user_id_idx ON public.essence_profiles(user_id);
CREATE INDEX IF NOT EXISTS essence_profiles_updated_at_idx ON public.essence_profiles(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.essence_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY essence_profiles_owner_select ON public.essence_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY essence_profiles_owner_insert ON public.essence_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY essence_profiles_owner_update ON public.essence_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_essence_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER essence_profiles_updated_at
  BEFORE UPDATE ON public.essence_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_essence_profiles_updated_at();

COMMENT ON TABLE public.essence_profiles IS 'Stores dynamic psychological and identity insights extracted from user conversations';
COMMENT ON COLUMN public.essence_profiles.profile_data IS 'JSONB structure containing hopes, dreams, fears, strengths, weaknesses, skills, values, traits, and relationship patterns';
COMMENT ON COLUMN public.essence_profiles.version IS 'Version number for tracking profile evolution';


