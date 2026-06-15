-- User-defined chronology order overrides (visual reorder in Timeline UI).
-- Teaches the system preferred sequencing without replacing inferred dates.

CREATE TABLE IF NOT EXISTS public.user_chronology_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'life_arc')),
  scope_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  item_kind TEXT NOT NULL CHECK (item_kind IN ('moment', 'event')),
  item_id UUID NOT NULL,
  sort_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scope_type, scope_id, item_kind, item_id)
);

CREATE INDEX IF NOT EXISTS user_chronology_order_scope_idx
  ON public.user_chronology_order (user_id, scope_type, scope_id, sort_index);

-- Audit trail when users fix order (training signal)
CREATE TABLE IF NOT EXISTS public.chronology_order_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  item_kind TEXT NOT NULL,
  item_id UUID NOT NULL,
  previous_sort_time TIMESTAMPTZ,
  new_sort_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chronology_order_corrections_user_idx
  ON public.chronology_order_corrections (user_id, created_at DESC);

ALTER TABLE public.user_chronology_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chronology_order_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_chronology_order_select ON public.user_chronology_order
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_chronology_order_insert ON public.user_chronology_order
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_chronology_order_update ON public.user_chronology_order
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY user_chronology_order_delete ON public.user_chronology_order
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY chronology_order_corrections_insert ON public.chronology_order_corrections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY chronology_order_corrections_select ON public.chronology_order_corrections
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_chronology_order IS 'User drag-reorder overrides for stitched timeline views';
COMMENT ON TABLE public.chronology_order_corrections IS 'Log of user chronology corrections for training';
