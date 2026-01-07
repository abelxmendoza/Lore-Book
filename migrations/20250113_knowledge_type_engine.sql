-- =====================================================
-- KNOWLEDGE TYPE ENGINE (KTE)
-- Purpose: Explicitly separate EXPERIENCE, BELIEF, and FACT
-- so the system knows *what kind of knowing* something is
-- =====================================================

-- Knowledge Units Table
-- Extends extracted units with explicit epistemic classification
CREATE TABLE IF NOT EXISTS public.knowledge_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  utterance_id UUID, -- References journal_entries.id or message_id
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN (
    'EXPERIENCE',  -- What happened to me
    'FEELING',     -- What I felt
    'BELIEF',      -- What I think / assume / interpret
    'FACT',        -- Verifiable claims
    'DECISION',    -- What I chose
    'QUESTION'     -- Unresolved inquiry
  )),
  content TEXT NOT NULL, -- normalized text
  entities JSONB DEFAULT '[]'::jsonb, -- Array of entity references
  emotions TEXT[] DEFAULT '{}', -- Array of emotions
  themes TEXT[] DEFAULT '{}', -- Array of themes
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  certainty_source TEXT CHECK (certainty_source IN (
    'DIRECT_EXPERIENCE',
    'HEARSAY',
    'INFERENCE',
    'VERIFICATION',
    'MEMORY_RECALL'
  )),
  temporal_scope TEXT CHECK (temporal_scope IN (
    'MOMENT',
    'PERIOD',
    'ONGOING',
    'UNKNOWN'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link knowledge units to events
CREATE TABLE IF NOT EXISTS public.event_knowledge_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL, -- References resolved_events.id or events.id
  knowledge_unit_id UUID NOT NULL REFERENCES knowledge_units(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('what_happened', 'fact', 'interpretation', 'feeling')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_units_user ON public.knowledge_units(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_units_utterance ON public.knowledge_units(utterance_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_units_type ON public.knowledge_units(user_id, knowledge_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_units_created ON public.knowledge_units(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_knowledge_links_event ON public.event_knowledge_links(event_id);
CREATE INDEX IF NOT EXISTS idx_event_knowledge_links_unit ON public.event_knowledge_links(knowledge_unit_id);
CREATE INDEX IF NOT EXISTS idx_event_knowledge_links_user ON public.event_knowledge_links(user_id);

-- GIN index for entities JSONB search
CREATE INDEX IF NOT EXISTS idx_knowledge_units_entities_gin ON public.knowledge_units USING GIN(entities);
CREATE INDEX IF NOT EXISTS idx_knowledge_units_emotions_gin ON public.knowledge_units USING GIN(emotions);
CREATE INDEX IF NOT EXISTS idx_knowledge_units_themes_gin ON public.knowledge_units USING GIN(themes);

-- RLS Policies
ALTER TABLE public.knowledge_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_knowledge_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own knowledge units"
  ON public.knowledge_units
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own knowledge units"
  ON public.knowledge_units
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own knowledge units"
  ON public.knowledge_units
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own knowledge units"
  ON public.knowledge_units
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own event knowledge links"
  ON public.event_knowledge_links
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own event knowledge links"
  ON public.event_knowledge_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own event knowledge links"
  ON public.event_knowledge_links
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_knowledge_unit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_knowledge_units_updated_at
  BEFORE UPDATE ON public.knowledge_units
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_unit_updated_at();

