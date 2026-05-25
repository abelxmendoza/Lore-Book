-- Truth Seeker and Fact Checking System
-- Adds verification status tracking and fact claims storage

-- Add verification_status column to journal_entries
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified'
CHECK (verification_status IN ('verified', 'unverified', 'contradicted', 'ambiguous'));

COMMENT ON COLUMN public.journal_entries.verification_status IS 'Verification status: verified (consistent), unverified (no evidence), contradicted (conflicts detected), ambiguous (multiple perspectives)';

-- Create fact_claims table for extracted factual claims from entries
CREATE TABLE IF NOT EXISTS public.fact_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('date', 'location', 'character', 'event', 'relationship', 'attribute', 'other')),
  subject TEXT NOT NULL,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  extracted_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(user_id, entry_id, subject, attribute, value)
);

COMMENT ON TABLE public.fact_claims IS 'Extracted factual claims from journal entries for verification';
COMMENT ON COLUMN public.fact_claims.claim_type IS 'Type of claim: date, location, character, event, relationship, attribute, other';
COMMENT ON COLUMN public.fact_claims.confidence IS 'Confidence score from extraction (0-1)';

CREATE INDEX IF NOT EXISTS fact_claims_user_id_idx ON public.fact_claims(user_id);
CREATE INDEX IF NOT EXISTS fact_claims_entry_id_idx ON public.fact_claims(entry_id);
CREATE INDEX IF NOT EXISTS fact_claims_subject_attribute_idx ON public.fact_claims(user_id, subject, attribute);
CREATE INDEX IF NOT EXISTS fact_claims_claim_type_idx ON public.fact_claims(claim_type);

-- Create entry_verifications table for detailed verification records
CREATE TABLE IF NOT EXISTS public.entry_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'unverified', 'contradicted', 'ambiguous')),
  verified_at timestamptz DEFAULT now(),
  verified_by TEXT DEFAULT 'system', -- 'system' or 'user'
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  evidence_count INTEGER DEFAULT 0,
  contradiction_count INTEGER DEFAULT 0,
  supporting_entries jsonb DEFAULT '[]'::jsonb, -- Array of entry IDs that support this
  contradicting_entries jsonb DEFAULT '[]'::jsonb, -- Array of entry IDs that contradict this
  verification_report jsonb DEFAULT '{}'::jsonb, -- Detailed report
  resolved BOOLEAN DEFAULT false,
  resolved_at timestamptz,
  resolution_notes TEXT,
  metadata jsonb DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.entry_verifications IS 'Detailed verification records for journal entries';
COMMENT ON COLUMN public.entry_verifications.supporting_entries IS 'Array of entry IDs that support the facts in this entry';
COMMENT ON COLUMN public.entry_verifications.contradicting_entries IS 'Array of entry IDs that contradict facts in this entry';
COMMENT ON COLUMN public.entry_verifications.verification_report IS 'Detailed JSON report with extracted facts, evidence, and analysis';

CREATE INDEX IF NOT EXISTS entry_verifications_user_id_idx ON public.entry_verifications(user_id);
CREATE INDEX IF NOT EXISTS entry_verifications_entry_id_idx ON public.entry_verifications(entry_id);
CREATE INDEX IF NOT EXISTS entry_verifications_status_idx ON public.entry_verifications(user_id, verification_status);
CREATE INDEX IF NOT EXISTS entry_verifications_resolved_idx ON public.entry_verifications(user_id, resolved) WHERE resolved = false;

-- Create fact_verifications table for individual fact claim verifications
CREATE TABLE IF NOT EXISTS public.fact_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact_claim_id uuid NOT NULL REFERENCES public.fact_claims(id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'unverified', 'contradicted', 'ambiguous')),
  verified_at timestamptz DEFAULT now(),
  verified_by TEXT DEFAULT 'system',
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  supporting_facts jsonb DEFAULT '[]'::jsonb, -- Array of fact_claim_ids that support this
  contradicting_facts jsonb DEFAULT '[]'::jsonb, -- Array of fact_claim_ids that contradict this
  evidence_summary TEXT,
  metadata jsonb DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.fact_verifications IS 'Verification records for individual fact claims';
COMMENT ON COLUMN public.fact_verifications.supporting_facts IS 'Array of fact_claim_ids that support this fact';
COMMENT ON COLUMN public.fact_verifications.contradicting_facts IS 'Array of fact_claim_ids that contradict this fact';

CREATE INDEX IF NOT EXISTS fact_verifications_user_id_idx ON public.fact_verifications(user_id);
CREATE INDEX IF NOT EXISTS fact_verifications_fact_claim_id_idx ON public.fact_verifications(fact_claim_id);
CREATE INDEX IF NOT EXISTS fact_verifications_status_idx ON public.fact_verifications(user_id, verification_status);

