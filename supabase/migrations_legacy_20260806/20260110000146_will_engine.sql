-- =====================================================
-- LORE-KEEPER WILL ENGINE
-- Purpose: Track agency moments where action != impulse
-- Captures moments of will, choice, and agency
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Will Events: Moments where action overrides impulse
CREATE TABLE IF NOT EXISTS will_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  source_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_component_id UUID REFERENCES memory_components(id) ON DELETE SET NULL,
  
  -- Core Will fields
  situation TEXT NOT NULL,
  inferred_impulse TEXT NOT NULL,
  observed_action TEXT NOT NULL,
  cost FLOAT CHECK (cost >= 0 AND cost <= 1),
  meaning TEXT,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1) DEFAULT 0.7,
  
  -- Context
  emotion_at_time TEXT[] DEFAULT '{}',
  identity_pressure TEXT,
  related_decision_id UUID REFERENCES decisions(id) ON DELETE SET NULL,
  
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_will_events_user ON will_events(user_id);
CREATE INDEX IF NOT EXISTS idx_will_events_timestamp ON will_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_will_events_source_entry ON will_events(source_entry_id);
CREATE INDEX IF NOT EXISTS idx_will_events_confidence ON will_events(user_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_will_events_created_at ON will_events(created_at DESC);

-- Enable Row Level Security
ALTER TABLE will_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY will_events_owner_select ON will_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY will_events_owner_insert ON will_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY will_events_owner_update ON will_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY will_events_owner_delete ON will_events
  FOR DELETE USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE will_events IS 'Tracks moments where action overrides impulse (agency/will events)';
COMMENT ON COLUMN will_events.situation IS 'The context or situation where will was exercised';
COMMENT ON COLUMN will_events.inferred_impulse IS 'What emotion/habit/identity would have suggested (automatic response)';
COMMENT ON COLUMN will_events.observed_action IS 'What actually happened (the choice made)';
COMMENT ON COLUMN will_events.cost IS 'Estimated cost of choosing action over impulse (0-1)';
COMMENT ON COLUMN will_events.meaning IS 'Reflection on why this choice mattered';
COMMENT ON COLUMN will_events.confidence IS 'Confidence that this was a will event (0-1)';
