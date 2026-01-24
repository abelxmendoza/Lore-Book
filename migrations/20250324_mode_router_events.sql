-- Mode Router System: Event Records and Narrative Accounts
-- Supports 4-mode routing with structured event extraction

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Event Records (Factual Layer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_date TIMESTAMPTZ NOT NULL,
  event_date_end TIMESTAMPTZ, -- For events with duration
  location_ids UUID[] DEFAULT '{}',
  participant_ids UUID[] DEFAULT '{}', -- Character IDs
  tags TEXT[] DEFAULT '{}', -- music, conflict, intimacy, danger, joy, etc.
  source_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_records_user ON public.event_records(user_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_records_date ON public.event_records(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_event_records_tags ON public.event_records USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_event_records_participants ON public.event_records USING GIN(participant_ids);

-- ============================================================================
-- Narrative Accounts (Perspective Layer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.narrative_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_record_id UUID REFERENCES event_records(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (account_type IN (
    'at_the_time',      -- How it was experienced in the moment
    'others_perspective', -- How others described it
    'later_interpretation' -- How it was reinterpreted later
  )),
  narrator_id UUID, -- Character ID (null = user's perspective)
  narrative_text TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL, -- When this account was recorded
  source_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narrative_accounts_user ON public.narrative_accounts(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_accounts_event ON public.narrative_accounts(event_record_id);
CREATE INDEX IF NOT EXISTS idx_narrative_accounts_type ON public.narrative_accounts(user_id, account_type);
CREATE INDEX IF NOT EXISTS idx_narrative_accounts_narrator ON public.narrative_accounts(narrator_id);

-- ============================================================================
-- Event Emotions (Emotional Layer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_emotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_record_id UUID REFERENCES event_records(id) ON DELETE CASCADE,
  emotion TEXT NOT NULL,
  intensity FLOAT CHECK (intensity >= 0 AND intensity <= 1),
  timestamp_offset INTEGER, -- Seconds from event start
  source_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_emotions_user ON public.event_emotions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_emotions_event ON public.event_emotions(event_record_id);
CREATE INDEX IF NOT EXISTS idx_event_emotions_emotion ON public.event_emotions(user_id, emotion);

-- ============================================================================
-- Event Cognitions (Cognitive Layer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_cognitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_record_id UUID REFERENCES event_records(id) ON DELETE CASCADE,
  cognition_type TEXT NOT NULL CHECK (cognition_type IN (
    'belief',
    'insecurity_triggered',
    'realization',
    'question',
    'doubt'
  )),
  content TEXT NOT NULL,
  source_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_cognitions_user ON public.event_cognitions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_cognitions_event ON public.event_cognitions(event_record_id);
CREATE INDEX IF NOT EXISTS idx_event_cognitions_type ON public.event_cognitions(user_id, cognition_type);

-- ============================================================================
-- Event Identity Impacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_identity_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_record_id UUID REFERENCES event_records(id) ON DELETE CASCADE,
  impact_type TEXT NOT NULL CHECK (impact_type IN (
    'reinforced',
    'challenged',
    'shifted',
    'clarified'
  )),
  identity_aspect TEXT, -- e.g., "I am creative", "I am brave"
  source_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_identity_impacts_user ON public.event_identity_impacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_identity_impacts_event ON public.event_identity_impacts(event_record_id);
CREATE INDEX IF NOT EXISTS idx_event_identity_impacts_type ON public.event_identity_impacts(user_id, impact_type);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.event_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narrative_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_emotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_cognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_identity_impacts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own event records" ON public.event_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own event records" ON public.event_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own event records" ON public.event_records FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own narrative accounts" ON public.narrative_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own narrative accounts" ON public.narrative_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own narrative accounts" ON public.narrative_accounts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own event emotions" ON public.event_emotions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own event emotions" ON public.event_emotions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own event emotions" ON public.event_emotions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own event cognitions" ON public.event_cognitions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own event cognitions" ON public.event_cognitions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own event cognitions" ON public.event_cognitions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own identity impacts" ON public.event_identity_impacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own identity impacts" ON public.event_identity_impacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own identity impacts" ON public.event_identity_impacts FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.event_records IS 'Factual event layer: date, location, participants, tags';
COMMENT ON TABLE public.narrative_accounts IS 'Perspective layer: different accounts of the same event (at_the_time, others_perspective, later_interpretation)';
COMMENT ON TABLE public.event_emotions IS 'Emotional layer: emotions felt during event with intensity and timing';
COMMENT ON TABLE public.event_cognitions IS 'Cognitive layer: beliefs, insecurities, realizations triggered by event';
COMMENT ON TABLE public.event_identity_impacts IS 'Identity impact: how event reinforced, challenged, shifted, or clarified identity';
