-- Recurring Threads / Themes
-- Threads group saga/arc nodes; relations model causality (paused_by, parallel_to, etc.).
-- Hierarchy (Epoch → Era → Saga → Arc → Chapter) unchanged.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- threads: identity-continuity labels (e.g. Omega1, Love Life, Triunfo)
CREATE TABLE IF NOT EXISTS public.threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('career','relationship','health','project','custom')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threads_user_id ON public.threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_category ON public.threads(user_id, category);

COMMENT ON TABLE public.threads IS 'Recurring themes/threads that group many saga/arc nodes. E.g. Omega1, Love Life, Triunfo.';

-- thread_memberships: many-to-many (thread ↔ saga/arc). App enforces node_id exists in timeline_sagas or timeline_arcs.
CREATE TABLE IF NOT EXISTS public.thread_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  node_id UUID NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('saga','arc')),
  role TEXT CHECK (role IN ('primary','secondary')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(thread_id, node_id, node_type)
);

CREATE INDEX IF NOT EXISTS idx_thread_memberships_thread_id ON public.thread_memberships(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_memberships_node ON public.thread_memberships(node_type, node_id);

COMMENT ON TABLE public.thread_memberships IS 'Links threads to timeline_sagas/timeline_arcs nodes. Polymorphic node_id; app validates existence.';

-- timeline_node_relations: causality / interaction between nodes (parallel_to, paused_by, etc.)
CREATE TABLE IF NOT EXISTS public.timeline_node_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL,
  from_node_type TEXT NOT NULL CHECK (from_node_type IN ('saga','arc')),
  to_node_id UUID NOT NULL,
  to_node_type TEXT NOT NULL CHECK (to_node_type IN ('saga','arc')),
  relation_type TEXT NOT NULL CHECK (relation_type IN ('parallel_to','paused_by','displaced_by','influenced_by')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_node_relations_user ON public.timeline_node_relations(user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_node_relations_from ON public.timeline_node_relations(from_node_id, from_node_type);
CREATE INDEX IF NOT EXISTS idx_timeline_node_relations_to ON public.timeline_node_relations(to_node_id, to_node_type);
CREATE INDEX IF NOT EXISTS idx_timeline_node_relations_type ON public.timeline_node_relations(user_id, relation_type);

COMMENT ON TABLE public.timeline_node_relations IS 'Causality between timeline nodes: paused_by, parallel_to, displaced_by, influenced_by. App validates node existence.';

-- RLS: threads
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own threads"
  ON public.threads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own threads"
  ON public.threads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own threads"
  ON public.threads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own threads"
  ON public.threads FOR DELETE
  USING (user_id = auth.uid());

-- RLS: thread_memberships (user-scoped via threads)
ALTER TABLE public.thread_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own thread memberships"
  ON public.thread_memberships FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_memberships.thread_id AND t.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own thread memberships"
  ON public.thread_memberships FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_memberships.thread_id AND t.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own thread memberships"
  ON public.thread_memberships FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_memberships.thread_id AND t.user_id = auth.uid())
  );

-- RLS: timeline_node_relations
ALTER TABLE public.timeline_node_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own timeline node relations"
  ON public.timeline_node_relations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own timeline node relations"
  ON public.timeline_node_relations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own timeline node relations"
  ON public.timeline_node_relations FOR DELETE
  USING (user_id = auth.uid());
