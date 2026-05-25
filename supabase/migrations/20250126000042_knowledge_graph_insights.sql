-- Knowledge Graph and Insights System
-- Adds graph_edges table for component relationships and insights table for persistent storage

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Graph Edges Table
-- Stores relationships between memory components (knowledge graph)
CREATE TABLE IF NOT EXISTS public.graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_component_id UUID NOT NULL REFERENCES public.memory_components(id) ON DELETE CASCADE,
  target_component_id UUID NOT NULL REFERENCES public.memory_components(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('semantic', 'social', 'thematic', 'narrative', 'temporal', 'emotional', 'character', 'location', 'tag')),
  weight FLOAT DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_component_id, target_component_id, relationship_type)
);

-- Insights Table
-- Stores automatically generated insights from memory analysis
CREATE TABLE IF NOT EXISTS public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('pattern', 'correlation', 'cyclic_behavior', 'identity_shift', 'motif', 'prediction', 'trend', 'relationship', 'emotional', 'behavioral')),
  text TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source_component_ids UUID[] DEFAULT '{}',
  source_entry_ids UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhance conversation_sessions table
-- Add embeddings and topics columns
ALTER TABLE public.conversation_sessions
  ADD COLUMN IF NOT EXISTS embeddings VECTOR(1536),
  ADD COLUMN IF NOT EXISTS topics TEXT[] DEFAULT '{}';

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

-- Graph Edges Indexes
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON public.graph_edges(source_component_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON public.graph_edges(target_component_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON public.graph_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source_type ON public.graph_edges(source_component_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_weight ON public.graph_edges(weight DESC) WHERE weight >= 0.5;

-- Insights Indexes
CREATE INDEX IF NOT EXISTS idx_insights_user_type ON public.insights(user_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_user_created ON public.insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON public.insights(user_id, confidence DESC) WHERE confidence >= 0.7;
CREATE INDEX IF NOT EXISTS idx_insights_type ON public.insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_tags_gin ON public.insights USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_insights_component_ids_gin ON public.insights USING GIN(source_component_ids);
CREATE INDEX IF NOT EXISTS idx_insights_entry_ids_gin ON public.insights USING GIN(source_entry_ids);

-- Conversation Sessions Enhancement Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_embeddings ON public.conversation_sessions 
  USING ivfflat (embeddings vector_cosine_ops) WITH (lists = 100)
  WHERE embeddings IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_topics_gin ON public.conversation_sessions USING GIN(topics);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on new tables
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

-- Graph Edges RLS Policies
-- Users can only access edges for their own components
CREATE POLICY graph_edges_owner_select ON public.graph_edges
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.memory_components mc1
      JOIN public.journal_entries je1 ON je1.id = mc1.journal_entry_id
      WHERE mc1.id = graph_edges.source_component_id 
      AND je1.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.memory_components mc2
      JOIN public.journal_entries je2 ON je2.id = mc2.journal_entry_id
      WHERE mc2.id = graph_edges.target_component_id 
      AND je2.user_id = auth.uid()
    )
  );
CREATE POLICY graph_edges_owner_insert ON public.graph_edges
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memory_components mc1
      JOIN public.journal_entries je1 ON je1.id = mc1.journal_entry_id
      WHERE mc1.id = graph_edges.source_component_id 
      AND je1.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.memory_components mc2
      JOIN public.journal_entries je2 ON je2.id = mc2.journal_entry_id
      WHERE mc2.id = graph_edges.target_component_id 
      AND je2.user_id = auth.uid()
    )
  );
CREATE POLICY graph_edges_owner_update ON public.graph_edges
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.memory_components mc1
      JOIN public.journal_entries je1 ON je1.id = mc1.journal_entry_id
      WHERE mc1.id = graph_edges.source_component_id 
      AND je1.user_id = auth.uid()
    )
  );
CREATE POLICY graph_edges_owner_delete ON public.graph_edges
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.memory_components mc1
      JOIN public.journal_entries je1 ON je1.id = mc1.journal_entry_id
      WHERE mc1.id = graph_edges.source_component_id 
      AND je1.user_id = auth.uid()
    )
  );

-- Insights RLS Policies
CREATE POLICY insights_owner_select ON public.insights
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY insights_owner_insert ON public.insights
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY insights_owner_update ON public.insights
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY insights_owner_delete ON public.insights
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp for graph_edges
CREATE TRIGGER update_graph_edges_updated_at
  BEFORE UPDATE ON public.graph_edges
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at timestamp for insights
CREATE TRIGGER update_insights_updated_at
  BEFORE UPDATE ON public.insights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.graph_edges IS 'Knowledge graph edges connecting memory components with semantic, social, thematic, and narrative relationships';
COMMENT ON TABLE public.insights IS 'Automatically generated insights from memory analysis (patterns, trends, correlations, predictions)';

COMMENT ON COLUMN public.graph_edges.relationship_type IS 'Type of relationship: semantic (embedding similarity), social (shared characters), thematic (shared tags), narrative (shared timeline), temporal, emotional, character, location, tag';
COMMENT ON COLUMN public.graph_edges.weight IS 'Edge weight (0-1) indicating relationship strength';
COMMENT ON COLUMN public.insights.insight_type IS 'Type of insight: pattern, correlation, cyclic_behavior, identity_shift, motif, prediction, trend, relationship, emotional, behavioral';
COMMENT ON COLUMN public.insights.confidence IS 'Confidence score (0-1) for the insight';
COMMENT ON COLUMN public.insights.source_component_ids IS 'Array of memory component IDs that contributed to this insight';
COMMENT ON COLUMN public.insights.source_entry_ids IS 'Array of journal entry IDs that contributed to this insight';

