CREATE TABLE IF NOT EXISTS shadow_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shadow_archetypes JSONB,      -- { 'saboteur': 0.88, 'inner_critic': 0.71, ... }
  dominant_shadow TEXT,         -- e.g. "Saboteur"
  shadow_loops JSONB,           -- recurring shadow loops
  shadow_triggers JSONB,        -- emotional, social, internal triggers
  conflict_map JSONB,           -- identity vs shadow conflicts
  projection JSONB,             -- predicted shadow trajectory
  summary TEXT,                 -- narrative summary
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shadow_profiles_user_id ON shadow_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_profiles_updated_at ON shadow_profiles(updated_at);

ALTER TABLE shadow_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shadow_profiles_self" 
  ON shadow_profiles FOR ALL 
  USING (auth.uid() = user_id);

