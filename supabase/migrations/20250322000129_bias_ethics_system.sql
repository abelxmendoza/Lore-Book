-- Bias Detection, Ethics Review, and Consent Tracking System
-- Addresses challenges in biography/autobiography writing

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Bias Detection
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bias_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  bias_type TEXT NOT NULL CHECK (bias_type IN (
    'self_serving',
    'protective',
    'cultural',
    'temporal',
    'confirmation',
    'negativity',
    'positivity'
  )),
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  detected_patterns TEXT[] DEFAULT '{}',
  suggested_questions TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entry_id, bias_type)
);

CREATE INDEX IF NOT EXISTS idx_bias_detections_user ON public.bias_detections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bias_detections_entry ON public.bias_detections(entry_id);
CREATE INDEX IF NOT EXISTS idx_bias_detections_type ON public.bias_detections(user_id, bias_type);

-- ============================================================================
-- Ethics Review System
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ethics_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  potential_harm JSONB DEFAULT '{}', -- { to_subjects: [], severity: 'low'|'medium'|'high', type: 'reputation'|'privacy'|'emotional'|'legal' }
  suggested_actions TEXT[] DEFAULT '{}', -- ['redact', 'anonymize', 'delay_publication', 'get_consent']
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'action_taken', 'approved')),
  reviewer_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_ethics_reviews_user ON public.ethics_reviews(user_id, review_status);
CREATE INDEX IF NOT EXISTS idx_ethics_reviews_entry ON public.ethics_reviews(entry_id);
CREATE INDEX IF NOT EXISTS idx_ethics_reviews_status ON public.ethics_reviews(user_id, review_status, created_at DESC);

