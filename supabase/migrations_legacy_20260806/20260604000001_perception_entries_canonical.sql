-- ============================================================
-- CANONICAL perception_entries table
-- Sprint 1: Character Intelligence Consolidation
--
-- Supersedes: 20250226000111_perception_entries.sql
--             20250227000114_perception_enhancements.sql
-- (those files were never applied to production)
--
-- Fixes vs old migration files:
--   1. confidence_level: NUMERIC(3,2) not TEXT enum
--   2. status column: correct name/enum (not 'resolution')
--   3. impact_on_me: included from the start (not in separate enhancement)
--   4. subject_alias: declared as real column (was only in a comment before)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.perception_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Subject
  subject_person_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  subject_alias TEXT NOT NULL DEFAULT 'Unknown', -- Display name, required

  -- Source
  source TEXT NOT NULL CHECK (source IN ('overheard', 'told_by', 'rumor', 'social_media', 'intuition', 'assumption', 'other')),
  source_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  source_detail TEXT,

  -- The perception
  content TEXT NOT NULL,
  original_content TEXT,                              -- Preserved on first edit for evolution tracking
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed', 'uncertain')),

  -- Confidence: 0.0–1.0 float (not a TEXT enum)
  confidence_level NUMERIC(3,2) NOT NULL DEFAULT 0.30
    CHECK (confidence_level >= 0.0 AND confidence_level <= 1.0),

  -- Status: unverified by default, can evolve
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified', 'confirmed', 'disproven', 'retracted')),

  -- Timing
  timestamp_heard TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  related_memory_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,

  -- Retraction (explicit, never just delete)
  retracted BOOLEAN NOT NULL DEFAULT FALSE,
  retracted_at TIMESTAMPTZ,
  retraction_reason TEXT,

  -- Impact on you (required)
  impact_on_me TEXT NOT NULL DEFAULT 'Not specified',

  -- Evolution tracking
  evolution_notes TEXT[] NOT NULL DEFAULT '{}',

  -- Cool-down review
  created_in_high_emotion BOOLEAN NOT NULL DEFAULT FALSE,
  review_reminder_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table may already exist from 20250226000111 with a different shape.
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS subject_alias TEXT DEFAULT 'Unknown';
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS source_detail TEXT;
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS original_content TEXT;
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unverified';
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS impact_on_me TEXT DEFAULT 'Not specified';
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS evolution_notes TEXT[] DEFAULT '{}';
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS created_in_high_emotion BOOLEAN DEFAULT FALSE;
ALTER TABLE public.perception_entries ADD COLUMN IF NOT EXISTS review_reminder_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS perception_entries_user_id_idx
  ON public.perception_entries(user_id);

CREATE INDEX IF NOT EXISTS perception_entries_subject_person_id_idx
  ON public.perception_entries(subject_person_id);

CREATE INDEX IF NOT EXISTS perception_entries_subject_alias_idx
  ON public.perception_entries(user_id, subject_alias);

CREATE INDEX IF NOT EXISTS perception_entries_status_idx
  ON public.perception_entries(user_id, status);

CREATE INDEX IF NOT EXISTS perception_entries_retracted_idx
  ON public.perception_entries(user_id, retracted);

CREATE INDEX IF NOT EXISTS perception_entries_timestamp_heard_idx
  ON public.perception_entries(timestamp_heard DESC);

CREATE INDEX IF NOT EXISTS perception_entries_review_reminder_idx
  ON public.perception_entries(user_id, review_reminder_at)
  WHERE review_reminder_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS perception_entries_high_emotion_idx
  ON public.perception_entries(user_id, created_in_high_emotion, created_at)
  WHERE created_in_high_emotion = TRUE;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_perception_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS perception_entries_updated_at ON public.perception_entries;
CREATE TRIGGER perception_entries_updated_at
  BEFORE UPDATE ON public.perception_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_perception_entries_updated_at();

-- Preserve original_content on first edit
CREATE OR REPLACE FUNCTION preserve_perception_original_content()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.original_content IS NULL AND NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.original_content = OLD.content;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS perception_entries_preserve_original ON public.perception_entries;
CREATE TRIGGER perception_entries_preserve_original
  BEFORE UPDATE ON public.perception_entries
  FOR EACH ROW
  EXECUTE FUNCTION preserve_perception_original_content();

-- Sync retracted <-> status
CREATE OR REPLACE FUNCTION sync_perception_retraction_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.retracted = TRUE AND NEW.status != 'retracted' THEN
    NEW.status = 'retracted';
    NEW.retracted_at = COALESCE(NEW.retracted_at, NOW());
  END IF;
  IF NEW.status = 'retracted' AND NEW.retracted = FALSE THEN
    NEW.retracted = TRUE;
    NEW.retracted_at = COALESCE(NEW.retracted_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS perception_entries_sync_retraction ON public.perception_entries;
CREATE TRIGGER perception_entries_sync_retraction
  BEFORE INSERT OR UPDATE ON public.perception_entries
  FOR EACH ROW
  EXECUTE FUNCTION sync_perception_retraction_status();

-- Track perception counts on character (thin-node stats)
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS perception_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_perception_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_perception_at TIMESTAMPTZ;

-- Sensitivity flags for ethical controls
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS sensitivity_level TEXT NOT NULL DEFAULT 'public'
    CHECK (sensitivity_level IN ('public', 'private', 'sensitive')),
  ADD COLUMN IF NOT EXISTS requires_extra_confirmation BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION update_character_perception_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_id UUID;
BEGIN
  target_id := COALESCE(NEW.subject_person_id, OLD.subject_person_id);
  IF target_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.characters
  SET
    perception_count = (
      SELECT COUNT(*) FROM public.perception_entries
      WHERE subject_person_id = target_id
        AND user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND retracted = FALSE
        AND status != 'retracted'
    ),
    first_perception_at = (
      SELECT MIN(timestamp_heard) FROM public.perception_entries
      WHERE subject_person_id = target_id
        AND user_id = COALESCE(NEW.user_id, OLD.user_id)
    ),
    last_perception_at = (
      SELECT MAX(timestamp_heard) FROM public.perception_entries
      WHERE subject_person_id = target_id
        AND user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND retracted = FALSE
        AND status != 'retracted'
    )
  WHERE id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS perception_entries_character_stats ON public.perception_entries;
CREATE TRIGGER perception_entries_character_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.perception_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_character_perception_stats();

-- RLS
ALTER TABLE public.perception_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perception_entries_user_isolation ON public.perception_entries;
CREATE POLICY perception_entries_user_isolation ON public.perception_entries
  FOR ALL USING (user_id = auth.uid());
