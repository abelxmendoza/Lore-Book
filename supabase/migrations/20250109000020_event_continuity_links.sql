-- =====================================================
-- EVENT CONTINUITY LINKS
-- Purpose: Store detected continuity relationships between events
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_continuity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  past_event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  continuity_type TEXT NOT NULL CHECK (continuity_type IN (
    'CONTINUATION',
    'CONTRAST',
    'RETURN',
    'CLOSURE',
    'ESCALATION',
    'DE_ESCALATION'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(current_event_id, past_event_id, continuity_type)
);

CREATE INDEX IF NOT EXISTS idx_event_continuity_links_current ON public.event_continuity_links(current_event_id);
CREATE INDEX IF NOT EXISTS idx_event_continuity_links_past ON public.event_continuity_links(past_event_id);
CREATE INDEX IF NOT EXISTS idx_event_continuity_links_user ON public.event_continuity_links(user_id);
CREATE INDEX IF NOT EXISTS idx_event_continuity_links_type ON public.event_continuity_links(continuity_type);

ALTER TABLE public.event_continuity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own continuity links"
  ON public.event_continuity_links
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own continuity links"
  ON public.event_continuity_links
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own continuity links"
  ON public.event_continuity_links
  FOR DELETE
  USING (user_id = auth.uid());

