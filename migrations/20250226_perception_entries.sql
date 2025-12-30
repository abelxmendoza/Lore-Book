-- Perception Entries: Store what you heard, believed, and how it affected you
-- NOT objective truth about others - YOUR perception only

CREATE TABLE IF NOT EXISTS public.perception_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- What this perception is about
  subject_person_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  subject_person_name TEXT, -- Fallback if character doesn't exist yet
  
  -- Source of information
  source TEXT NOT NULL CHECK (source IN ('overheard', 'told_by', 'rumor', 'social_media', 'intuition', 'assumption', 'other')),
  source_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL, -- Who told you (if told_by)
  source_description TEXT, -- Description of source if not a character
  
  -- The perception itself
  content TEXT NOT NULL,
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed', 'uncertain')),
  confidence_level TEXT DEFAULT 'low' CHECK (confidence_level IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  
  -- When and context
  timestamp_heard TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  related_memory_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  related_timeline_id UUID REFERENCES public.timelines(id) ON DELETE SET NULL,
  
  -- Evolution and resolution
  retracted BOOLEAN DEFAULT FALSE,
  retracted_at TIMESTAMPTZ,
  retraction_reason TEXT,
  resolution TEXT CHECK (resolution IN ('confirmed', 'disproven', 'unresolved', 'partially_confirmed')),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  
  -- Impact on you
  impact_on_behavior TEXT, -- How this affected your actions
  impact_on_emotions TEXT, -- How this affected your feelings
  impact_on_decisions TEXT, -- How this affected your choices
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.perception_entries IS 'HARD RULE: Stores YOUR perception at a point in time, NOT objective truth about others. This is parallel to journal_entries, not inside it.';
COMMENT ON COLUMN public.perception_entries.subject_alias IS 'Name/alias of person this perception is about (REQUIRED - no nulls, even if anonymized)';
COMMENT ON COLUMN public.perception_entries.content IS 'The perception content - MUST be framed as YOUR belief (e.g., "I believed X did Y", not "X did Y")';
COMMENT ON COLUMN public.perception_entries.source IS 'How you learned this: overheard, told_by, rumor, social_media, intuition, assumption (strict enum)';
COMMENT ON COLUMN public.perception_entries.confidence_level IS 'Confidence level 0.0-1.0 (defaults to 0.3 = low). Never auto-raised.';
COMMENT ON COLUMN public.perception_entries.impact_on_me IS 'REQUIRED: How did believing this affect my actions, emotions, or decisions? Key insight lever - shifts focus away from others.';
COMMENT ON COLUMN public.perception_entries.status IS 'Status: unverified (default), confirmed, disproven, retracted. Can evolve over time.';
COMMENT ON COLUMN public.perception_entries.retracted IS 'Whether you have retracted this perception. Retractions are explicit, not deletes.';
COMMENT ON COLUMN public.perception_entries.resolution_note IS 'Notes on resolution/retraction - tracks evolution of belief over time';
COMMENT ON COLUMN public.perception_entries.original_content IS 'Preserve original text for belief evolution tracking - prevents rewriting history';
COMMENT ON COLUMN public.perception_entries.evolution_notes IS 'Array of notes tracking how belief changed over time (e.g., "2024-01-15: Confirmed false", "2024-03-20: Realized this was projection")';
COMMENT ON COLUMN public.perception_entries.created_in_high_emotion IS 'Flag for entries created in high-emotion mode - triggers cool-down review reminders';
COMMENT ON COLUMN public.perception_entries.review_reminder_at IS 'When to remind user to review this entry (for high-emotion entries, typically 7-30 days later)';
COMMENT ON COLUMN public.perception_entries.metadata IS 'Metadata for future AI pattern detection: repeated subjects, low confidence patterns, emotional tone, etc.';

-- Indexes
CREATE INDEX IF NOT EXISTS perception_entries_user_id_idx ON public.perception_entries(user_id);
CREATE INDEX IF NOT EXISTS perception_entries_subject_person_id_idx ON public.perception_entries(subject_person_id);
CREATE INDEX IF NOT EXISTS perception_entries_subject_alias_idx ON public.perception_entries(user_id, subject_alias);
CREATE INDEX IF NOT EXISTS perception_entries_timestamp_heard_idx ON public.perception_entries(timestamp_heard DESC);
CREATE INDEX IF NOT EXISTS perception_entries_status_idx ON public.perception_entries(user_id, status);
CREATE INDEX IF NOT EXISTS perception_entries_retracted_idx ON public.perception_entries(user_id, retracted);
CREATE INDEX IF NOT EXISTS perception_entries_related_memory_id_idx ON public.perception_entries(related_memory_id);
CREATE INDEX IF NOT EXISTS perception_entries_source_idx ON public.perception_entries(user_id, source);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_perception_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER perception_entries_updated_at
  BEFORE UPDATE ON public.perception_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_perception_entries_updated_at();

-- Add perception tracking to characters (thin nodes - people are context, not narrators)
ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS perception_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_perception_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_perception_at TIMESTAMPTZ;

COMMENT ON COLUMN public.characters.perception_count IS 'Number of perception entries about this person (thin node - no timelines owned)';
COMMENT ON COLUMN public.characters.first_perception_at IS 'When you first formed a perception about this person';
COMMENT ON COLUMN public.characters.last_perception_at IS 'Most recent perception entry about this person';

-- RULE: People are context, not narrators. They link to memories and perceptions, but do NOT own timelines.

-- Function to update character perception stats (thin nodes - no timeline ownership)
CREATE OR REPLACE FUNCTION update_character_perception_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.subject_person_id IS DISTINCT FROM NEW.subject_person_id OR OLD.retracted IS DISTINCT FROM NEW.retracted OR OLD.status IS DISTINCT FROM NEW.status)) THEN
    -- Update old subject if changed
    IF TG_OP = 'UPDATE' AND OLD.subject_person_id IS NOT NULL AND OLD.subject_person_id IS DISTINCT FROM NEW.subject_person_id THEN
      UPDATE public.characters
      SET 
        perception_count = GREATEST(0, perception_count - CASE WHEN OLD.retracted OR OLD.status = 'retracted' THEN 0 ELSE 1 END),
        last_perception_at = (
          SELECT MAX(timestamp_heard)
          FROM public.perception_entries
          WHERE subject_person_id = OLD.subject_person_id
            AND user_id = OLD.user_id
            AND retracted = FALSE
            AND status != 'retracted'
        )
      WHERE id = OLD.subject_person_id;
    END IF;
    
    -- Update new subject (only count non-retracted, non-deleted)
    IF NEW.subject_person_id IS NOT NULL AND NOT NEW.retracted AND NEW.status != 'retracted' THEN
      UPDATE public.characters
      SET 
        perception_count = (
          SELECT COUNT(*)
          FROM public.perception_entries
          WHERE subject_person_id = NEW.subject_person_id
            AND user_id = NEW.user_id
            AND retracted = FALSE
            AND status != 'retracted'
        ),
        first_perception_at = COALESCE(
          first_perception_at,
          (SELECT MIN(timestamp_heard) FROM public.perception_entries WHERE subject_person_id = NEW.subject_person_id AND user_id = NEW.user_id)
        ),
        last_perception_at = (
          SELECT MAX(timestamp_heard)
          FROM public.perception_entries
          WHERE subject_person_id = NEW.subject_person_id
            AND user_id = NEW.user_id
            AND retracted = FALSE
            AND status != 'retracted'
        )
      WHERE id = NEW.subject_person_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER perception_entries_character_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.perception_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_character_perception_stats();
