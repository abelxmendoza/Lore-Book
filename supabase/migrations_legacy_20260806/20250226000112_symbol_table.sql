-- =====================================================
-- LORE-KEEPER NARRATIVE COMPILER (LNC)
-- Phase 2: Symbol Table Schema
-- =====================================================

-- Symbol Scopes
CREATE TABLE IF NOT EXISTS public.symbol_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL', 'ERA', 'EVENT', 'THREAD')),
  parent_scope_id UUID REFERENCES symbol_scopes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope_type, parent_scope_id)
);

CREATE INDEX IF NOT EXISTS idx_symbol_scopes_user ON public.symbol_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_symbol_scopes_parent ON public.symbol_scopes(parent_scope_id);
CREATE INDEX IF NOT EXISTS idx_symbol_scopes_type ON public.symbol_scopes(scope_type);

-- Entity Symbols
CREATE TABLE IF NOT EXISTS public.entity_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_id UUID NOT NULL REFERENCES symbol_scopes(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT', 'CONCEPT')),
  aliases JSONB DEFAULT '[]'::jsonb,
  confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  introduced_by_entry_id UUID REFERENCES entry_ir(id) ON DELETE SET NULL,
  certainty_source TEXT NOT NULL CHECK (certainty_source IN ('DIRECT_EXPERIENCE', 'REFERENCE', 'INFERENCE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_symbols_user ON public.entity_symbols(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_symbols_scope ON public.entity_symbols(scope_id);
CREATE INDEX IF NOT EXISTS idx_entity_symbols_name ON public.entity_symbols USING GIN(canonical_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entity_symbols_aliases ON public.entity_symbols USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_entity_symbols_entry ON public.entity_symbols(introduced_by_entry_id);

-- Enable trigram extension for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RLS Policies
ALTER TABLE public.symbol_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own symbol scopes"
  ON public.symbol_scopes
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own symbol scopes"
  ON public.symbol_scopes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own entity symbols"
  ON public.entity_symbols
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity symbols"
  ON public.entity_symbols
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity symbols"
  ON public.entity_symbols
  FOR UPDATE
  USING (user_id = auth.uid());

