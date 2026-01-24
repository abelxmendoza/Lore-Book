-- Identity Integration Migration
-- Adds tables for linking identity signals to memory components and tracking identity timeline events

-- Identity Signal to Memory Component Links (bidirectional)
CREATE TABLE IF NOT EXISTS public.identity_signal_memory_component_links (
  signal_id UUID NOT NULL REFERENCES identity_signals(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES memory_components(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (signal_id, component_id)
);

-- Identity Timeline Events
-- Tracks identity changes as timeline events
CREATE TABLE IF NOT EXISTS public.identity_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES identity_core_profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'dimension_added',
    'dimension_removed',
    'dimension_score_changed',
    'conflict_detected',
    'conflict_resolved',
    'stability_shift',
    'signal_extracted',
    'profile_updated'
  )),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_identity_signal_component_links_signal ON public.identity_signal_memory_component_links(signal_id);
CREATE INDEX IF NOT EXISTS idx_identity_signal_component_links_component ON public.identity_signal_memory_component_links(component_id);
CREATE INDEX IF NOT EXISTS idx_identity_timeline_events_user_time ON public.identity_timeline_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_identity_timeline_events_profile ON public.identity_timeline_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_identity_timeline_events_type ON public.identity_timeline_events(user_id, event_type);

-- GIN index for metadata
CREATE INDEX IF NOT EXISTS idx_identity_timeline_events_metadata_gin ON public.identity_timeline_events USING GIN(metadata);

-- RLS
ALTER TABLE public.identity_signal_memory_component_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own identity signal component links"
  ON public.identity_signal_memory_component_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM identity_signals
      WHERE identity_signals.id = identity_signal_memory_component_links.signal_id
      AND identity_signals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own identity signal component links"
  ON public.identity_signal_memory_component_links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM identity_signals
      WHERE identity_signals.id = identity_signal_memory_component_links.signal_id
      AND identity_signals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own identity timeline events"
  ON public.identity_timeline_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own identity timeline events"
  ON public.identity_timeline_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.identity_signal_memory_component_links IS 'Bidirectional links between identity signals and memory components';
COMMENT ON TABLE public.identity_timeline_events IS 'Tracks identity changes as timeline events for visualization and analysis';
