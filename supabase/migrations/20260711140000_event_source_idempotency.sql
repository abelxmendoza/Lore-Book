-- =====================================================
-- Event source-scoped uniqueness (replay protection)
-- =====================================================
-- Prevents the same message + extractor version from minting duplicate
-- logical events / child rows on job replay or multi-worker races.
-- Additive + idempotent. Does not rewrite existing rows' content.

-- ── resolved_events ──────────────────────────────────────────────────────────
ALTER TABLE public.resolved_events
  ADD COLUMN IF NOT EXISTS source_fingerprint text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid,
  ADD COLUMN IF NOT EXISTS extractor_version text DEFAULT 'v1';

CREATE UNIQUE INDEX IF NOT EXISTS resolved_events_user_source_fingerprint_uidx
  ON public.resolved_events (user_id, source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS resolved_events_source_message_idx
  ON public.resolved_events (user_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

COMMENT ON COLUMN public.resolved_events.source_fingerprint IS
  'Deterministic key: user|sourceMessageId|extractorVersion|artifactType|normalizedSubject — replay-safe.';

-- ── event_records (mode-router factual layer) ────────────────────────────────
-- One factual event_record per source chat message (chat extraction path).
CREATE UNIQUE INDEX IF NOT EXISTS event_records_user_source_message_uidx
  ON public.event_records (user_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

-- ── Child meaning layers: one row per (event, type/content key, source message)
CREATE UNIQUE INDEX IF NOT EXISTS narrative_accounts_source_uidx
  ON public.narrative_accounts (user_id, event_record_id, account_type, source_message_id)
  WHERE source_message_id IS NOT NULL AND event_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_emotions_source_uidx
  ON public.event_emotions (user_id, event_record_id, emotion, source_message_id)
  WHERE source_message_id IS NOT NULL AND event_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_cognitions_source_uidx
  ON public.event_cognitions (user_id, event_record_id, cognition_type, source_message_id, md5(content))
  WHERE source_message_id IS NOT NULL AND event_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_identity_impacts_source_uidx
  ON public.event_identity_impacts (user_id, event_record_id, impact_type, source_message_id)
  WHERE source_message_id IS NOT NULL AND event_record_id IS NOT NULL;
