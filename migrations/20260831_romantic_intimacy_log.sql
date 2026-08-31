-- =====================================================
-- ROMANTIC INTIMACY LOG
-- Purpose: Manual, per-relationship log of intimacy occurrences (date/time
-- only) so a user can see frequency over time. Deliberately minimal —
-- no auto-detection, no categorization, no notes. Nothing is ever written
-- here except through an explicit user action in the relationship modal.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.romantic_intimacy_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_romantic_intimacy_log_relationship
  ON public.romantic_intimacy_log(relationship_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_romantic_intimacy_log_user
  ON public.romantic_intimacy_log(user_id);

ALTER TABLE public.romantic_intimacy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intimacy log entries"
  ON public.romantic_intimacy_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own intimacy log entries"
  ON public.romantic_intimacy_log FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own intimacy log entries"
  ON public.romantic_intimacy_log FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own intimacy log entries"
  ON public.romantic_intimacy_log FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.romantic_intimacy_log IS
  'Manual, private, per-relationship log of intimacy occurrences (date/time only). Never auto-populated, never included in demo/mock data or exports.';
