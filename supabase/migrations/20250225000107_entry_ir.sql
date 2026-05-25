-- =====================================================
-- LORE-KEEPER NARRATIVE COMPILER (LNC)
-- Entry IR Table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.entry_ir (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_utterance_id UUID REFERENCES utterances(id) ON DELETE SET NULL,
  thread_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,

  -- Epistemic classification
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION')),

  -- Normalized semantic payload
  content TEXT NOT NULL,
  entities JSONB DEFAULT '[]'::jsonb,
  emotions JSONB DEFAULT '[]'::jsonb,
  themes JSONB DEFAULT '[]'::jsonb,

  -- Confidence & epistemology
  confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  certainty_source TEXT NOT NULL CHECK (certainty_source IN ('DIRECT_EXPERIENCE', 'INFERENCE', 'HEARSAY', 'VERIFICATION', 'MEMORY_RECALL')),

  -- Narrative structure
  narrative_links JSONB DEFAULT '{}'::jsonb,

  -- Compiler metadata
  compiler_flags JSONB DEFAULT '{"is_dirty": true, "is_deprecated": false, "compilation_version": 1}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_ir_user ON public.entry_ir(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_ir_utterance ON public.entry_ir(source_utterance_id);
CREATE INDEX IF NOT EXISTS idx_entry_ir_thread ON public.entry_ir(thread_id);
CREATE INDEX IF NOT EXISTS idx_entry_ir_timestamp ON public.entry_ir(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_entry_ir_knowledge_type ON public.entry_ir(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_entry_ir_compiler_flags ON public.entry_ir USING GIN(compiler_flags);

-- Dependency graph table
CREATE TABLE IF NOT EXISTS public.entry_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES entry_ir(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('ENTITY', 'ENTRY')),
  dependency_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id, dependency_type, dependency_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_dependencies_entry ON public.entry_dependencies(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_dependencies_dep ON public.entry_dependencies(dependency_id, dependency_type);
CREATE INDEX IF NOT EXISTS idx_entry_dependencies_user ON public.entry_dependencies(user_id);

-- RLS Policies
ALTER TABLE public.entry_ir ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entry IR"
  ON public.entry_ir
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entry IR"
  ON public.entry_ir
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entry IR"
  ON public.entry_ir
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own entry dependencies"
  ON public.entry_dependencies
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entry dependencies"
  ON public.entry_dependencies
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

