-- =====================================================
-- LORE-KEEPER CONTINUITY PROFILES
-- Purpose: Store computed "soul" profiles - persistent patterns
-- across time and change
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Continuity Profiles: Computed soul profiles
CREATE TABLE IF NOT EXISTS continuity_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_continuity_profiles_user ON continuity_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_continuity_profiles_computed ON continuity_profiles(user_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_profiles_version ON continuity_profiles(user_id, version DESC);

-- Enable Row Level Security
ALTER TABLE continuity_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY continuity_profiles_owner_select ON continuity_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY continuity_profiles_owner_insert ON continuity_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE continuity_profiles IS 'Stores computed continuity profiles (soul patterns)';
COMMENT ON COLUMN continuity_profiles.profile_data IS 'JSONB structure containing persistent values, recurring themes, identity stability, agency metrics, and drift flags';
COMMENT ON COLUMN continuity_profiles.version IS 'Version number for tracking profile evolution';
COMMENT ON COLUMN continuity_profiles.computed_at IS 'When this profile was computed';
