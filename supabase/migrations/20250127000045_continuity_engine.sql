-- Continuity Engine Schema
-- Detects contradictions, abandoned goals, arc shifts, identity drift, emotional transitions, thematic changes

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Continuity Events Table
-- Stores all detected continuity signals
CREATE TABLE IF NOT EXISTS public.continuity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('contradiction', 'abandoned_goal', 'arc_shift', 'identity_drift', 'emotional_transition', 'thematic_drift', 'goal_progress', 'goal_reappearance', 'behavioral_loop')),
  description TEXT NOT NULL,
  source_components UUID[] DEFAULT '{}',
  severity INT DEFAULT 1 CHECK (severity >= 1 AND severity <= 10),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_continuity_events_user_type ON public.continuity_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_continuity_events_user_created ON public.continuity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_events_type ON public.continuity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_continuity_events_severity ON public.continuity_events(user_id, severity DESC) WHERE severity >= 5;
CREATE INDEX IF NOT EXISTS idx_continuity_events_components_gin ON public.continuity_events USING GIN(source_components);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.continuity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY continuity_events_owner_select ON public.continuity_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY continuity_events_owner_insert ON public.continuity_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY continuity_events_owner_update ON public.continuity_events
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY continuity_events_owner_delete ON public.continuity_events
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.continuity_events IS 'Stores detected continuity signals: contradictions, abandoned goals, arc shifts, identity drift, emotional transitions, thematic changes';
COMMENT ON COLUMN public.continuity_events.event_type IS 'Type of continuity event: contradiction, abandoned_goal, arc_shift, identity_drift, emotional_transition, thematic_drift, goal_progress, goal_reappearance, behavioral_loop';
COMMENT ON COLUMN public.continuity_events.source_components IS 'Array of memory component IDs that contributed to this event';
COMMENT ON COLUMN public.continuity_events.severity IS 'Severity score (1-10) indicating importance of the event';

