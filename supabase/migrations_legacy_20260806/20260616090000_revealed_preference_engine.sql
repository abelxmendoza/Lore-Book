-- Revealed Preference Engine (P2-A)
-- Discovers actual priorities/values/motivations from what a user repeatedly DOES,
-- not what they say. Fully deterministic (no LLM). Every signal is backed by
-- evidence rows pointing at the source episode (journal_entry / chat_message).

-- ── Signals: one aggregated row per (user, type, category) ─────────────────────
CREATE TABLE IF NOT EXISTS public.preference_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN (
                    'value','goal','fear','motivation','identity','habit','preference','interest','skill'
                  )),
  category_key    TEXT NOT NULL,                 -- normalized, e.g. 'family','fitness','lorebook'
  label           TEXT NOT NULL,                 -- display, e.g. 'Family'
  stated_count    INTEGER NOT NULL DEFAULT 0,    -- "I value/want X" evidence
  revealed_count  INTEGER NOT NULL DEFAULT 0,    -- behavioral evidence (did X)
  evidence_count  INTEGER NOT NULL DEFAULT 0,    -- stated + revealed
  confidence      REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  stated_share    REAL NOT NULL DEFAULT 0,       -- share of all stated signal
  revealed_share  REAL NOT NULL DEFAULT 0,       -- share of all revealed signal (time)
  alignment_score REAL,                          -- revealed_share - stated_share (-1..1)
  alignment_label TEXT,                          -- strongly_aligned | aligned | weakly_aligned | revealed_only | stated_only | emerging | declining
  recent_revealed INTEGER NOT NULL DEFAULT 0,    -- revealed evidence in recent window
  prior_revealed  INTEGER NOT NULL DEFAULT 0,    -- revealed evidence in prior window
  trend           REAL NOT NULL DEFAULT 0,       -- recent_rate - prior_rate
  first_seen_at   TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, category_key)
);

CREATE INDEX IF NOT EXISTS preference_signals_user_idx        ON public.preference_signals(user_id);
CREATE INDEX IF NOT EXISTS preference_signals_user_type_idx   ON public.preference_signals(user_id, type);
CREATE INDEX IF NOT EXISTS preference_signals_user_reveal_idx ON public.preference_signals(user_id, revealed_count DESC);
CREATE INDEX IF NOT EXISTS preference_signals_user_align_idx  ON public.preference_signals(user_id, alignment_label);

-- ── Evidence: one row per matched episode supporting a signal (provenance) ─────
CREATE TABLE IF NOT EXISTS public.preference_evidence (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id    UUID NOT NULL REFERENCES public.preference_signals(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,                    -- denormalized for fast filtering
  signal_type  TEXT NOT NULL CHECK (signal_type IN ('stated','revealed')),
  source       TEXT NOT NULL CHECK (source IN ('journal','chat')),
  source_id    UUID NOT NULL,                    -- journal_entries.id or chat_messages.id
  matched_term TEXT NOT NULL,                    -- what matched (audit)
  snippet      TEXT NOT NULL,                    -- excerpt around the match (capped)
  weight       REAL NOT NULL DEFAULT 1,
  occurred_at  TIMESTAMPTZ,                      -- when the episode happened
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- idempotent re-scan + honest counting: one episode supports a signal at most
  -- once per signal_type, so evidence_count == distinct supporting episodes.
  UNIQUE (user_id, signal_id, source, source_id, signal_type)
);

CREATE INDEX IF NOT EXISTS preference_evidence_signal_idx ON public.preference_evidence(signal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS preference_evidence_user_cat_idx ON public.preference_evidence(user_id, category_key);

-- ── RLS — users read their own; backend writes via service role (bypasses RLS) ─
ALTER TABLE public.preference_signals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS preference_signals_select ON public.preference_signals;
CREATE POLICY preference_signals_select ON public.preference_signals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS preference_evidence_select ON public.preference_evidence;
CREATE POLICY preference_evidence_select ON public.preference_evidence
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.preference_signals IS 'Revealed Preference Engine: aggregated stated-vs-revealed priority signals per user.';
COMMENT ON TABLE public.preference_evidence IS 'Revealed Preference Engine: per-episode provenance for every signal. No signal exists without evidence here.';
