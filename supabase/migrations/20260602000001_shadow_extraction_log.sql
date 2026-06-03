-- =====================================================
-- SHADOW EXTRACTION LOG
-- Purpose: Stores side-by-side comparison of merged extractor output
--          vs. existing pipeline output for Phase 0 shadow validation.
--          No user-visible data depends on this table.
--          Safe to truncate or drop after Phase 2 rollout completes.
-- =====================================================

CREATE TABLE IF NOT EXISTS shadow_extraction_log (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id                  uuid NOT NULL,
  user_id                     uuid NOT NULL,

  -- Merged extractor output (Group A)
  merged_extraction           jsonb,
  merged_error                text,
  merged_token_count          integer NOT NULL DEFAULT 0,
  merged_call_count           integer NOT NULL DEFAULT 1,
  merged_runtime_ms           integer NOT NULL DEFAULT 0,

  -- Baseline signals captured from existing pipeline run
  -- (populated by the shadow orchestrator reading pipeline outputs)
  baseline_entities           jsonb  NOT NULL DEFAULT '[]',
  baseline_relationships      jsonb  NOT NULL DEFAULT '[]',
  baseline_interests          jsonb  NOT NULL DEFAULT '[]',
  baseline_romantic_signals   jsonb  NOT NULL DEFAULT '[]',
  baseline_token_count_est    integer NOT NULL DEFAULT 0,
  baseline_call_count_est     integer NOT NULL DEFAULT 0,

  -- Computed comparison metrics
  entity_recall               numeric(4,3),
  entity_precision            numeric(4,3),
  relationship_recall         numeric(4,3),
  relationship_precision      numeric(4,3),
  romantic_signal_recall      numeric(4,3),
  romantic_signal_precision   numeric(4,3),
  interest_recall             numeric(4,3),
  token_ratio                 numeric(6,4),
  call_ratio                  numeric(6,4),

  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by user (nightly comparison jobs)
CREATE INDEX IF NOT EXISTS idx_shadow_extraction_user_created
  ON shadow_extraction_log (user_id, created_at DESC);

-- Index for querying by message (dedup check)
CREATE INDEX IF NOT EXISTS idx_shadow_extraction_message
  ON shadow_extraction_log (message_id);

-- Partial index: only rows with successful merged extractions (for metric queries)
CREATE INDEX IF NOT EXISTS idx_shadow_extraction_success
  ON shadow_extraction_log (created_at DESC)
  WHERE merged_extraction IS NOT NULL;

-- Auto-delete rows older than 60 days — this is diagnostic data, not user data
-- Run via pg_cron or application-level cleanup; no FK constraints to worry about.
COMMENT ON TABLE shadow_extraction_log IS
  'Phase 0 shadow mode diagnostic table. Safe to truncate. Auto-expire after 60 days via cleanup job.';
