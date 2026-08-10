-- Reaction Entries Migration
-- Third first-class concept: How you responded internally or behaviorally
-- Reactions attach to memories OR perceptions (never stand alone)

CREATE TABLE IF NOT EXISTS public.reaction_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What triggered this reaction (memory or perception)
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('memory', 'perception')),
  trigger_id UUID NOT NULL, -- journal_entries.id OR perception_entries.id

  -- Reaction classification
  reaction_type TEXT NOT NULL CHECK (
    reaction_type IN ('emotional', 'behavioral', 'cognitive', 'physical')
  ),
  reaction_label TEXT NOT NULL, -- e.g. "anxiety", "avoidance", "anger", "shutdown", "rumination"
  
  -- Intensity and duration
  intensity NUMERIC(3,2) CHECK (intensity BETWEEN 0 AND 1),
  duration TEXT NULL, -- e.g. "minutes", "hours", "days", "weeks"
  
  -- Description (optional)
  description TEXT NULL,
  
  -- Was this reflexive or deliberate?
  automatic BOOLEAN DEFAULT TRUE,
  
  -- What you did to handle it (if anything)
  coping_response TEXT NULL,
  
  -- Timeline
  timestamp_started TIMESTAMPTZ NOT NULL,
  timestamp_resolved TIMESTAMPTZ NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS reaction_entries_user_id_idx ON public.reaction_entries(user_id);
CREATE INDEX IF NOT EXISTS reaction_entries_trigger_idx ON public.reaction_entries(trigger_type, trigger_id);
CREATE INDEX IF NOT EXISTS reaction_entries_timestamp_idx ON public.reaction_entries(timestamp_started);
CREATE INDEX IF NOT EXISTS reaction_entries_reaction_type_idx ON public.reaction_entries(reaction_type);
CREATE INDEX IF NOT EXISTS reaction_entries_reaction_label_idx ON public.reaction_entries(reaction_label);

-- Comments for documentation
COMMENT ON TABLE public.reaction_entries IS 'Third first-class concept: How you responded internally or behaviorally. Reactions attach to memories OR perceptions (never stand alone).';
COMMENT ON COLUMN public.reaction_entries.trigger_type IS 'What triggered this: memory (experienced) or perception (believed/heard)';
COMMENT ON COLUMN public.reaction_entries.trigger_id IS 'ID of the memory or perception that triggered this reaction';
COMMENT ON COLUMN public.reaction_entries.reaction_type IS 'Type: emotional, behavioral, cognitive, or physical';
COMMENT ON COLUMN public.reaction_entries.reaction_label IS 'Label: e.g. "anxiety", "avoidance", "anger", "shutdown", "rumination"';
COMMENT ON COLUMN public.reaction_entries.intensity IS 'Intensity 0.0-1.0 (how strong was the reaction)';
COMMENT ON COLUMN public.reaction_entries.duration IS 'How long it lasted: "minutes", "hours", "days", "weeks"';
COMMENT ON COLUMN public.reaction_entries.automatic IS 'Was this reflexive (automatic) or deliberate?';
COMMENT ON COLUMN public.reaction_entries.coping_response IS 'What you did to handle it (if anything)';
COMMENT ON COLUMN public.reaction_entries.timestamp_started IS 'When the reaction started';
COMMENT ON COLUMN public.reaction_entries.timestamp_resolved IS 'When the reaction resolved (if it has)';

-- Enable RLS
ALTER TABLE public.reaction_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own reactions"
  ON public.reaction_entries
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reactions"
  ON public.reaction_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reactions"
  ON public.reaction_entries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
  ON public.reaction_entries
  FOR DELETE
  USING (auth.uid() = user_id);