-- ============================================================================
-- Consent Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_entity_id UUID, -- References characters or other entities
  subject_name TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'inclusion',
    'publication',
    'sensitive_content',
    'quotes',
    'photos'
  )),
  consent_status TEXT NOT NULL CHECK (consent_status IN ('granted', 'denied', 'pending', 'revoked', 'expired')),
  consent_date TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  conditions TEXT, -- Any conditions on consent
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_user ON public.consent_records(user_id, consent_status);
CREATE INDEX IF NOT EXISTS idx_consent_records_entity ON public.consent_records(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_status ON public.consent_records(user_id, consent_status, consent_type);

-- ============================================================================
-- Publication Controls
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.publication_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lorebook_id UUID REFERENCES lorebooks(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL, -- 'draft', 'safe', 'full', 'public'
  publication_status TEXT DEFAULT 'draft' CHECK (publication_status IN ('draft', 'scheduled', 'published', 'archived')),
  scheduled_publish_date TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  redacted_entries UUID[] DEFAULT '{}', -- Entry IDs that are redacted in this version
  anonymized_entities UUID[] DEFAULT '{}', -- Entity IDs that are anonymized
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publication_versions_user ON public.publication_versions(user_id, publication_status);
CREATE INDEX IF NOT EXISTS idx_publication_versions_lorebook ON public.publication_versions(lorebook_id);
CREATE INDEX IF NOT EXISTS idx_publication_versions_status ON public.publication_versions(user_id, publication_status, created_at DESC);

-- ============================================================================
-- Memory Reliability Scoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.memory_reliability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  reliability_score FLOAT CHECK (reliability_score >= 0 AND reliability_score <= 1),
  temporal_distance_days INTEGER, -- Days between event and recording
  emotional_state TEXT CHECK (emotional_state IN ('trauma', 'stress', 'calm', 'euphoria', 'neutral', 'unknown')),
  retelling_count INTEGER DEFAULT 0,
  cross_references UUID[] DEFAULT '{}', -- Other entries mentioning same event
  consistency_score FLOAT, -- How consistent with cross-references
  factors JSONB DEFAULT '{}', -- Detailed factors affecting reliability
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_reliability_user ON public.memory_reliability_scores(user_id, reliability_score);
CREATE INDEX IF NOT EXISTS idx_memory_reliability_entry ON public.memory_reliability_scores(entry_id);
CREATE INDEX IF NOT EXISTS idx_memory_reliability_score ON public.memory_reliability_scores(user_id, reliability_score DESC);

-- ============================================================================
-- Retelling Detection
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.retelling_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_description TEXT, -- Canonical description of the event
  entry_ids UUID[] NOT NULL DEFAULT '{}', -- All entries that retell this event
  first_telling_entry_id UUID REFERENCES journal_entries(id),
  retelling_count INTEGER DEFAULT 0,
  evolution_notes TEXT, -- How the story evolved
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retelling_groups_user ON public.retelling_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_retelling_groups_entries ON public.retelling_groups USING GIN(entry_ids);

-- ============================================================================
-- Meaning Emergence Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meaning_emergence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  event_date TIMESTAMPTZ NOT NULL, -- When the event happened
  recorded_date TIMESTAMPTZ NOT NULL, -- When it was first recorded
  meaning_recognized_date TIMESTAMPTZ, -- When meaning was recognized
  significance_level FLOAT CHECK (significance_level >= 0 AND significance_level <= 1),
  reinterpretation_count INTEGER DEFAULT 0,
  interpretations JSONB DEFAULT '[]', -- Array of { date, interpretation, significance }
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_meaning_emergence_user ON public.meaning_emergence(user_id, significance_level DESC);
CREATE INDEX IF NOT EXISTS idx_meaning_emergence_entry ON public.meaning_emergence(event_entry_id);
CREATE INDEX IF NOT EXISTS idx_meaning_emergence_significance ON public.meaning_emergence(user_id, significance_level DESC, created_at DESC);

-- ============================================================================
-- Context Prompts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.context_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  missing_context TEXT[] DEFAULT '{}', -- ['what', 'why', 'who', 'where', 'when', 'how']
  suggested_questions TEXT[] DEFAULT '{}',
  prompt_status TEXT DEFAULT 'pending' CHECK (prompt_status IN ('pending', 'answered', 'dismissed')),
  answered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_prompts_user ON public.context_prompts(user_id, prompt_status);
CREATE INDEX IF NOT EXISTS idx_context_prompts_entry ON public.context_prompts(entry_id);
CREATE INDEX IF NOT EXISTS idx_context_prompts_status ON public.context_prompts(user_id, prompt_status, created_at DESC);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.bias_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ethics_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_reliability_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retelling_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meaning_emergence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_prompts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own bias detections" ON public.bias_detections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bias detections" ON public.bias_detections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bias detections" ON public.bias_detections FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ethics reviews" ON public.ethics_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ethics reviews" ON public.ethics_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ethics reviews" ON public.ethics_reviews FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own consent records" ON public.consent_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own consent records" ON public.consent_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own consent records" ON public.consent_records FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own publication versions" ON public.publication_versions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own publication versions" ON public.publication_versions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own publication versions" ON public.publication_versions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own memory reliability" ON public.memory_reliability_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memory reliability" ON public.memory_reliability_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memory reliability" ON public.memory_reliability_scores FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own retelling groups" ON public.retelling_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own retelling groups" ON public.retelling_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own retelling groups" ON public.retelling_groups FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own meaning emergence" ON public.meaning_emergence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meaning emergence" ON public.meaning_emergence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meaning emergence" ON public.meaning_emergence FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own context prompts" ON public.context_prompts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own context prompts" ON public.context_prompts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own context prompts" ON public.context_prompts FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.bias_detections IS 'Detects various types of bias in journal entries (self-serving, protective, cultural, temporal)';
COMMENT ON TABLE public.ethics_reviews IS 'Reviews entries for potential harm before publication';
COMMENT ON TABLE public.consent_records IS 'Tracks consent from subjects mentioned in entries';
COMMENT ON TABLE public.publication_versions IS 'Manages different versions of publications (draft, safe, full, public)';
COMMENT ON TABLE public.memory_reliability_scores IS 'Scores memory reliability based on temporal distance, emotional state, retelling count';
COMMENT ON TABLE public.retelling_groups IS 'Groups entries that retell the same event, tracking story evolution';
COMMENT ON TABLE public.meaning_emergence IS 'Tracks when events become meaningful (retrospective significance)';
COMMENT ON TABLE public.context_prompts IS 'Prompts user to add missing context to vague entries';
