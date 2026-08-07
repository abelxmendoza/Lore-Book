-- Contradiction Engine (P2-B)
-- Deterministically detects where a user's STATED identity and REVEALED behavior
-- diverge, derived from the Revealed Preference Engine's preference_signals.
-- No LLM produces contradictions — the engine proves them from evidence first.

CREATE TABLE IF NOT EXISTS public.contradiction_signals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN (
                       'STATED_VS_REVEALED','GOAL_VS_ACTION','IDENTITY_VS_BEHAVIOR','VALUE_CONFLICT','INTENTION_OUTCOME'
                     )),
  category_key       TEXT NOT NULL,
  label              TEXT NOT NULL,
  -- Panel grouping derived from the divergence direction/shape.
  section            TEXT NOT NULL CHECK (section IN ('tension','blind_spot','identity_conflict','value_conflict')),
  -- Snapshot references to the preference_signals rows that proved this (resolved
  -- by category_key at read time, so RPE rebuilds don't break the link).
  stated_signal_id   UUID,
  revealed_signal_id UUID,
  conflict_with_key  TEXT,                                  -- VALUE_CONFLICT: the competing category
  stated_count       INTEGER NOT NULL DEFAULT 0,
  revealed_count     INTEGER NOT NULL DEFAULT 0,
  alignment_delta    REAL NOT NULL DEFAULT 0,                -- stated_share - revealed_share (+say>do, -do>say)
  confidence         REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count     INTEGER NOT NULL DEFAULT 0,
  severity           TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  detail             TEXT NOT NULL,                          -- non-accusatory, evidence-framed explanation
  evidence           JSONB NOT NULL DEFAULT '[]'::jsonb,     -- sample supporting episodes (both sides)
  first_detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, category_key)
);

CREATE INDEX IF NOT EXISTS contradiction_signals_user_idx       ON public.contradiction_signals(user_id);
CREATE INDEX IF NOT EXISTS contradiction_signals_user_status_idx ON public.contradiction_signals(user_id, status);
CREATE INDEX IF NOT EXISTS contradiction_signals_user_section_idx ON public.contradiction_signals(user_id, section);
CREATE INDEX IF NOT EXISTS contradiction_signals_user_sev_idx    ON public.contradiction_signals(user_id, severity);
-- Epiphany-candidate query (Phase 6): high-confidence, high-evidence, open.
CREATE INDEX IF NOT EXISTS contradiction_signals_epiphany_idx
  ON public.contradiction_signals(user_id, confidence DESC, evidence_count DESC) WHERE status = 'open';

ALTER TABLE public.contradiction_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contradiction_signals_select ON public.contradiction_signals;
CREATE POLICY contradiction_signals_select ON public.contradiction_signals
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.contradiction_signals IS 'Contradiction Engine: deterministically-proven divergences between stated identity and revealed behavior. Each row references its preference_signals evidence.';
