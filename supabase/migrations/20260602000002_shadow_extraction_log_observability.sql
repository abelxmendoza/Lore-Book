-- =====================================================
-- SHADOW EXTRACTION LOG — OBSERVABILITY EXPANSION
-- Adds F1 scores, economics (token/call/latency reduction),
-- and novel discovery columns to shadow_extraction_log.
-- Safe to apply in any order relative to 20260602000001.
-- =====================================================

ALTER TABLE shadow_extraction_log

  -- ── Quality: F1 scores ──────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS entity_f1                 numeric(4,3),
  ADD COLUMN IF NOT EXISTS relationship_f1           numeric(4,3),
  ADD COLUMN IF NOT EXISTS romantic_signal_f1        numeric(4,3),
  ADD COLUMN IF NOT EXISTS interest_f1               numeric(4,3),

  -- ── Quality: precision columns (complement to existing recall columns) ──────
  ADD COLUMN IF NOT EXISTS relationship_precision    numeric(4,3),

  -- ── Economics: reduction percentages ────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS token_reduction_pct       numeric(6,1),
  ADD COLUMN IF NOT EXISTS call_reduction_pct        numeric(6,1),
  ADD COLUMN IF NOT EXISTS latency_reduction_pct     numeric(6,1),

  -- ── Discovery: novel signal arrays (what merged found that baseline missed) ─
  ADD COLUMN IF NOT EXISTS novel_entities            jsonb  NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS novel_relationships       jsonb  NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS novel_experiences         jsonb  NOT NULL DEFAULT '[]',

  -- ── Discovery: counts (for fast aggregation without unpacking jsonb) ─────────
  ADD COLUMN IF NOT EXISTS novel_entity_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS novel_relationship_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS novel_experience_count    integer NOT NULL DEFAULT 0,

  -- ── Baseline: experiences captured from pipeline ─────────────────────────────
  ADD COLUMN IF NOT EXISTS baseline_experiences      jsonb  NOT NULL DEFAULT '[]';

-- Indexes for dashboard aggregation queries
CREATE INDEX IF NOT EXISTS idx_shadow_entity_f1
  ON shadow_extraction_log (entity_f1 DESC)
  WHERE entity_f1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shadow_token_reduction
  ON shadow_extraction_log (token_reduction_pct DESC)
  WHERE token_reduction_pct IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shadow_novel_entities
  ON shadow_extraction_log (novel_entity_count DESC)
  WHERE novel_entity_count > 0;

-- Composite index for the go/no-go readiness report query
-- (full-table ordered by quality + economics in one pass)
CREATE INDEX IF NOT EXISTS idx_shadow_readiness
  ON shadow_extraction_log (created_at DESC, entity_f1, token_reduction_pct)
  WHERE merged_extraction IS NOT NULL;
