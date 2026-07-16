-- =====================================================
-- EVENT CONFIDENCE SNAPSHOTS
-- Purpose: Track how event confidence evolves over time
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_confidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  reason TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_event_confidence_snapshots_event ON public.event_confidence_snapshots(event_id);
CREATE INDEX IF NOT EXISTS idx_event_confidence_snapshots_user ON public.event_confidence_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_event_confidence_snapshots_recorded ON public.event_confidence_snapshots(recorded_at DESC);

ALTER TABLE public.event_confidence_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own confidence snapshots"
  ON public.event_confidence_snapshots
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own confidence snapshots"
  ON public.event_confidence_snapshots
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

