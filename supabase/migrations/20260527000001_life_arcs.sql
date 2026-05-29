-- life_arcs: named temporal containers inferred from event_candidate clusters
--
-- Sits above event_candidates in the continuity runtime stack:
--   resolved_events → event_candidates → life_arcs → arc_relationships
--
-- Arc types reflect the dominant semantic domain of the life period:
--   life_era  — "The College Years", "Post-breakup chapter"
--   skill     — "Learning to code", "Getting into photography"
--   location  — "Austin years", "Living in NYC"
--   work      — "Startup period", "Time at Google"
--   custom    — user-created or AI-assigned when no type fits
--
-- Arcs can be hierarchical (parent_id). A "College" life_era can contain
-- a "studying CS" skill arc and a "living in dorms" location arc.
--
-- source: 'inferred' | 'user_created'
--   inferred arcs are propositions from arcInferenceService
--   user_created arcs are canonical and never auto-deleted

CREATE TABLE IF NOT EXISTS public.life_arcs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title         TEXT        NOT NULL,
  arc_type      TEXT        NOT NULL DEFAULT 'life_era'
                            CHECK (arc_type IN ('life_era','skill','location','work','custom')),

  -- Hierarchical nesting: a work arc can live inside a life_era arc
  parent_id     UUID        REFERENCES public.life_arcs(id) ON DELETE SET NULL,

  start_date    DATE,
  end_date      DATE,

  -- True when this arc is currently ongoing (no end_date yet or explicitly set)
  is_active     BOOLEAN     NOT NULL DEFAULT false,

  -- AI-generated one-paragraph narrative summary of this period
  summary       TEXT,

  -- Confidence that this arc is real [0,1]
  --   < 0.5 → speculative, not shown to user
  --   ≥ 0.5 → visible on arc timeline
  --   ≥ 0.8 → used in system prompt continuity block
  confidence    FLOAT       NOT NULL DEFAULT 0.5,

  -- 'inferred' (from event_candidates) | 'user_created'
  source        TEXT        NOT NULL DEFAULT 'inferred'
                            CHECK (source IN ('inferred','user_created')),

  tags          TEXT[]      NOT NULL DEFAULT '{}',
  metadata      JSONB       NOT NULL DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_life_arcs_user
  ON public.life_arcs (user_id);

CREATE INDEX IF NOT EXISTS idx_life_arcs_user_type
  ON public.life_arcs (user_id, arc_type);

CREATE INDEX IF NOT EXISTS idx_life_arcs_dates
  ON public.life_arcs (user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_life_arcs_parent
  ON public.life_arcs (parent_id)
  WHERE parent_id IS NOT NULL;

-- ─── arc_memberships ─────────────────────────────────────────────────────────
-- Weighted, typed membership: which event_candidates belong to which arc.
-- importance_score captures centrality — not all scenes are equally defining.
-- role distinguishes defining moments from background noise.

CREATE TABLE IF NOT EXISTS public.arc_memberships (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  arc_id               UUID        NOT NULL REFERENCES public.life_arcs(id) ON DELETE CASCADE,
  event_candidate_id   UUID        NOT NULL REFERENCES public.event_candidates(id) ON DELETE CASCADE,

  -- How central is this scene to the arc? [0,1]
  --   1.0 = defining moment, 0.5 = background presence, 0.1 = peripheral
  importance_score     FLOAT       NOT NULL DEFAULT 0.5,

  -- Semantic role within the arc
  --   'defining_moment' | 'turning_point' | 'background' | 'transition' | null
  role                 TEXT        CHECK (role IN ('defining_moment','turning_point','background','transition')),

  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_arc_memberships_unique
  ON public.arc_memberships (arc_id, event_candidate_id);

CREATE INDEX IF NOT EXISTS idx_arc_memberships_arc
  ON public.arc_memberships (arc_id, importance_score DESC);

CREATE INDEX IF NOT EXISTS idx_arc_memberships_event
  ON public.arc_memberships (event_candidate_id);

-- ─── arc_relationships ────────────────────────────────────────────────────────
-- Causal/temporal graph between life arcs.
-- This is the narrative stitching layer — how life periods relate causally,
-- not just chronologically.
--
-- relationship_type semantics:
--   spawned    — Arc A gave rise to Arc B (college era → tech career)
--   influenced — Arc A shaped Arc B without replacing it (depression → values shift)
--   overlapped — Arc A and Arc B ran simultaneously
--   preceded   — Arc A ended before Arc B began (simple before/after)
--   merged     — Two separate arcs converged into one
--   split      — One arc diverged into two parallel arcs

CREATE TABLE IF NOT EXISTS public.arc_relationships (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source_arc_id       UUID        NOT NULL REFERENCES public.life_arcs(id) ON DELETE CASCADE,
  target_arc_id       UUID        NOT NULL REFERENCES public.life_arcs(id) ON DELETE CASCADE,

  relationship_type   TEXT        NOT NULL
                      CHECK (relationship_type IN ('spawned','influenced','overlapped','preceded','merged','split')),

  description         TEXT,

  -- Confidence that this relationship is real [0,1]
  confidence          FLOAT       NOT NULL DEFAULT 0.6,

  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT arc_relationships_no_self CHECK (source_arc_id <> target_arc_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_arc_relationships_unique
  ON public.arc_relationships (source_arc_id, target_arc_id, relationship_type);

-- Bidirectional traversal: find both "what spawned this?" and "what did this spawn?"
CREATE INDEX IF NOT EXISTS idx_arc_relationships_source
  ON public.arc_relationships (source_arc_id);

CREATE INDEX IF NOT EXISTS idx_arc_relationships_target
  ON public.arc_relationships (target_arc_id);

CREATE INDEX IF NOT EXISTS idx_arc_relationships_user
  ON public.arc_relationships (user_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.life_arcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own arcs"
  ON public.life_arcs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own arcs"
  ON public.life_arcs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own arcs"
  ON public.life_arcs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own arcs"
  ON public.life_arcs FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to life_arcs"
  ON public.life_arcs USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own arc memberships"
  ON public.arc_memberships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own arc memberships"
  ON public.arc_memberships FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own arc memberships"
  ON public.arc_memberships FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own arc memberships"
  ON public.arc_memberships FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to arc_memberships"
  ON public.arc_memberships USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own arc relationships"
  ON public.arc_relationships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own arc relationships"
  ON public.arc_relationships FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own arc relationships"
  ON public.arc_relationships FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own arc relationships"
  ON public.arc_relationships FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to arc_relationships"
  ON public.arc_relationships USING (auth.role() = 'service_role');

-- ─── updated_at triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_life_arcs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER life_arcs_updated_at
  BEFORE UPDATE ON public.life_arcs
  FOR EACH ROW EXECUTE FUNCTION public.set_life_arcs_updated_at();
