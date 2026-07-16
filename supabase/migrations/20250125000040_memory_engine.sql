-- Memory Engine: Conversation Sessions, Messages, Components, and Timeline Links
-- Creates tables for automated memory extraction from chat conversations

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Conversation Sessions Table
-- Groups chat message sessions for memory extraction
CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  title TEXT,
  summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation Messages Table
-- Stores individual chat turns (user/assistant) within sessions
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.conversation_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Memory Components Table
-- Stores sub-memories extracted from journal entries
CREATE TABLE IF NOT EXISTS public.memory_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN ('event', 'thought', 'reflection', 'decision', 'relationship_update', 'worldbuilding', 'lore_drop', 'timeline_marker')),
  text TEXT NOT NULL,
  characters_involved TEXT[] DEFAULT '{}',
  location TEXT,
  timestamp TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  importance_score INT DEFAULT 0 CHECK (importance_score >= 0 AND importance_score <= 10),
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timeline Links Table
-- Links memory components to the 9-level timeline hierarchy
CREATE TABLE IF NOT EXISTS public.timeline_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES public.memory_components(id) ON DELETE CASCADE,
  mythos_id UUID REFERENCES public.timeline_mythos(id) ON DELETE SET NULL,
  epoch_id UUID REFERENCES public.timeline_epochs(id) ON DELETE SET NULL,
  era_id UUID REFERENCES public.timeline_eras(id) ON DELETE SET NULL,
  saga_id UUID REFERENCES public.timeline_sagas(id) ON DELETE SET NULL,
  arc_id UUID REFERENCES public.timeline_arcs(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
  scene_id UUID REFERENCES public.timeline_scenes(id) ON DELETE SET NULL,
  action_id UUID REFERENCES public.timeline_actions(id) ON DELETE SET NULL,
  micro_action_id UUID REFERENCES public.timeline_microactions(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

-- Conversation Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_time ON public.conversation_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.conversation_sessions(user_id, started_at DESC) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.conversation_sessions(user_id);

-- Conversation Messages Indexes
CREATE INDEX IF NOT EXISTS idx_messages_session_time ON public.conversation_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.conversation_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_covering ON public.conversation_messages(session_id, created_at) INCLUDE (role, content);

-- Memory Components Indexes
CREATE INDEX IF NOT EXISTS idx_components_entry_type ON public.memory_components(journal_entry_id, component_type);
CREATE INDEX IF NOT EXISTS idx_components_entry_id ON public.memory_components(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_components_important ON public.memory_components(journal_entry_id, importance_score DESC) WHERE importance_score >= 7;
CREATE INDEX IF NOT EXISTS idx_components_type ON public.memory_components(component_type);
CREATE INDEX IF NOT EXISTS idx_components_timestamp ON public.memory_components(timestamp DESC) WHERE timestamp IS NOT NULL;

-- GIN Indexes for Array Fields
CREATE INDEX IF NOT EXISTS idx_components_characters_gin ON public.memory_components USING GIN(characters_involved);
CREATE INDEX IF NOT EXISTS idx_components_tags_gin ON public.memory_components USING GIN(tags);

-- IVFFlat Index for Vector Similarity Search
CREATE INDEX IF NOT EXISTS idx_components_embedding ON public.memory_components 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- Timeline Links Indexes
CREATE INDEX IF NOT EXISTS idx_timeline_component_id ON public.timeline_links(component_id);
CREATE INDEX IF NOT EXISTS idx_timeline_component_level ON public.timeline_links(component_id, arc_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_timeline_arc ON public.timeline_links(arc_id) WHERE arc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_chapter ON public.timeline_links(chapter_id) WHERE chapter_id IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_links ENABLE ROW LEVEL SECURITY;

-- Conversation Sessions RLS Policies
CREATE POLICY conversation_sessions_owner_select ON public.conversation_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY conversation_sessions_owner_insert ON public.conversation_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY conversation_sessions_owner_update ON public.conversation_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY conversation_sessions_owner_delete ON public.conversation_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Conversation Messages RLS Policies
CREATE POLICY conversation_messages_owner_select ON public.conversation_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY conversation_messages_owner_insert ON public.conversation_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY conversation_messages_owner_update ON public.conversation_messages
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY conversation_messages_owner_delete ON public.conversation_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Memory Components RLS Policies
CREATE POLICY memory_components_owner_select ON public.memory_components
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries 
      WHERE journal_entries.id = memory_components.journal_entry_id 
      AND journal_entries.user_id = auth.uid()
    )
  );
CREATE POLICY memory_components_owner_insert ON public.memory_components
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries 
      WHERE journal_entries.id = memory_components.journal_entry_id 
      AND journal_entries.user_id = auth.uid()
    )
  );
CREATE POLICY memory_components_owner_update ON public.memory_components
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries 
      WHERE journal_entries.id = memory_components.journal_entry_id 
      AND journal_entries.user_id = auth.uid()
    )
  );
CREATE POLICY memory_components_owner_delete ON public.memory_components
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries 
      WHERE journal_entries.id = memory_components.journal_entry_id 
      AND journal_entries.user_id = auth.uid()
    )
  );

-- Timeline Links RLS Policies
CREATE POLICY timeline_links_owner_select ON public.timeline_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.memory_components mc
      JOIN public.journal_entries je ON je.id = mc.journal_entry_id
      WHERE mc.id = timeline_links.component_id 
      AND je.user_id = auth.uid()
    )
  );
CREATE POLICY timeline_links_owner_insert ON public.timeline_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memory_components mc
      JOIN public.journal_entries je ON je.id = mc.journal_entry_id
      WHERE mc.id = timeline_links.component_id 
      AND je.user_id = auth.uid()
    )
  );
CREATE POLICY timeline_links_owner_update ON public.timeline_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.memory_components mc
      JOIN public.journal_entries je ON je.id = mc.journal_entry_id
      WHERE mc.id = timeline_links.component_id 
      AND je.user_id = auth.uid()
    )
  );
CREATE POLICY timeline_links_owner_delete ON public.timeline_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.memory_components mc
      JOIN public.journal_entries je ON je.id = mc.journal_entry_id
      WHERE mc.id = timeline_links.component_id 
      AND je.user_id = auth.uid()
    )
  );

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp for conversation_sessions
CREATE TRIGGER update_conversation_sessions_updated_at
  BEFORE UPDATE ON public.conversation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at timestamp for memory_components
CREATE TRIGGER update_memory_components_updated_at
  BEFORE UPDATE ON public.memory_components
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.conversation_sessions IS 'Groups chat message sessions for memory extraction';
COMMENT ON TABLE public.conversation_messages IS 'Stores individual chat turns (user/assistant) within sessions';
COMMENT ON TABLE public.memory_components IS 'Stores sub-memories extracted from journal entries';
COMMENT ON TABLE public.timeline_links IS 'Links memory components to the 9-level timeline hierarchy';

COMMENT ON COLUMN public.memory_components.component_type IS 'Type of memory component: event, thought, reflection, decision, relationship_update, worldbuilding, lore_drop, timeline_marker';
COMMENT ON COLUMN public.memory_components.importance_score IS 'Importance score from 0-10 for ranking and filtering';
COMMENT ON COLUMN public.memory_components.embedding IS 'Semantic embedding vector(1536) for similarity search';

