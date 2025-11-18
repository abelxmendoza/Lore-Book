-- Timeline Hierarchy System Migration
-- Creates 9-layer hierarchy: Mythos → Epochs → Eras → Sagas → Arcs → Chapters → Scenes → Actions → MicroActions

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Mythos (top level - no parent)
CREATE TABLE IF NOT EXISTS public.timeline_mythos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_mythos_user_id_idx ON public.timeline_mythos(user_id);
CREATE INDEX IF NOT EXISTS timeline_mythos_dates_idx ON public.timeline_mythos(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_mythos_tags_idx ON public.timeline_mythos USING GIN(tags);

-- Epochs (parent: Mythos)
CREATE TABLE IF NOT EXISTS public.timeline_epochs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.timeline_mythos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_epochs_user_id_idx ON public.timeline_epochs(user_id);
CREATE INDEX IF NOT EXISTS timeline_epochs_parent_id_idx ON public.timeline_epochs(parent_id);
CREATE INDEX IF NOT EXISTS timeline_epochs_dates_idx ON public.timeline_epochs(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_epochs_tags_idx ON public.timeline_epochs USING GIN(tags);

-- Eras (parent: Epoch)
CREATE TABLE IF NOT EXISTS public.timeline_eras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.timeline_epochs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_eras_user_id_idx ON public.timeline_eras(user_id);
CREATE INDEX IF NOT EXISTS timeline_eras_parent_id_idx ON public.timeline_eras(parent_id);
CREATE INDEX IF NOT EXISTS timeline_eras_dates_idx ON public.timeline_eras(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_eras_tags_idx ON public.timeline_eras USING GIN(tags);

-- Sagas (parent: Era)
CREATE TABLE IF NOT EXISTS public.timeline_sagas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.timeline_eras(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_sagas_user_id_idx ON public.timeline_sagas(user_id);
CREATE INDEX IF NOT EXISTS timeline_sagas_parent_id_idx ON public.timeline_sagas(parent_id);
CREATE INDEX IF NOT EXISTS timeline_sagas_dates_idx ON public.timeline_sagas(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_sagas_tags_idx ON public.timeline_sagas USING GIN(tags);

-- Arcs (parent: Saga)
CREATE TABLE IF NOT EXISTS public.timeline_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.timeline_sagas(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_arcs_user_id_idx ON public.timeline_arcs(user_id);
CREATE INDEX IF NOT EXISTS timeline_arcs_parent_id_idx ON public.timeline_arcs(parent_id);
CREATE INDEX IF NOT EXISTS timeline_arcs_dates_idx ON public.timeline_arcs(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_arcs_tags_idx ON public.timeline_arcs USING GIN(tags);

-- Chapters (parent: Arc) - Note: This extends the existing chapters table
-- We'll add parent_id and link it to timeline_arcs if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chapters' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE public.chapters ADD COLUMN parent_id UUID REFERENCES public.timeline_arcs(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS chapters_parent_id_idx ON public.chapters(parent_id);
  END IF;
END $$;

-- Scenes (parent: Chapter)
CREATE TABLE IF NOT EXISTS public.timeline_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_scenes_user_id_idx ON public.timeline_scenes(user_id);
CREATE INDEX IF NOT EXISTS timeline_scenes_parent_id_idx ON public.timeline_scenes(parent_id);
CREATE INDEX IF NOT EXISTS timeline_scenes_dates_idx ON public.timeline_scenes(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_scenes_tags_idx ON public.timeline_scenes USING GIN(tags);

-- Actions (parent: Scene)
CREATE TABLE IF NOT EXISTS public.timeline_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.timeline_scenes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_actions_user_id_idx ON public.timeline_actions(user_id);
CREATE INDEX IF NOT EXISTS timeline_actions_parent_id_idx ON public.timeline_actions(parent_id);
CREATE INDEX IF NOT EXISTS timeline_actions_dates_idx ON public.timeline_actions(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_actions_tags_idx ON public.timeline_actions USING GIN(tags);

-- MicroActions (parent: Action)
CREATE TABLE IF NOT EXISTS public.timeline_microactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.timeline_actions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('import', 'manual', 'ai')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_microactions_user_id_idx ON public.timeline_microactions(user_id);
CREATE INDEX IF NOT EXISTS timeline_microactions_parent_id_idx ON public.timeline_microactions(parent_id);
CREATE INDEX IF NOT EXISTS timeline_microactions_dates_idx ON public.timeline_microactions(start_date, end_date);
CREATE INDEX IF NOT EXISTS timeline_microactions_tags_idx ON public.timeline_microactions USING GIN(tags);

-- Timeline search index for full-text search across all layers
CREATE TABLE IF NOT EXISTS public.timeline_search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  layer_type TEXT NOT NULL CHECK (layer_type IN ('mythos', 'epoch', 'era', 'saga', 'arc', 'chapter', 'scene', 'action', 'microaction')),
  layer_id UUID NOT NULL,
  search_text TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_search_index_user_id_idx ON public.timeline_search_index(user_id);
CREATE INDEX IF NOT EXISTS timeline_search_index_layer_idx ON public.timeline_search_index(layer_type, layer_id);
CREATE INDEX IF NOT EXISTS timeline_search_index_text_idx ON public.timeline_search_index USING GIN(to_tsvector('english', search_text));
CREATE INDEX IF NOT EXISTS timeline_search_index_tags_idx ON public.timeline_search_index USING GIN(tags);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at on all timeline tables
CREATE TRIGGER update_timeline_mythos_updated_at BEFORE UPDATE ON public.timeline_mythos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_epochs_updated_at BEFORE UPDATE ON public.timeline_epochs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_eras_updated_at BEFORE UPDATE ON public.timeline_eras FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_sagas_updated_at BEFORE UPDATE ON public.timeline_sagas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_arcs_updated_at BEFORE UPDATE ON public.timeline_arcs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_scenes_updated_at BEFORE UPDATE ON public.timeline_scenes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_actions_updated_at BEFORE UPDATE ON public.timeline_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_microactions_updated_at BEFORE UPDATE ON public.timeline_microactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

