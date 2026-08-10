-- Profile Claims System
-- Resume uploads and identity claims become verifiable claims, not facts
-- This enables deep user modeling with guardrails

-- Profile Claims Table
CREATE TABLE IF NOT EXISTS public.profile_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Claim classification
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'role', 'skill', 'experience', 'achievement', 'education', 'certification', 'project'
  )),
  claim_text TEXT NOT NULL, -- The actual claim (e.g., "3 years React experience", "BJJ blue belt")
  
  -- Source tracking
  source TEXT NOT NULL CHECK (source IN (
    'resume', 'chat', 'linkedin', 'manual', 'work_summary', 'journal_entry'
  )),
  source_id UUID NULL, -- Reference to resume, journal entry, etc.
  source_detail TEXT NULL, -- Additional context (e.g., "Resume v2", "Chat message on 2024-01-15")
  
  -- Verification status
  verified_status TEXT DEFAULT 'unverified' CHECK (verified_status IN (
    'unverified', 'supported', 'verified', 'contradicted', 'downgraded'
  )),
  confidence NUMERIC(3,2) DEFAULT 0.6 CHECK (confidence BETWEEN 0 AND 1), -- Starts moderate
  
  -- Evidence tracking
  evidence JSONB DEFAULT '{}', -- { internal: [memory_ids], external: [refs], time_span: {...} }
  
  -- User confirmation
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_confirmed_at TIMESTAMPTZ NULL,
  user_notes TEXT NULL, -- User can add context or corrections
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  UNIQUE(user_id, claim_type, claim_text, source) -- Prevent exact duplicates
);

-- Profile Claims Evidence Links (many-to-many with journal entries)
CREATE TABLE IF NOT EXISTS public.profile_claim_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.profile_claims(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Evidence source
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'journal_entry', 'work_summary', 'skill_progress', 'external_verification', 'time_pattern'
  )),
  evidence_id UUID NULL, -- journal_entries.id, skills.id, etc.
  evidence_text TEXT NULL, -- Quote or summary
  
  -- Evidence strength
  strength NUMERIC(3,2) DEFAULT 0.5 CHECK (strength BETWEEN 0 AND 1),
  relevance NUMERIC(3,2) DEFAULT 0.5 CHECK (relevance BETWEEN 0 AND 1),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Resume Documents Table
CREATE TABLE IF NOT EXISTS public.resume_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- File info
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'doc', 'docx', 'txt'
  file_size INTEGER NOT NULL,
  file_url TEXT NULL, -- Storage URL if uploaded to S3/storage
  
  -- Parsed content
  raw_text TEXT NULL, -- Extracted text from PDF/DOC
  parsed_data JSONB DEFAULT '{}', -- Structured sections: roles, skills, education, etc.
  
  -- Processing status
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  processing_error TEXT NULL,
  
  -- Claims generated
  claims_generated INTEGER DEFAULT 0,
  claims_confirmed INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS profile_claims_user_id_idx ON public.profile_claims(user_id);
CREATE INDEX IF NOT EXISTS profile_claims_type_idx ON public.profile_claims(user_id, claim_type);
CREATE INDEX IF NOT EXISTS profile_claims_status_idx ON public.profile_claims(user_id, verified_status);
CREATE INDEX IF NOT EXISTS profile_claims_confidence_idx ON public.profile_claims(user_id, confidence DESC);
CREATE INDEX IF NOT EXISTS profile_claim_evidence_claim_id_idx ON public.profile_claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS profile_claim_evidence_user_id_idx ON public.profile_claim_evidence(user_id);
CREATE INDEX IF NOT EXISTS resume_documents_user_id_idx ON public.resume_documents(user_id);
CREATE INDEX IF NOT EXISTS resume_documents_status_idx ON public.resume_documents(user_id, processing_status);

-- Comments
COMMENT ON TABLE public.profile_claims IS 'User identity claims from resumes, chat, etc. These are claims, not facts - verified over time.';
COMMENT ON TABLE public.profile_claim_evidence IS 'Evidence linking claims to actual behavior (journal entries, skills, etc.)';
COMMENT ON TABLE public.resume_documents IS 'Uploaded resume documents with parsed content and generated claims.';

-- RLS Policies
ALTER TABLE public.profile_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_documents ENABLE ROW LEVEL SECURITY;

-- Profile Claims RLS
CREATE POLICY "Users can view their own profile claims"
  ON public.profile_claims FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile claims"
  ON public.profile_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile claims"
  ON public.profile_claims FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile claims"
  ON public.profile_claims FOR DELETE
  USING (auth.uid() = user_id);

-- Evidence RLS
CREATE POLICY "Users can view their own claim evidence"
  ON public.profile_claim_evidence FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own claim evidence"
  ON public.profile_claim_evidence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Resume Documents RLS
CREATE POLICY "Users can view their own resume documents"
  ON public.resume_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own resume documents"
  ON public.resume_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own resume documents"
  ON public.resume_documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resume documents"
  ON public.resume_documents FOR DELETE
  USING (auth.uid() = user_id);
